"""MySQL persistence for the local prototype. File contents remain on disk."""
from contextlib import contextmanager
from datetime import datetime, timezone
import json
import hashlib
import mimetypes
import os
from pathlib import Path
import re

import pymysql
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT.parents[1] / 'work/mysql/.env'


def encode(value):
    return json.dumps(value, ensure_ascii=False)


def timestamp(value=None):
    return datetime.fromtimestamp(value, timezone.utc).replace(tzinfo=None) if value is not None else datetime.now(timezone.utc).replace(tzinfo=None)


class Database:
    def __init__(self, config=None, root=ROOT):
        self.root = Path(root)
        if config is not None:
            self.config = config
        else:
            values = dict(line.split('=', 1) for line in CONFIG.read_text().splitlines() if '=' in line and not line.startswith('#')) if CONFIG.exists() else {}
            self.config = dict(host=os.environ.get('DB_HOST', '127.0.0.1'), port=int(os.environ.get('DB_PORT', '3306')),
                               user=os.environ.get('DB_USER', values.get('MYSQL_USER', 'wuyin')),
                               password=os.environ.get('DB_PASSWORD', values.get('MYSQL_PASSWORD', '')),
                               database=os.environ.get('DB_NAME', values.get('MYSQL_DATABASE', 'wuyin')))

    @contextmanager
    def transaction(self):
        connection = pymysql.connect(**self.config, charset='utf8mb4', cursorclass=pymysql.cursors.DictCursor,
                                     connect_timeout=5, read_timeout=15, write_timeout=15, init_command="SET time_zone='+00:00'")
        try:
            with connection.cursor() as cursor:
                yield cursor
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def session_user(self, token):
        if not token or not re.fullmatch(r'[A-Za-z0-9_-]{43}',token):
            return None
        digest=hashlib.sha256(token.encode()).hexdigest()
        with self.transaction() as c:
            c.execute('SELECT u.id,u.username FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=%s AND s.expires_at>UTC_TIMESTAMP(3)',(digest,))
            return c.fetchone()

    def user(self, username):
        with self.transaction() as c:
            c.execute('SELECT * FROM users WHERE username=%s', (username,))
            return c.fetchone()

    def register(self, username, salt, digest):
        try:
            with self.transaction() as c:
                c.execute('INSERT INTO users(username,password_salt,password_hash) VALUES (%s,%s,%s)', (username, salt, digest))
                return {'id': c.lastrowid, 'username': username}
        except pymysql.err.IntegrityError as error:
            if error.args[0] == 1062:
                raise ValueError('用户名已存在，请直接登录。') from None
            raise

    def create_project(self, user_id, name):
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 128:
            raise ValueError('项目名称需为1–128个字符。')
        with self.transaction() as c:
            c.execute('INSERT INTO projects(user_id,name,is_sample) VALUES (%s,%s,0)', (user_id,name.strip()))
            return {'id':c.lastrowid,'name':name.strip()}

    def project_list(self, user_id):
        with self.transaction() as c:
            c.execute('''SELECT p.id,p.name,p.updated_at,p.is_sample,
                         (SELECT COUNT(*) FROM render_versions v WHERE v.project_id=p.id) AS version_count,
                         (SELECT COUNT(*) FROM model_tasks t WHERE t.project_id=p.id AND t.status IN ('queued','running')) AS running_count,
                         (SELECT a.storage_path FROM render_versions v JOIN assets a ON a.id=v.image_asset_id
                          WHERE v.project_id=p.id ORDER BY v.version_no DESC LIMIT 1) AS cover
                         FROM projects p WHERE p.user_id=%s ORDER BY p.updated_at DESC,p.id DESC''', (user_id,))
            return [{'id':r['id'],'name':r['name'],'isSample':bool(r['is_sample']),'versions':r['version_count'],
                     'status':'生成中' if r['running_count'] else '已生成' if r['version_count'] else '草稿',
                     'cover':r['cover'],'updated':r['updated_at'].replace(tzinfo=timezone.utc).isoformat()}
                    for r in c.fetchall()]

    def project(self, c, user_id, project_id=None):
        if project_id is not None:
            c.execute('SELECT * FROM projects WHERE id=%s AND user_id=%s FOR UPDATE',(project_id,user_id))
            project=c.fetchone()
            if not project:
                raise ValueError('项目不存在或无权访问。')
            return project
        # Legacy import compatibility; HTTP requests always specify a project ID.
        c.execute('SELECT id FROM users WHERE id=%s FOR UPDATE', (user_id,))
        if not c.fetchone():
            raise ValueError('账号不存在。')
        c.execute('SELECT * FROM projects WHERE user_id=%s ORDER BY id LIMIT 1 FOR UPDATE', (user_id,))
        project = c.fetchone()
        if project:
            return project
        c.execute("INSERT INTO projects(user_id,name,area_sqm,is_sample) VALUES (%s,'无垠 · 住宅设计',129,1)", (user_id,))
        ident=c.lastrowid
        references=self.root/'public/assets/references.json'
        if references.exists():
            for ref in json.loads(references.read_text()):
                if ref.get('collectionId','wuyin') != 'wuyin':
                    continue
                asset_id=self.asset(c,ident,ref['url'],'reference',ref['name'])
                c.execute('UPDATE assets SET reference_room=%s WHERE id=%s',(ref.get('room'),asset_id))
        return {'id': ident, 'user_id': user_id, 'name':'无垠 · 住宅设计','workspace_draft': None}

    def file(self, url):
        if not isinstance(url, str):
            raise ValueError('图片路径无效。')
        if url.startswith('/assets/'):
            base, suffix = self.root / 'public/assets', url[8:]
        elif url.startswith('/outputs/'):
            base, suffix = self.root / 'outputs', url[9:]
        else:
            raise ValueError('图片来源不受支持。')
        path = (base / suffix).resolve()
        if not path.is_relative_to(base.resolve()) or not path.is_file():
            raise ValueError('图片不存在。')
        return path

    def asset(self, c, project_id, url, kind='reference', name=None, allow_new=False):
        path = self.file(url)
        c.execute('SELECT id FROM assets WHERE project_id=%s AND BINARY storage_path=%s LIMIT 1', (project_id, url))
        row = c.fetchone()
        if row:
            return row['id']
        if url.startswith('/outputs/') and not allow_new:
            raise ValueError('无权访问此图片。')
        width = height = None
        if path.suffix.lower() != '.pdf':
            with Image.open(path) as image:
                width, height = image.size
        c.execute('''INSERT INTO assets(project_id,kind,original_name,storage_path,mime_type,byte_size,width_px,height_px,is_human_reference)
                     VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)''',
                  (project_id, kind, (name or path.name)[:255], url, mimetypes.guess_type(path.name)[0] or 'application/octet-stream',
                   path.stat().st_size, width, height, kind == 'reference' and url.startswith(('/assets/reference-','/assets/collections/'))))
        return c.lastrowid

    def add_assets(self, user_id, urls, name, kind='plan_page', parent=None, project_id=None):
        with self.transaction() as c:
            project = self.project(c, user_id, project_id)
            original = self.asset(c, project['id'], parent, 'plan_original', name, True) if parent else None
            for i, url in enumerate(urls):
                ident = self.asset(c, project['id'], url, kind, name, True)
                if original:
                    c.execute('UPDATE assets SET parent_asset_id=%s,page_number=%s WHERE id=%s', (original, i + 1, ident))

    def allowed(self, user_id, url):
        with self.transaction() as c:
            c.execute('SELECT a.id FROM assets a JOIN projects p ON p.id=a.project_id WHERE p.user_id=%s AND BINARY a.storage_path=%s LIMIT 1', (user_id, url))
            return bool(c.fetchone())

    def room(self, c, project_id, user_id, source_id, room, height='', confirmed=False):
        r = room['rect']
        if not all(isinstance(r[k], (int, float)) and 0 <= r[k] <= 1 for k in ('x','y','w','h')) or min(r['w'], r['h']) < .01 or r['x']+r['w'] > 1.000001 or r['y']+r['h'] > 1.000001:
            raise ValueError('房间范围无效。')
        camera = room.get('camera', {'x': .5, 'y': .8, 'angle': 270})
        angle = int((float(camera['angle']) % 360 + 22.5) // 45 * 45) % 360
        x, y = float(camera['x']), float(camera['y'])
        if not 0 <= x <= 1 or not 0 <= y <= 1:
            raise ValueError('摄像机位置无效。')
        height_value = float(height) if re.fullmatch(r'\d+(\.\d+)?', str(height).strip()) else None
        if height_value is not None and not 0 < height_value <= 999.99:
            raise ValueError('层高超出有效范围。')
        for key in ('length','width'):
            value=room.get(key)
            if value not in (None,''):
                try:
                    valid=not isinstance(value,bool) and .1 <= float(value) <= 100
                except (ValueError,TypeError):
                    valid=False
                if not valid:
                    raise ValueError('房间长宽须为 0.1 至 100 米的数值。')
        ident = room.get('_dbId')
        c.execute('SELECT id FROM rooms WHERE id=%s AND project_id=%s AND plan_asset_id=%s', (ident, project_id, source_id))
        if not c.fetchone():
            c.execute('INSERT INTO rooms(project_id,plan_asset_id,name,rect_x,rect_y,rect_w,rect_h,structure_notes) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)',
                      (project_id, source_id, str(room['name'])[:64], r['x'],r['y'],r['w'],r['h'],room.get('structure','')))
            ident = c.lastrowid
        c.execute('''UPDATE rooms SET name=%s,recognition_source=%s,rect_x=%s,rect_y=%s,rect_w=%s,rect_h=%s,
                     structure_notes=%s,dimensions_notes=%s,ceiling_height_m=%s,camera_x=%s,camera_y=%s,camera_angle=%s,
                     confirmed_by=%s,confirmed_at=%s WHERE id=%s''',
                  (str(room['name'])[:64],room.get('_recognition','manual'),r['x'],r['y'],r['w'],r['h'],room.get('structure',''),room.get('dimensions'),height_value,x,y,angle,
                   user_id if confirmed else None,timestamp() if confirmed else None,ident))
        room['_dbId'] = ident
        room['camera'] = {'x': x, 'y': y, 'angle': angle}
        return ident

    def versions(self, c, project_id):
        c.execute('''SELECT v.*,a.storage_path,a.width_px,a.height_px,t.request_snapshot,t.created_at AS submitted,t.finished_at,p.task_id AS parent_task
                     FROM render_versions v JOIN assets a ON a.id=v.image_asset_id JOIN model_tasks t ON t.id=v.task_id
                     LEFT JOIN render_versions p ON p.id=v.parent_version_id WHERE v.project_id=%s ORDER BY v.version_no''', (project_id,))
        labels={'plan_generate':'平面图生成','local_edit':'局部重绘','restyle':'全图换风格','human_reference_edit':'人工图编辑'}
        return [{'id':v['task_id'],'url':v['storage_path'],'name':v['name'],'style':v['style_name'],'origin':labels[v['origin']],
                 'time':v['created_at'].replace(tzinfo=timezone.utc).timestamp()*1000,
                 'outputSize':f"{v['width_px']}x{v['height_px']}" if v['width_px'] and v['height_px'] else None,
                 'outputQuality':json.loads(v['request_snapshot']).get('outputQuality','medium'),
                 'seconds':round((v['finished_at']-v['submitted']).total_seconds()) if v['finished_at'] else None,'parent':v['parent_task']}
                for v in c.fetchall()]

    def workspace(self, user_id, project_id=None):
        with self.transaction() as c:
            project = self.project(c,user_id,project_id)
            state = json.loads(project['workspace_draft']) if project['workspace_draft'] else None
            if state is not None:
                state.update(projectId=project['id'],projectName=project['name'])
                state['versions'] = self.versions(c,project['id'])
                if state.get('job',{}):
                    previous_status=state['job'].get('status')
                    c.execute('SELECT * FROM model_tasks WHERE project_id=%s AND (id=%s OR request_id=%s)',
                              (project['id'],state['job'].get('id'),state['job'].get('requestId')))
                    row=c.fetchone()
                    if row:
                        state['job']={**self.job_dict(row), 'context':state['job'].get('context')}
                        if row['status']=='completed' and previous_status!='completed':
                            if row['action']=='analyze':
                                state.update(rooms=state['job'].get('rooms',[]),roomIndex=0,recognized=True,confirmed=False,step=1,tab='plan')
                                if state['rooms']:
                                    state['camera']=state['rooms'][0]['camera']
                            else:
                                state['selectedVersion']=next((i for i,v in enumerate(state['versions']) if v['id']==row['id']),-1)
                                state.update(step=4,tab='result',selection=None)
            return state if state is not None else {'projectId':project['id'],'projectName':project['name'],'source':None,'rooms':[],'versions':self.versions(c,project['id'])}

    def save_workspace(self, user_id, state, importing=False):
        state = json.loads(encode(state))
        with self.transaction() as c:
            project = self.project(c,user_id,state.get('projectId'))
            state.update(projectId=project['id'],projectName=project['name'])
            if not state.get('source'):
                if state.get('rooms'):
                    raise ValueError('请先上传平面图。')
                state['versions']=self.versions(c,project['id'])
                c.execute('UPDATE projects SET workspace_draft=%s WHERE id=%s',(encode(state),project['id']))
                return state
            plan = self.asset(c,project['id'],state['source'],'plan_page',state.get('sourceName'),importing)
            for key in ('reference',):
                if state.get(key):
                    self.asset(c,project['id'],state[key],allow_new=importing)
            previous = json.loads(project['workspace_draft']) if project['workspace_draft'] else {}
            old_rooms = previous.get('rooms', []) if previous.get('source') == state['source'] else []
            for i,room in enumerate(state.get('rooms',[])):
                if not room.get('_dbId') and i < len(old_rooms):
                    room['_dbId'] = old_rooms[i].get('_dbId')
                room['_recognition']='sample' if state.get('isSample') else 'ai' if state.get('recognized') else 'manual'
                self.room(c,project['id'],user_id,plan,room,state.get('height',''),bool(state.get('confirmed') and i==state.get('roomIndex')))
            versions=self.versions(c,project['id'])
            old_versions=state.get('versions',[])
            selected=state.get('selectedVersion',-1)
            selected_id=old_versions[selected].get('id') if isinstance(selected,int) and 0 <= selected < len(old_versions) else None
            state['selectedVersion']=next((i for i,v in enumerate(versions) if v['id']==selected_id),-1)
            state['versions']=versions
            for task_id,review in state.get('review',{}).items():
                c.execute('SELECT id FROM render_versions WHERE project_id=%s AND task_id=%s',(project['id'],task_id))
                version=c.fetchone()
                if version:
                    flags=[bool(review[str(k)]) if str(k) in review else None for k in range(4)]
                    note_data={key:review[key] for key in ('tags','overall','comment') if key in review}
                    notes=encode(note_data) if note_data else None
                    c.execute('''INSERT INTO version_reviews(version_id,reviewer_id,structure_preserved,layout_preserved,usable_for_client,edit_region_preserved,notes)
                                 VALUES (%s,%s,%s,%s,%s,%s,%s) ON DUPLICATE KEY UPDATE structure_preserved=COALESCE(VALUES(structure_preserved),structure_preserved),layout_preserved=COALESCE(VALUES(layout_preserved),layout_preserved),usable_for_client=COALESCE(VALUES(usable_for_client),usable_for_client),edit_region_preserved=COALESCE(VALUES(edit_region_preserved),edit_region_preserved),notes=COALESCE(VALUES(notes),notes)''',
                              (version['id'],user_id,*flags,notes))
            c.execute('UPDATE projects SET workspace_draft=%s,is_sample=%s WHERE id=%s',(encode(state),bool(state.get('isSample')),project['id']))
        return state

    @staticmethod
    def job_dict(row):
        data=json.loads(row['request_snapshot'])
        job={'id':row['id'],'projectId':row['project_id'],'userId':row['requested_by'],'requestId':row['request_id'],
             'request':data,'kind':'analyze' if row['action']=='analyze' else 'image','status':row['status'],
             'stage':row['stage'],'created':row['created_at'].replace(tzinfo=timezone.utc).timestamp()}
        if row['result_snapshot']:
            job.update(json.loads(row['result_snapshot']))
        if row['finished_at']:
            job['finished']=row['finished_at'].replace(tzinfo=timezone.utc).timestamp()
        if row['error_message']:
            job['error']=row['error_message']
        return job

    def job(self, user_id, job_id):
        with self.transaction() as c:
            c.execute('SELECT * FROM model_tasks WHERE requested_by=%s AND id=%s',(user_id,job_id))
            row=c.fetchone()
            return self.job_dict(row) if row else None

    def jobs(self):
        with self.transaction() as c:
            c.execute('SELECT * FROM model_tasks')
            return [self.job_dict(row) for row in c.fetchall()]

    def new_job(self, user_id, job):
        data=job['request']
        with self.transaction() as c:
            project=self.project(c,user_id,data.get('projectId'))
            c.execute('SELECT * FROM model_tasks WHERE project_id=%s AND request_id=%s',(project['id'],job['requestId']))
            old=c.fetchone()
            if old:
                return self.job_dict(old),False
            action='analyze' if job['kind']=='analyze' else data.get('action','generate')
            if data.get('parentVersionId'):
                c.execute('SELECT id FROM render_versions WHERE task_id=%s AND project_id=%s',(data['parentVersionId'],project['id']))
                if not c.fetchone():
                    raise ValueError('父版本不属于当前项目。')
            source=self.asset(c,project['id'],data['source'],'plan_page' if action in ('generate','analyze') else 'reference')
            ref=self.asset(c,project['id'],data['reference']) if data.get('reference') else None
            room_id=None
            if action=='generate':
                room={'name':data.get('room','房间'),'rect':data['roomRect'],'structure':data.get('structure',''),
                      'camera':data.get('cameraSettings',{'x':.5,'y':.8,'angle':270}),'_dbId':data.get('roomId')}
                room_id=self.room(c,project['id'],user_id,source,room,data.get('height',''),data.get('confirmed',False))
            c.execute('''INSERT INTO model_tasks(id,project_id,requested_by,request_id,room_id,source_asset_id,reference_asset_id,action,status,stage,request_snapshot,consented_at,created_at)
                         VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''',
                      (job['id'],project['id'],user_id,job['requestId'],room_id,source,ref,action,job['status'],job.get('stage'),encode(data),timestamp(job['created']),timestamp(job['created'])))
            job.update(projectId=project['id'],userId=user_id)
            return job,True

    def save_job(self, job):
        with self.transaction() as c:
            c.execute('SELECT * FROM model_tasks WHERE id=%s FOR UPDATE',(job['id'],))
            row=c.fetchone()
            if not row:
                raise ValueError('任务未入库。')
            result={k:job[k] for k in ('image','rooms','usage','diagnostic','outputSize','outputQuality') if k in job}
            c.execute('UPDATE model_tasks SET status=%s,stage=%s,result_snapshot=%s,error_message=%s,diagnostic=%s,started_at=COALESCE(started_at,%s),finished_at=%s WHERE id=%s',
                      (job['status'],job.get('stage'),encode(result),job.get('error'),encode(job.get('diagnostic')),timestamp() if job['status']=='running' else None,
                       timestamp(job['finished']) if job.get('finished') else None,job['id']))
            if job['status']!='completed' or not job.get('image'):
                return
            # Lock project before allocating sequential version numbers.
            c.execute('SELECT id FROM projects WHERE id=%s FOR UPDATE',(row['project_id'],))
            c.execute('SELECT id FROM render_versions WHERE task_id=%s',(job['id'],))
            if c.fetchone():
                return
            c.execute('UPDATE projects SET updated_at=UTC_TIMESTAMP(3) WHERE id=%s',(row['project_id'],))
            image=self.asset(c,row['project_id'],job['image'],'generated',allow_new=True)
            parent=None
            parent_task=json.loads(row['request_snapshot']).get('parentVersionId')
            if not parent_task and row['action'] in ('edit','restyle'):
                c.execute('SELECT id FROM render_versions WHERE project_id=%s AND image_asset_id=%s',(row['project_id'],row['source_asset_id']))
                parent=c.fetchone()
            if parent_task:
                c.execute('SELECT id FROM render_versions WHERE project_id=%s AND task_id=%s',(row['project_id'],parent_task))
                parent=c.fetchone()
                if not parent:
                    raise ValueError('父版本不属于当前项目。')
            c.execute('SELECT COALESCE(MAX(version_no),0)+1 AS n FROM render_versions WHERE project_id=%s',(row['project_id'],))
            number=c.fetchone()['n']
            data=job['request']
            origin='plan_generate' if row['action']=='generate' else 'human_reference_edit' if data['source'].startswith('/assets/') else 'local_edit' if row['action']=='edit' else 'restyle'
            c.execute('''INSERT INTO render_versions(project_id,room_id,task_id,image_asset_id,parent_version_id,version_no,name,style_name,origin,created_at)
                         VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''',
                      (row['project_id'],row['room_id'],job['id'],image,parent['id'] if parent else None,number,f'V{number:02d}',data.get('style'),origin,timestamp(job.get('finished',job['created']))))

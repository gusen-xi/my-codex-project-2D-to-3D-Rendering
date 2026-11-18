"""Local integration checks: isolated MySQL database, no model calls."""
import base64
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
import io
import os
import sys
from concurrent.futures import ThreadPoolExecutor
import time
import uuid
import pymysql
import http.cookiejar
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest.mock import patch
from PIL import Image, ImageChops
from server import app as server
from mysql_support import test_database

class PrototypeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(dir=server.WORK)
        cls.root = Path(cls.temp.name)
        cls.output = cls.root / 'outputs'
        for folder in ['uploads', 'generated', 'jobs']:
            (cls.output / folder).mkdir(parents=True)
        (cls.root/'public').mkdir()
        (cls.root/'public/assets').symlink_to(server.PUBLIC/'assets',target_is_directory=True)
        cls.db,cls.admin,cls.database_name=test_database(cls.root)
        cls.patches = [patch.object(server, 'OUTPUT', cls.output), patch.object(server, 'WORK', cls.root), patch.object(server,'DB',cls.db)]
        for p in cls.patches:
            p.start()
        cls.http = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        threading.Thread(target=cls.http.serve_forever, daemon=True).start()
        cls.base = f'http://127.0.0.1:{cls.http.server_port}'
        cls.client,cls.user=cls.authenticated_client('test_designer')

    @classmethod
    def authenticated_client(cls,name):
        user=cls.db.register(name,'test-salt',server.password_hash('testpass123','test-salt')[1])
        token=secrets.token_urlsafe(32)
        with cls.db.transaction() as c:
            c.execute('INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES (%s,%s,%s)',
                      (hashlib.sha256(token.encode()).hexdigest(),user['id'],datetime.now(timezone.utc).replace(tzinfo=None)+timedelta(days=1)))
        client=urllib.request.build_opener()
        client.addheaders=[('Authorization','Bearer '+token)]
        client.project_id=cls.db.create_project(user['id'],name+'的项目')['id']
        return client,user

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()
        cls.http.server_close()
        for p in cls.patches:
            p.stop()
        with cls.admin.transaction() as c:
            c.execute(f'DROP DATABASE `{cls.database_name}`')
        server.JOBS.clear()
        cls.temp.cleanup()

    def post(self, route, data, origin=None, client=None):
        active=client or self.client
        if route in ('/api/workspace','/api/upload','/api/generate','/api/analyze') and hasattr(active,'project_id'):
            data={'projectId':active.project_id,**data}
        headers = {'Content-Type': 'application/json'}
        if origin:
            headers['Origin'] = origin
        request = urllib.request.Request(self.base + route, data=json.dumps(data).encode(), headers=headers)
        try:
            with (client or self.client).open(request) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as error:
            return error.code, json.load(error)

    def image_bytes(self):
        buf = io.BytesIO()
        Image.new('RGB', (120, 80), 'white').save(buf, format='PNG')
        return buf.getvalue()

    def test_demo_quota_concurrency_idempotency_and_restart(self):
        from server.database import Database
        _,user=self.authenticated_client('demo_quota')
        projects=[self.db.create_project(user['id'],'quota '+str(i))['id'] for i in range(2)]
        def job(project,kind='image'):
            ident=uuid.uuid4().hex
            return {'id':ident,'requestId':ident,'created':time.time(),'status':'queued','kind':kind,
                    'request':{'projectId':project,'source':'/assets/plan.jpg','action':'restyle'}}
        candidates=[job(project) for project in projects]
        gate=threading.Barrier(2)
        def submit(candidate):
            gate.wait()
            try:
                return self.db.new_job(user['id'],candidate)
            except ValueError:
                return None
        with patch.dict(os.environ,{'DEMO_MODE':'1'}):
            with ThreadPoolExecutor(max_workers=2) as pool:
                results=list(pool.map(submit,candidates))
            self.assertEqual(sum(result is not None for result in results),1)
            accepted=next(result[0] for result in results if result)
            self.assertFalse(self.db.new_job(user['id'],accepted)[1])
            accepted.update(status='failed',error='test failure')
            self.db.save_job(accepted)
            restarted=Database(self.db.config.copy(),root=self.root)
            with self.assertRaises(ValueError):
                restarted.new_job(user['id'],job(projects[1]))
            self.assertTrue(restarted.new_job(user['id'],job(projects[0],'analyze'))[1])
            with self.assertRaises(ValueError):
                restarted.new_job(user['id'],job(projects[1],'analyze'))

    def test_cloud_files_survive_restart_and_reject_external_paths(self):
        from server.database import Database
        sys.path.insert(0,str(Path(__file__).resolve().parents[3]))
        from deployment.cloud_init import initialize
        with patch.dict(os.environ,{'CLOUD_FILES':'1','DEMO_MODE':'0','DEMO_ACCOUNTS':'[]'}):
            initialize(self.db)
            target=self.output/'generated'/'durable.png'
            raw=secrets.token_bytes(1024*1024+123)
            target.write_bytes(raw)
            self.db.persist_file(target)
            target.unlink()
            restarted=Database(self.db.config.copy(),root=self.root)
            restarted.restore_file(target)
            self.assertEqual(target.read_bytes(),raw)
            with self.assertRaises(ValueError):
                restarted.persist_file(self.root/'outside.png')

    def test_generation_specs_validation(self):
        self.assertEqual(server.generation_specs({'outputSize':'1024x1536','outputQuality':'high','roomLength':'5.2','roomWidth':3.6}), ('1024x1536','high','长5.2米；宽3.6米'))
        for data in ({'outputSize':'4K'},{'outputQuality':'ultra'},{'roomLength':-1},{'roomWidth':True},{'roomLength':'nan'},{'roomWidth':'wrong'}):
            with self.assertRaises(ValueError):
                server.generation_specs(data)
        self.assertIn('长未知',server.generation_specs({})[2])
        bad={'source':'/assets/plan.jpg','consent':True,'requestId':str(uuid.uuid4()),'confirmed':True,'roomRect':{'x':.1,'y':.1,'w':.4,'h':.4},'outputSize':'4K'}
        self.assertEqual(self.post('/api/generate',bad)[0],400)

    def test_room_dimensions_and_specs_draft_roundtrip(self):
        client,_=self.authenticated_client('dimension_test')
        room={'name':'客厅','rect':{'x':.1,'y':.1,'w':.4,'h':.4},'structure':'保留门窗','dimensions':'净尺寸','length':'5.2','width':'3.6','camera':{'x':.5,'y':.8,'angle':270}}
        state={'source':'/assets/plan.jpg','rooms':[room],'outputSize':'1024x1536','outputQuality':'high'}
        self.assertEqual(self.post('/api/workspace',state,client=client)[0],200)
        with client.open(self.base+f'/api/workspace?projectId={client.project_id}') as response:
            saved=json.load(response)
        self.assertEqual(saved['rooms'][0]['length'],'5.2')
        self.assertEqual(saved['rooms'][0]['width'],'3.6')
        self.assertEqual(saved['outputSize'],'1024x1536')
        self.assertEqual(saved['outputQuality'],'high')
        state['rooms'][0]['width']='-5'
        self.assertEqual(self.post('/api/workspace',state,client=client)[0],400)
        with client.open(self.base+f'/api/workspace?projectId={client.project_id}') as response:
            self.assertEqual(json.load(response)['rooms'][0]['width'],'3.6')

    def test_avatar_persistence_validation_and_account_isolation(self):
        client,user=self.authenticated_client('avatar_test')
        with client.open(self.base+'/api/profile') as response:
            self.assertIsNone(json.load(response)['avatar'])
        self.assertEqual(self.post('/api/profile/avatar',{'data':base64.b64encode(b'not an image').decode()},client=client)[0],400)
        status,result=self.post('/api/profile/avatar',{'data':base64.b64encode(self.image_bytes()).decode()},client=client)
        self.assertEqual(status,200)
        with client.open(self.base+result['avatar']) as response:
            image=Image.open(io.BytesIO(response.read()))
            self.assertEqual(image.size,(256,256))
            self.assertEqual(response.headers['Cache-Control'],'no-store')
        with client.open(self.base+'/api/profile') as response:
            self.assertEqual(json.load(response)['avatar'],result['avatar'])
        stranger,_=self.authenticated_client('avatar_stranger')
        with self.assertRaises(urllib.error.HTTPError) as denied:
            stranger.open(self.base+result['avatar'])
        self.assertEqual(denied.exception.code,404)
        with self.assertRaises(urllib.error.HTTPError) as denied:
            self.new_client().open(self.base+result['avatar'])
        self.assertEqual(denied.exception.code,401)

    def test_frontend_entry_and_source_routes(self):
        for path in ['/', '/index.html', '/src/main.js', '/src/styles/main.css', '/assets/plan.jpg', '/workflows/wuyin-interior.json']:
            with urllib.request.urlopen(self.base + path) as response:
                self.assertEqual(response.status, 200, path)
                response.read()
        for path in ['/src/%2e%2e/server/app.py', '/server/app.py', '/package.json']:
            with self.assertRaises(urllib.error.HTTPError) as error:
                urllib.request.urlopen(self.base + path)
            self.assertEqual(error.exception.code, 404, path)

    def test_image_upload_and_traversal(self):
        status, value = self.post('/api/upload', {'data': base64.b64encode(self.image_bytes()).decode()})
        self.assertEqual(status, 200)
        self.assertEqual(server.local_image(value['pages'][0]).parent, self.output / 'uploads')
        for url in ['/outputs/../server.py', 'https://example.com/image.png']:
            with self.assertRaises(ValueError):
                server.local_image(url)

    def test_pdf_pages(self):
        buf = io.BytesIO()
        Image.new('RGB', (120, 80), 'white').save(buf, format='PDF', save_all=True, append_images=[Image.new('RGB', (80, 120), 'gray')])
        status, value = self.post('/api/upload', {'data': base64.b64encode(buf.getvalue()).decode()})
        self.assertEqual(status, 200)
        self.assertEqual(len(value['pages']), 2)
        self.assertNotEqual(value['pages'][0], value['pages'][1])

    def test_invalid_upload_and_cross_site(self):
        self.assertEqual(self.post('/api/upload', {'data': 'not-base64'})[0], 400)
        self.assertEqual(self.post('/api/workspace', {'test': True}, 'https://example.com')[0], 403)
        self.assertEqual(self.post('/api/upload', {'data': base64.b64encode(b'not an image').decode()})[0], 400)

    def test_confirmation_and_rectangles(self):
        self.assertEqual(self.post('/api/generate', {'source': '/assets/plan.jpg', 'consent': False})[0], 400)
        for r in [{'x': .9, 'y': .1, 'w': .3, 'h': .2}, {'x': 0, 'y': 0, 'w': 0, 'h': .5}, {}]:
            with self.assertRaises(ValueError):
                server.rectangle(r)

    def test_mask_and_unchanged_exterior(self):
        source = self.output / 'uploads' / 'base.png'
        Image.new('RGB', (100, 100), 'white').save(source)
        job = {'id': 'test-mask', 'created': 0}
        selection = {'x': .2, 'y': .3, 'w': .4, 'h': .3}
        def fake_run(command, **kwargs):
            with Image.open(command[command.index('--mask') + 1]) as mask:
                self.assertEqual(mask.size, (100, 100))
                self.assertEqual(mask.getpixel((30, 40))[3], 0)
                self.assertEqual(mask.getpixel((0, 0))[3], 255)
            Image.new('RGB', (120, 80), 'red').save(command[command.index('--output') + 1])
            return type('Result', (), {'returncode': 0})()
        with patch.object(server.subprocess, 'run', side_effect=fake_run), patch.object(server.DB,'save_job'):
            server.generate(job, {'source': '/outputs/uploads/base.png', 'action': 'edit', 'selection': selection, 'instruction': '换红色沙发'})
        self.assertEqual(job['status'], 'completed')
        with Image.open(self.output / 'generated/test-mask.png') as result:
            self.assertEqual(result.getpixel((30, 40)), (255, 0, 0))
            for box in [(0, 0, 100, 30), (0, 60, 100, 100), (0, 30, 20, 60), (60, 30, 100, 60)]:
                expected = Image.new('RGB', (box[2]-box[0], box[3]-box[1]), 'white')
                self.assertIsNone(ImageChops.difference(result.crop(box), expected).getbbox())

    def test_duplicate_request_is_not_dispatched_twice(self):
        key = 'offline-duplicate'
        data = {'source': '/assets/plan.jpg', 'consent': True, 'requestId': key}
        with patch.object(server.POOL, 'submit') as submit:
            first_status, first = self.post('/api/analyze', data)
            second_status, second = self.post('/api/analyze', data)
            self.assertEqual(first_status, 202)
            self.assertEqual(second_status, 200)
            self.assertEqual(first['id'], second['id'])
            self.assertEqual(submit.call_count, 1)
        server.JOBS.pop(first['id'])

    def test_provider_gateway_timeout_is_unknown(self):
        job = {'id': 'test-timeout', 'created': 0}
        response = type('Result', (), {'returncode': 1, 'stderr': 'ERROR: HTTP 504 upstream timeout'})()
        with patch.object(server.subprocess, 'run', return_value=response), patch.object(server.DB,'save_job'):
            server.generate(job, {'source': '/assets/reference-01.jpg', 'action': 'restyle', 'style': '现代'})
        self.assertEqual(job['status'], 'unknown')
        self.assertEqual(job['diagnostic']['httpStatus'], 504)

    def test_collection_reference_persistence(self):
        client,user=self.authenticated_client('collection_reference_test')
        reference='/assets/collections/rainforest-whale/reference-22.jpg'
        state={'source':'/assets/plan.jpg','reference':reference,'useReference':True,'rooms':[]}
        self.assertEqual(self.post('/api/workspace',state,client=client)[0],200)
        with client.open(self.base+f'/api/workspace?projectId={client.project_id}') as response:
            self.assertEqual(json.load(response)['reference'],reference)
        with self.db.transaction() as c:
            c.execute('SELECT is_human_reference FROM assets WHERE project_id=%s AND storage_path=%s',(client.project_id,reference))
            self.assertEqual(c.fetchone()['is_human_reference'],1)

    def test_workspace_roundtrip(self):
        self.assertEqual(self.post('/api/workspace', {'source':'/assets/plan.jpg','style': '原木', 'versions': []})[0], 200)
        with self.client.open(self.base + f'/api/workspace?projectId={self.client.project_id}') as response:
            self.assertEqual(json.load(response)['style'], '原木')


    def new_client(self):
        return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def test_authentication_and_account_isolation(self):
        first,second=self.new_client(),self.new_client()
        self.assertEqual(self.post('/api/workspace',{},client=first)[0],401)
        first,_=self.authenticated_client('123456')
        second,_=self.authenticated_client('设计师二')
        self.assertEqual(self.post('/api/workspace',{'source':'/assets/plan.jpg','style':'仅账号一'},client=first)[0],200)
        with second.open(self.base+f'/api/workspace?projectId={second.project_id}') as response:
            self.assertIsNone(json.load(response)['source'])
        status,uploaded=self.post('/api/upload',{'data':base64.b64encode(self.image_bytes()).decode(),'name':'private.png'},client=first)
        self.assertEqual(status,200)
        private=uploaded['pages'][0]
        with first.open(self.base+private) as response:
            self.assertEqual(response.status,200)
        with self.assertRaises(urllib.error.HTTPError) as denied:
            second.open(self.base+private)
        self.assertEqual(denied.exception.code,404)
        self.assertEqual(self.post('/api/workspace',{'source':private},client=second)[0],400)
        # Python must reject sessions revoked by the JavaScript backend.
        token=first.addheaders[0][1].split(' ',1)[1]
        with self.db.transaction() as c:
            c.execute('DELETE FROM auth_sessions WHERE token_hash=%s',(hashlib.sha256(token.encode()).hexdigest(),))
        self.assertEqual(self.post('/api/workspace',{},client=first)[0],401)

    def test_cookie_alone_cannot_read_private_workspace(self):
        client=self.new_client()
        token=self.client.addheaders[0][1].split(' ',1)[1]
        client.addheaders=[('Cookie','wuyin_session='+token)]
        client.project_id=self.client.project_id
        with self.assertRaises(urllib.error.HTTPError) as denied:
            client.open(self.base+f'/api/workspace?projectId={client.project_id}')
        self.assertEqual(denied.exception.code,401)

    def test_mysql_generation_versions_reviews_and_restart(self):
        client,user=self.authenticated_client('version_test')
        data={'source':'/assets/plan.jpg','consent':True,'requestId':str(uuid.uuid4()),'confirmed':True,
              'room':'客厅','roomRect':{'x':.1,'y':.1,'w':.4,'h':.4},'action':'generate','style':'原木','outputSize':'1024x1536','outputQuality':'high','roomLength':5.2,'roomWidth':3.6}
        def fake_model(command,**kwargs):
            self.assertEqual(command[command.index('--quality')+1],'high')
            if command[command.index('--output')+1].endswith('.png') and 'reference-generate' in command:
                self.assertEqual(command[command.index('--size')+1],'1024x1536')
                self.assertIn('长5.2米；宽3.6米',command[command.index('--prompt')+1])
            Image.new('RGB',(120,80),'green').save(command[command.index('--output')+1])
            return type('Result',(),{'returncode':0})()
        fake_helper=type('Helper',(),{'load_config':lambda self,_:{'IMAGE_2_API_KEY':'test-only'}})()
        with patch.object(server,'helper_module',return_value=fake_helper), patch.object(server.POOL,'submit',side_effect=lambda fn,*args:fn(*args)), patch.object(server.subprocess,'run',side_effect=fake_model):
            status,job=self.post('/api/generate',data,client=client)
            self.assertEqual(status,202)
            self.assertEqual(job['status'],'completed')
            state={'source':'/assets/plan.jpg','rooms':[],'versions':[{'id':job['id']}],'selectedVersion':0,
                   'review':{job['id']:{'0':True,'1':False}}}
            self.assertEqual(self.post('/api/workspace',state,client=client)[0],200)
            with client.open(self.base+f'/api/workspace?projectId={client.project_id}') as response:
                restored=json.load(response)
            self.assertEqual(restored['versions'][0]['id'],job['id'])
            edit={**data,'source':job['image'],'requestId':str(uuid.uuid4()),'action':'edit','selection':{'x':.2,'y':.2,'w':.3,'h':.3},'instruction':'换材质','parentVersionId':job['id']}
            status,child=self.post('/api/generate',edit,client=client)
            self.assertEqual(status,202)
            self.assertEqual(child['status'],'completed')
        server.load_jobs()
        with client.open(self.base+f'/api/workspace?projectId={client.project_id}') as response:
            restored=json.load(response)
        self.assertEqual(len(restored['versions']),2)
        with client.open(self.base+'/api/projects') as response:
            project=next(p for p in json.load(response) if p['id']==client.project_id)
        self.assertEqual(project['versions'],2)
        self.assertEqual(project['status'],'已生成')
        self.assertEqual(project['cover'],child['image'])
        self.assertEqual(restored['versions'][1]['parent'],job['id'])
        with self.db.transaction() as c:
            c.execute('SELECT structure_preserved,layout_preserved FROM version_reviews r JOIN render_versions v ON v.id=r.version_id WHERE v.task_id=%s',(job['id'],))
            self.assertEqual(c.fetchone(),{'structure_preserved':1,'layout_preserved':0})
        other,_=self.authenticated_client('job_other')
        with self.assertRaises(urllib.error.HTTPError) as denied:
            other.open(self.base+'/api/jobs/'+job['id'])
        self.assertEqual(denied.exception.code,404)


    def test_multiple_projects_empty_entry_and_ownership(self):
        client,user=self.authenticated_client('projects_owner')
        with client.open(self.base+'/api/projects') as response:
            before=json.load(response)
        with client.open(self.base+'/api/workspace') as response:
            self.assertIsNone(json.load(response))
        with client.open(self.base+'/api/projects') as response:
            self.assertEqual(len(json.load(response)),len(before))
        for name in ['', '   ', 'x'*129, 123]:
            self.assertEqual(self.post('/api/projects',{'name':name},client=client)[0],400)
        code,created=self.post('/api/projects',{'name':'第二个设计项目'},client=client)
        self.assertEqual(code,201)
        first_id,second_id=client.project_id,created['id']
        self.assertEqual(self.post('/api/workspace',{'projectId':second_id,'source':None,'rooms':[],'style':'奶油'},client=client)[0],200)
        self.assertEqual(self.post('/api/workspace',{'projectId':first_id,'source':'/assets/plan.jpg','style':'原木'},client=client)[0],200)
        for ident,style in [(first_id,'原木'),(second_id,'奶油')]:
            with client.open(self.base+f'/api/workspace?projectId={ident}') as response:
                self.assertEqual(json.load(response)['style'],style)
        other,_=self.authenticated_client('projects_other')
        with self.assertRaises(urllib.error.HTTPError) as denied:
            other.open(self.base+f'/api/workspace?projectId={second_id}')
        self.assertEqual(denied.exception.code,404)
        self.assertEqual(self.post('/api/workspace',{'projectId':second_id,'source':None},client=other)[0],400)
        self.assertEqual(self.post('/api/upload',{'projectId':second_id,'data':base64.b64encode(self.image_bytes()).decode()},client=other)[0],400)
        self.assertEqual(self.post('/api/workspace',{'projectId':None,'source':None},client=client)[0],400)
        # The same request identity may belong to separate projects, without sharing jobs.
        with patch.object(server.POOL,'submit') as submit:
            jobs=[]
            for ident in [first_id,second_id]:
                code,job=self.post('/api/analyze',{'projectId':ident,'source':'/assets/plan.jpg','consent':True,'requestId':'same-request'},client=client)
                self.assertEqual(code,202);jobs.append(job)
            self.assertNotEqual(jobs[0]['id'],jobs[1]['id'])
            self.assertEqual(submit.call_count,2)
            for job in jobs:
                server.JOBS.pop(job['id'])
        # A private asset from one project cannot become another project's input.
        code,upload=self.post('/api/upload',{'data':base64.b64encode(self.image_bytes()).decode()},client=client)
        self.assertEqual(code,200)
        self.assertEqual(self.post('/api/workspace',{'projectId':second_id,'source':upload['pages'][0]},client=client)[0],400)

    def test_completed_task_journal_recovers_after_database_failure(self):
        ident=uuid.uuid4().hex
        request={'source':'/assets/plan.jpg','action':'restyle','style':'奶油'}
        job={'id':ident,'requestId':ident,'created':time.time(),'status':'queued','kind':'image','request':request}
        job,_=self.db.new_job(self.user['id'],job)
        image=self.output/'generated'/f'{ident}.png'
        Image.new('RGB',(100,80),'white').save(image)
        job.update(status='completed',stage='完成',image='/outputs/generated/'+image.name,finished=time.time())
        # Simulate the journal being written just before the database disconnected.
        server.atomic_json(self.output/'jobs'/f'{ident}.json',job)
        server.load_jobs()
        recovered=self.db.job(self.user['id'],ident)
        self.assertEqual(recovered['status'],'completed')
        server.load_jobs()
        with self.db.transaction() as c:
            c.execute('SELECT COUNT(*) AS n FROM render_versions WHERE task_id=%s',(ident,))
            self.assertEqual(c.fetchone()['n'],1)

    def test_database_failure_is_explicit(self):
        with patch.object(server.DB,'workspace',side_effect=pymysql.OperationalError(2003,'offline')):
            with self.assertRaises(urllib.error.HTTPError) as error:
                self.client.open(self.base+f'/api/workspace?projectId={self.client.project_id}')
            self.assertEqual(error.exception.code,503)

if __name__ == '__main__':
    unittest.main(verbosity=2)

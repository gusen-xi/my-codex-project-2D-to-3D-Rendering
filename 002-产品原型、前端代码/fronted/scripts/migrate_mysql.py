"""Import existing local JSON records without removing or rewriting source files."""
import argparse
from datetime import datetime
import json
from pathlib import Path
import shutil
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server.database import Database


def migrate(owner):
    db=Database()
    output=db.root/'outputs'
    backup=db.root.parents[1]/'work'/('mysql-migration-'+datetime.now().strftime('%Y%m%d-%H%M%S'))
    backup.mkdir(parents=True,mode=0o700)
    for name in ('users.json','workspace.json','jobs'):
        source=output/name
        if source.is_dir():
            shutil.copytree(source,backup/name)
        elif source.exists():
            shutil.copy2(source,backup/name)
    users=json.loads((output/'users.json').read_text())
    for username,record in users.items():
        existing=db.user(username)
        if not existing:
            db.register(username,record['salt'],record['hash'])
        elif existing['password_hash'] != record['hash']:
            raise ValueError('已有同名账号的密码记录不同；保留数据库记录，请人工处理。')
    user=db.user(owner)
    if not user:
        raise ValueError('指定的历史工作区所有者不存在。')
    old=json.loads((output/'workspace.json').read_text()) if (output/'workspace.json').exists() else None
    # Register all legacy output images to the single explicitly chosen legacy owner.
    urls=['/outputs/'+str(p.relative_to(output)) for folder in ('uploads','generated') for p in (output/folder).glob('*') if p.suffix.lower() in ('.jpg','.jpeg','.png')]
    for url in urls:
        db.add_assets(user['id'],[url],Path(url).name,'generated' if '/generated/' in url else 'plan_page')
    with db.transaction() as c:
        project=db.project(c,user['id'])
        for ref in json.loads((db.root/'public/assets/references.json').read_text()):
            asset_id=db.asset(c,project['id'],ref['url'],'reference',ref['name'])
            c.execute('UPDATE assets SET reference_room=%s WHERE id=%s',(ref.get('room'),asset_id))
    reports=[]
    jobs=[json.loads(p.read_text()) for p in (output/'jobs').glob('*.json')]
    for job in sorted(jobs,key=lambda j:j.get('created',0)):
        if not job.get('request',{}).get('source'):
            reports.append({'id':job['id'],'reason':'旧任务没有输入来源，保留在备份中，不伪造关联'})
            continue
        if not job.get('requestId'):
            job['requestId']='legacy-'+job['id']
        saved,created=db.new_job(user['id'],job)
        if created:
            job.update(projectId=saved['projectId'],userId=user['id'])
            if job['status'] in ('running','queued'):
                job.update(status='unknown',error='历史任务结果待核对，未重新发送模型请求。')
            db.save_job(job)
    if old and db.workspace(user['id']) is None:
        # Old unchecked flags cannot distinguish unreviewed from rejected.
        old['review']={key:{k:v for k,v in value.items() if v} for key,value in old.get('review',{}).items()}
        db.save_workspace(user['id'],old,importing=True)
    (backup/'report.json').write_text(json.dumps({'owner':owner,'accounts':len(users),'legacyJobs':len(jobs),'skipped':reports},ensure_ascii=False,indent=2))
    print(f'账号迁移完成；历史工作区所属：{owner}；原始数据备份：{backup}；跳过的不可关联任务：{len(reports)}')


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--owner',required=True)
    migrate(parser.parse_args().owner)

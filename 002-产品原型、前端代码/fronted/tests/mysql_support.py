"""Create and remove an isolated MySQL test database; never use live business tables."""
from pathlib import Path
import uuid
from pymysql.constants import CLIENT
from server.database import Database, CONFIG


def test_database(root):
    settings=Database().config.copy()
    values=dict(line.split('=',1) for line in CONFIG.read_text().splitlines() if '=' in line)
    settings.update(user='root',password=values['MYSQL_ROOT_PASSWORD'])
    admin=Database(settings)
    name='wuyin_api_test_'+uuid.uuid4().hex[:12]
    with admin.transaction() as c:
        c.execute(f'CREATE DATABASE `{name}` CHARACTER SET utf8mb4')
    settings['database']=name
    settings['client_flag']=CLIENT.MULTI_STATEMENTS
    db=Database(settings,root=root)
    schema=Path(__file__).resolve().parents[3]/'003-数据库脚本/001_create_tables.sql'
    try:
        with db.transaction() as c:
            for script in [schema, schema.with_name('002_create_auth_sessions.sql')]:
                c.execute(script.read_text())
                while c.nextset():
                    pass
    except Exception:
        with admin.transaction() as c:
            c.execute(f'DROP DATABASE `{name}`')
        raise
    return db,admin,name

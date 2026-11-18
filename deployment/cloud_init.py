"""Initialize a separate cloud demo database; never migrate local private data."""
import hashlib
import json
import os
from pathlib import Path
import secrets
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'002-产品原型、前端代码/fronted'))
from server.database import Database
from pymysql.constants import CLIENT


def initialize(db, schemas=ROOT/'003-数据库脚本'):
    accounts=json.loads(os.environ.get('DEMO_ACCOUNTS','[]'))
    if os.environ.get('DEMO_MODE')=='1' and not accounts:
        raise ValueError('Set DEMO_ACCOUNTS before deploying the interview demo.')
    for account in accounts:
        if not isinstance(account,dict) or not isinstance(account.get('username'),str) or not (3<=len(account['username'])<=32 and all(ch.isalnum() or ch in '_-' for ch in account['username'])) or not isinstance(account.get('password'),str) or not 12<=len(account['password'])<=64:
            raise ValueError('Demo accounts require a username and a password of 12-64 characters.')
    db.config['client_flag']=CLIENT.MULTI_STATEMENTS
    with db.transaction() as c:
        for name in ('001_create_tables.sql','002_create_auth_sessions.sql'):
            c.execute((schemas/name).read_text().replace('utf8mb4_0900_as_cs','utf8mb4_bin'))
            while c.nextset():
                pass
        c.execute('''CREATE TABLE IF NOT EXISTS demo_file_chunks (
            storage_path VARCHAR(512) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
            part_no INT UNSIGNED NOT NULL,
            content MEDIUMBLOB NOT NULL,
            PRIMARY KEY(storage_path,part_no)
        )''')
        for account in accounts:
            c.execute('SELECT id FROM users WHERE username=%s',(account['username'],))
            if c.fetchone():
                continue
            salt=secrets.token_hex(16)
            digest=hashlib.pbkdf2_hmac('sha256',account['password'].encode(),salt.encode(),210000).hex()
            c.execute('''INSERT INTO users(username,password_hash,password_salt,password_algorithm,password_iterations)
                VALUES (%s,%s,%s,'pbkdf2_sha256',210000)''',(account['username'],digest,salt))


if __name__=='__main__':
    initialize(Database())
    print('Cloud demo schema and invite accounts ready; existing passwords and quotas preserved.')

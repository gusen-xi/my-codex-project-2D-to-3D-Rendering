import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes, pbkdf2Sync, createHash } from 'node:crypto';
import mysql from 'mysql2/promise';
import { config, projectRoot } from '../src/config.js';
import { createApp } from '../src/app.js';

let admin,pool,server,base;
const database='wuyin_node_test_'+randomBytes(6).toString('hex');
async function start(app) {
  const service=app.listen(0,'127.0.0.1');
  await once(service,'listening');
  return service;
}
async function request(route,{body,cookie,headers={},method=body===undefined?'GET':'POST',url=base}={}) {
  const response=await fetch(url+route,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(cookie?{Authorization:'Bearer '+cookie}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json();
  return {status:response.status,data,cookie:data.token,setCookie:response.headers.get('set-cookie')};
}
before(async()=>{
  const env=Object.fromEntries(readFileSync(path.join(projectRoot,'work/mysql/.env'),'utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)];}));
  admin=await mysql.createConnection({...config.database,user:'root',password:env.MYSQL_ROOT_PASSWORD});
  await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4`);
  pool=mysql.createPool({...config.database,user:'root',password:env.MYSQL_ROOT_PASSWORD,database,multipleStatements:true});
  for(const script of ['001_create_tables.sql','002_create_auth_sessions.sql']) await pool.query(readFileSync(path.join(projectRoot,'003-数据库脚本',script),'utf8'));
  server=await start(createApp({pool}));
  base=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{
  if(server)await new Promise(resolve=>server.close(resolve));
  if(pool)await pool.end();
  if(admin){await admin.query(`DROP DATABASE IF EXISTS \`${database}\``);await admin.end();}
});

test('register, persist session across app instances, login, rotate, logout',async()=>{
  const registered=await request('/api/auth/register',{body:{username:'设计师001',password:'testpass123'}});
  assert.equal(registered.status,201);
  assert.deepEqual(Object.keys(registered.data.user).sort(),['id','username']);
  assert.equal(registered.setCookie,null);
  assert.match(registered.data.token,/^[A-Za-z0-9_-]{43}$/);
  const token=registered.cookie;
  const [rows]=await pool.execute('SELECT token_hash FROM auth_sessions');
  assert.equal(rows[0].token_hash,createHash('sha256').update(token).digest('hex'));
  const [users]=await pool.execute('SELECT * FROM users WHERE username=?',['设计师001']);
  assert.notEqual(users[0].password_hash,'testpass123');
  assert.equal(users[0].password_iterations,210000);
  assert.equal((await request('/api/auth/session',{cookie:registered.cookie})).data.user.username,'设计师001');
  const restarted=await start(createApp({pool}));
  try{assert.equal((await request('/api/auth/session',{cookie:registered.cookie,url:`http://127.0.0.1:${restarted.address().port}`})).data.authenticated,true);}
  finally{await new Promise(resolve=>restarted.close(resolve));}
  assert.equal((await request('/api/auth/register',{body:{username:'设计师001',password:'abcdef'}})).status,409);
  assert.equal((await request('/api/auth/login',{body:{username:'设计师001',password:'wrong12'}})).status,401);
  const login=await request('/api/auth/login',{cookie:registered.cookie,body:{username:'设计师001',password:'testpass123'}});
  assert.equal(login.status,200);assert.notEqual(login.cookie,registered.cookie);
  assert.equal((await request('/api/auth/session',{cookie:registered.cookie})).data.authenticated,false);
  assert.equal((await request('/api/auth/logout',{cookie:login.cookie,body:{}})).status,200);
  assert.equal((await request('/api/auth/session',{cookie:login.cookie})).data.authenticated,false);
});

test('numeric username, invalid inputs and legacy Python password hash',async()=>{
  assert.equal((await request('/api/auth/register',{body:{username:'123456',password:'abcdef'}})).status,201);
  for(const body of [{},{username:[],password:'abcdef'},{username:'ab',password:'abcdef'},{username:'abc',password:'12345'},{username:'x'.repeat(33),password:'abcdef'},{username:"abc' OR 1=1",password:'abcdef'},{username:'abc',password:'x'.repeat(65)}])assert.equal((await request('/api/auth/register',{body})).status,400);
  const salt='f12e3456789abcdef0123456789abcdef';
  const hash=pbkdf2Sync('legacy123',salt,120000,32,'sha256').toString('hex');
  await pool.execute('INSERT INTO users(username,password_salt,password_hash) VALUES (?,?,?)',['legacy_user',salt,hash]);
  assert.equal((await request('/api/auth/login',{body:{username:'legacy_user',password:'legacy123'}})).status,200);
  assert.equal((await request('/api/auth/login',{body:{username:'missing_user',password:'legacy123'}})).status,401);
});

test('expired and forged sessions, cross-site and malformed requests',async()=>{
  const user=await request('/api/auth/login',{body:{username:'123456',password:'abcdef'}});
  await pool.execute('UPDATE auth_sessions SET expires_at=UTC_TIMESTAMP()-INTERVAL 1 SECOND WHERE user_id=?',[user.data.user.id]);
  assert.equal((await request('/api/auth/session',{cookie:user.cookie})).data.authenticated,false);
  assert.equal((await request('/api/auth/session',{cookie:'a'.repeat(43)})).data.authenticated,false);
  assert.equal((await request('/api/auth/register',{body:{username:'origin_test',password:'abcdef'},headers:{Origin:'https://example.com'}})).status,403);
  const invalid=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'});
  assert.equal(invalid.status,400);
  const oversized=await request('/api/auth/register',{body:{value:'x'.repeat(20000)}});
  assert.equal(oversized.status,413);
  const noJson=await fetch(base+'/api/auth/register',{method:'POST',body:'hello'});
  assert.equal(noJson.status,415);
});

test('database outage returns 503 without exposing database credentials',async()=>{
  const broken=await start(createApp({pool:{execute:async()=>{throw new Error('private database detail');}}}));
  try{
    const result=await request('/api/auth/login',{url:`http://127.0.0.1:${broken.address().port}`,body:{username:'valid_user',password:'abcdef'}});
    assert.equal(result.status,503);assert.doesNotMatch(JSON.stringify(result.data),/private/);
  }finally{await new Promise(resolve=>broken.close(resolve));}
});

test('a shared legacy Cookie never authenticates a new tab',async()=>{
  const login=await request('/api/auth/login',{body:{username:'123456',password:'abcdef'}});
  const shared={Cookie:'wuyin_session='+login.data.token};
  assert.equal((await request('/api/auth/session',{headers:shared})).data.authenticated,false);
  assert.equal((await request('/api/auth/session',{cookie:login.data.token})).data.authenticated,true);
  await request('/api/auth/logout',{headers:shared,body:{}});
  assert.equal((await request('/api/auth/session',{cookie:login.data.token})).data.authenticated,true);
  const other=await request('/api/auth/login',{body:{username:'123456',password:'abcdef'}});
  await request('/api/auth/logout',{cookie:other.data.token,body:{}});
  assert.equal((await request('/api/auth/session',{cookie:login.data.token})).data.authenticated,true);
});

test('rate limits excessive authentication attempts',async()=>{
  let result;
  for(let i=0;i<61;i++)result=await request('/api/auth/login',{body:{}});
  assert.equal(result.status,429);
});


test('demo disables registration and enforces the cloud origin',async()=>{
  const service=await start(createApp({pool,demoMode:true,allowedOrigins:['https://demo.zanegao.cn']}));
  const url=`http://127.0.0.1:${service.address().port}`;
  try {
    assert.deepEqual((await request('/api/demo',{url})).data,{demoMode:true});
    assert.equal((await request('/api/auth/register',{url,body:{username:'demo_new',password:'testpass123'},headers:{Origin:'https://demo.zanegao.cn'}})).status,403);
    assert.equal((await request('/api/auth/login',{url,body:{username:'absent',password:'testpass123'},headers:{Origin:'https://demo.zanegao.cn'}})).status,401);
    assert.equal((await request('/api/auth/login',{url,body:{},headers:{Origin:'https://evil.example'}})).status,403);
  } finally { await new Promise(resolve=>service.close(resolve)); }
});

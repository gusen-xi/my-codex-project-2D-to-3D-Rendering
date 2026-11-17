import mysql from 'mysql2/promise';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { createApp } from './app.js';
const pool=mysql.createPool(config.database);
try{
  await pool.query('SELECT 1 FROM users LIMIT 1');
  await pool.query('SELECT 1 FROM auth_sessions LIMIT 1');
  await pool.query('SELECT 1 FROM super_admins LIMIT 1');
  const app=createApp({pool,authUrl:config.authUrl,configUrl:config.configUrl,frontendDir:fileURLToPath(new URL('../../frontend/dist',import.meta.url)),port:config.port});
  const server=app.listen(config.port,config.host,()=>console.log(`本地管理后台：http://${config.host}:${config.port}`));
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close(async()=>{await pool.end();process.exit(0);}));
}catch(error){console.error(error.code?'启动失败：请确认 MySQL、users、auth_sessions 与 super_admins 表已就绪。':error.message);await pool.end();process.exitCode=1;}

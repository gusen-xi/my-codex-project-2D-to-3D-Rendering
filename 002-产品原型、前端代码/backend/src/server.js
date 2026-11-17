import mysql from 'mysql2/promise';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config, frontendRoot } from './config.js';
import { createApp } from './app.js';

const pool=mysql.createPool(config.database);
let python,server;
async function shutdown() {
  server?.close();
  if(python) python.kill('SIGTERM');
  await pool.end();
}
try {
  await pool.query('SELECT token_hash FROM auth_sessions LIMIT 1');
  const dist=path.join(frontendRoot,'dist');
  if(!existsSync(path.join(dist,'index.html'))) throw new Error('请先在fronted目录构建前端：pnpm build');
  let existing;
  try {existing=await (await fetch(`http://127.0.0.1:${config.pythonPort}/api/config`,{signal:AbortSignal.timeout(1000)})).json();} catch {}
  if(existing && existing.application!=='wuyin-space') throw new Error('Python服务端口被其他服务占用');
  if(!existing) {
    const bundled=path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3');
    const command=process.env.PYTHON_COMMAND || (existsSync(bundled) ? bundled : 'python3');
    python=spawn(command,[path.join(frontendRoot,'server/app.py'),'--port',String(config.pythonPort)],{cwd:frontendRoot,stdio:'inherit'});
    python.on('error',()=>{console.error('Python设计服务启动失败，请检查Python依赖。');shutdown().finally(()=>process.exit(1));});
    python.on('exit',code=>{if(code!==null && code!==0)console.error('Python设计服务已退出，请检查MySQL及Python依赖。');});
  }
  let ready=false;
  for(let attempt=0;attempt<40;attempt++) {
    try {
      const response=await fetch(`http://127.0.0.1:${config.pythonPort}/api/config`,{signal:AbortSignal.timeout(500)});
      if(response.ok && (await response.json()).application==='wuyin-space') {ready=true;break;}
    } catch {}
    if(python?.exitCode!==null && python?.exitCode!==undefined)break;
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  if(!ready)throw new Error('Python设计服务未就绪，请检查依赖与MySQL连接。');
  const app=createApp({pool,pythonPort:config.pythonPort,frontendDir:dist});
  server=app.listen(config.port,config.host,()=>console.log(`无垠空间 JavaScript 后端：http://${config.host}:${config.port}`));
  server.on('error',()=>{console.error('网站端口不可用，请检查是否已有服务运行。');shutdown().finally(()=>process.exit(1));});
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>shutdown().finally(()=>process.exit(0)));
} catch(error) {
  console.error(error.code ? '启动失败：请确认MySQL运行、连接配置正确，且已执行002_create_auth_sessions.sql。' : error.message);
  await shutdown();process.exitCode=1;
}

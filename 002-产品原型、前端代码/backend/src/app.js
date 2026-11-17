import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { authRoutes } from './auth.js';

export function createApp({pool, pythonPort=8767, frontendDir, allowedOrigins=['http://127.0.0.1:8766','http://localhost:8766','http://127.0.0.1:5173','http://localhost:5173']}) {
  const app=express();
  app.disable('x-powered-by');
  app.use((req,res,next)=>{
    res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'});
    if (!['GET','HEAD','OPTIONS'].includes(req.method) && ((req.headers.origin && !allowedOrigins.includes(req.headers.origin)) || req.headers['sec-fetch-site']==='cross-site')) return res.status(403).json({error:'不允许跨站请求。'});
    next();
  });
  app.get('/health',async(req,res)=>{await pool.query('SELECT 1');res.json({application:'wuyin-node-backend',database:'mysql',status:'ok'});});
  app.use('/api/auth',(req,res,next)=>{
    if (req.method==='POST' && !req.is('application/json')) return res.status(415).json({error:'需要JSON请求。'});
    next();
  },express.json({limit:'16kb'}),authRoutes(pool));
  // Existing design/model APIs remain in Python; it validates this backend's DB sessions.
  app.use((req,res,next)=>{
    if (!req.path.startsWith('/api/') && !req.path.startsWith('/outputs/')) return next();
    if (req.path.startsWith('/api/auth/')) return res.status(404).json({error:'接口不存在。'});
    const headers={...req.headers,host:`127.0.0.1:${pythonPort}`};
    if (headers.origin) headers.origin=`http://127.0.0.1:${pythonPort}`;
    const upstream=http.request({hostname:'127.0.0.1',port:pythonPort,path:req.originalUrl,method:req.method,headers},response=>{
      res.writeHead(response.statusCode,response.headers);response.pipe(res);
    });
    upstream.setTimeout(30000,()=>upstream.destroy());
    upstream.on('error',()=>{if(!res.headersSent)res.status(503).json({error:'设计工作台服务尚未启动，请使用启动网站脚本。'});else res.destroy();});
    req.on('aborted',()=>upstream.destroy());
    req.pipe(upstream);
  });
  if (frontendDir) {
    app.use(express.static(frontendDir,{etag:false}));
    app.get('/',(req,res)=>res.sendFile(path.join(frontendDir,'index.html')));
  }
  app.use((req,res)=>res.status(404).json({error:'页面或接口不存在。'}));
  app.use((error,req,res,next)=>{
    if (res.headersSent) return next(error);
    if (error.type==='entity.too.large') return res.status(413).json({error:'请求内容过大。'});
    if (error instanceof SyntaxError && 'body' in error) return res.status(400).json({error:'JSON格式无效。'});
    res.status(503).json({error:'服务暂不可用，请检查MySQL和后端配置。'});
  });
  return app;
}

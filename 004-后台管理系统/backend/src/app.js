import express from 'express';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { adminRoutes, requireAdmin, tokenFrom } from './admin.js';
const digest = token => createHash('sha256').update(token).digest('hex');

export function createApp({ pool, authUrl, configUrl, frontendDir, port=8770 }) {
  const app=express();
  app.disable('x-powered-by');
  const allowedOrigins=new Set(['http://127.0.0.1:5175','http://localhost:5175','http://127.0.0.1:4175','http://localhost:4175',`http://127.0.0.1:${port}`,`http://localhost:${port}`]);
  app.use((req,res,next)=>{res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"});if(req.method!=='GET'&&req.method!=='HEAD'&&req.method!=='OPTIONS'&&((req.headers.origin&&!allowedOrigins.has(req.headers.origin))||req.headers['sec-fetch-site']==='cross-site'))return res.status(403).json({error:'不允许跨站请求。'});next();});
  app.post('/api/auth/login',express.json({limit:'4kb'}),async(req,res,next)=>{try{
    if(typeof req.body?.username!=='string'||typeof req.body?.password!=='string')return res.status(400).json({error:'请输入用户名和密码。'});
    const upstream=await fetch(authUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:req.body.username,password:req.body.password}),signal:AbortSignal.timeout(10000)});
    const result=await upstream.json().catch(()=>({}));
    if(!upstream.ok)return res.status(upstream.status).json({error:result.error||'登录失败。'});
    const token=typeof result.token==='string'&&/^[A-Za-z0-9_-]{43}$/.test(result.token)?result.token:'';
    if(!token)return res.status(502).json({error:'登录服务响应无效。'});
    const [admins]=await pool.query('SELECT user_id FROM super_admins');
    const [sessions]=await pool.execute('SELECT s.user_id,u.username FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP(3)',[digest(token)]);
    if(admins.length!==1||!sessions[0]||String(admins[0].user_id)!==String(sessions[0].user_id)){
      await pool.execute('DELETE FROM auth_sessions WHERE token_hash=?',[digest(token)]);
      return res.status(403).json({error:'当前账号没有后台访问权限，或超级管理员尚未唯一登记。'});
    }
    res.json({token,user:{id:sessions[0].user_id,username:sessions[0].username}});
  }catch(error){next(error);}});
  app.post('/api/auth/logout',async(req,res,next)=>{try{const token=tokenFrom(req);if(token)await pool.execute('DELETE FROM auth_sessions WHERE token_hash=?',[digest(token)]);res.json({loggedOut:true});}catch(error){next(error);}});
  app.use('/api/admin',requireAdmin.bind(null,pool),adminRoutes(pool,configUrl));
  if(frontendDir){app.use(express.static(frontendDir,{etag:false}));app.get('*path',(req,res)=>{if(req.path.startsWith('/api/')||req.path.startsWith('/outputs/')||path.extname(req.path))return res.status(404).json({error:'页面或接口不存在。'});res.sendFile(`${frontendDir}/index.html`);});}
  app.use((req,res)=>res.status(404).json({error:'页面或接口不存在。'}));
  app.use((error,req,res,next)=>{if(res.headersSent)return next(error);if(error.type==='entity.too.large')return res.status(413).json({error:'请求内容过大。'});if(error instanceof SyntaxError&&'body'in error)return res.status(400).json({error:'JSON格式无效。'});res.status(503).json({error:'服务暂不可用，请检查MySQL及认证服务。'});});
  return app;
}

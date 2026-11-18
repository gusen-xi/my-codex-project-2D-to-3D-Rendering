import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
let root;

function AuthForm({ api, onSuccess }) {
  const [mode,setMode]=useState('login');
  const [username,setUsername]=useState('');
  const [password,setPassword]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [demoMode,setDemoMode]=useState(null);
  useEffect(()=>{fetch('/api/demo').then(response=>response.json()).then(data=>setDemoMode(data.demoMode)).catch(()=>{});},[]);
  const login=mode==='login';
  async function submit(event) {
    event.preventDefault();
    if(busy)return;
    setError('');setBusy(true);
    try {const result=await api(`/api/auth/${mode}`,{username:username.trim(),password});await onSuccess(result.user);}
    catch(error) {setError(error.message || '请求未完成，请稍后重试。');}
    finally {setBusy(false);}
  }
  return <main className="auth-shell"><section className="auth-card">
    <div className="auth-brand"><div className="brand-mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 20V4h18v16H3M3 4l18 16M12 4v16"/></svg></div><div><strong>无垠空间</strong><small>WU YIN · DESIGN STUDIO</small></div></div>
    <div className="eyebrow">DESIGNER WORKSPACE</div>
    <h1>{login?'欢迎回来':'创建你的设计空间'}</h1>
    <p className="auth-subtitle">{demoMode?'使用作者提供的体验账号登录，探索平面图与空间意向。':login?'登录后继续探索平面图与空间意向。':'注册一个本地试用账号，保存你的设计工作区。'}</p>
    <form id="auth-form" onSubmit={submit} aria-busy={busy}>
      <label>用户名<input name="username" autoComplete="username" minLength={3} maxLength={32} required placeholder="请输入用户名" value={username} onChange={event=>setUsername(event.target.value)} disabled={busy}/></label>
      <label>密码<input name="password" type="password" autoComplete={login?'current-password':'new-password'} minLength={6} maxLength={64} required placeholder="6–64 位密码" value={password} onChange={event=>setPassword(event.target.value)} disabled={busy}/></label>
      {!login&&<p className="helper">用户名3–32位，支持中文、字母、数字、下划线和连字符。</p>}
      {error&&<p className="error-box" role="alert">{error}</p>}
      <button className="primary-btn" type="submit" disabled={busy}>{busy?'请稍候…':login?'登录':'注册'} <span aria-hidden="true">→</span></button>
    </form>
    {demoMode===false&&<p className="auth-switch">{login?'还没有账号？':'已有账号？'} <button type="button" disabled={busy} onClick={()=>{setMode(login?'register':'login');setPassword('');setError('');}}>{login?'立即注册':'返回登录'}</button></p>}
    <p className="auth-note">{demoMode?'每个体验账号可识别一次、提交一次生图（含重新生成、换风格和局部修改）；提交后即计次，刷新或重新登录不会重置。':'本原型为本地单机试用，账号数据保存在当前电脑。'}</p>
  </section></main>;
}
export function mountAuth(options) {
  root ||= createRoot(document.querySelector('#app'));
  root.render(<AuthForm {...options}/>);
}
export function unmountAuth() {if(root){root.unmount();root=null;}}

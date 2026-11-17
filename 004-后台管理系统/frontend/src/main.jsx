import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const tokenKey = 'wuyin-admin-token';
const number = value => new Intl.NumberFormat('zh-CN').format(Number(value || 0));
const date = value => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—';
function reviewNotes(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' ? parsed : { comment: value }; }
  catch { return { comment: value }; }
}

async function request(path, token, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(body.error || '请求失败，请稍后重试。'); error.status = response.status; throw error; }
  return body;
}

function SignIn({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setError(''); setBusy(true);
    try { await onLogin(username.trim(), password); }
    catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  }
  return <main className="signin-wrap"><section className="signin-card">
    <div className="brand"><span className="brand-mark">W</span><span><b>无垠空间</b><small>DESIGN STUDIO</small></span></div>
    <div className="signin-kicker">LOCAL ADMIN CONSOLE</div><h1>管理后台</h1>
    <p className="muted">使用已授权的超级管理员账号登录。后台仅供本地演示，数据只读。</p>
    <form onSubmit={submit}>
      <label>用户名<input autoComplete="username" required minLength="3" maxLength="32" value={username} onChange={event=>setUsername(event.target.value)} placeholder="输入现有产品账号" /></label>
      <label>密码<input type="password" autoComplete="current-password" required value={password} onChange={event=>setPassword(event.target.value)} placeholder="输入密码" /></label>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button className="button primary full" disabled={busy}>{busy ? '正在验证…' : '安全登录'}<span>→</span></button>
    </form>
    <div className="privacy-note"><span>盾</span><p>仅限 super_admins 中登记的单一账号访问<br/>不展示或导出住宅图纸与生成图片</p></div>
  </section><div className="signin-foot">LOCAL MVP · READ ONLY · PRIVACY FIRST</div></main>;
}

const nav = [
  ['overview','概览','▦'], ['users','用户','♙'], ['projects','项目','▧'], ['tasks','生成任务','◷'], ['reviews','质量评价','◇'],
];
const titles = { overview:'管理概览', users:'用户管理', projects:'项目管理', tasks:'生成任务', reviews:'质量评价' };

function Metric({ label, value, hint, tone = 'blue' }) {
  return <article className="metric"><div className={`metric-icon ${tone}`}>{tone==='green'?'✓':tone==='amber'?'◷':tone==='violet'?'◇':'▦'}</div><div><span className="metric-label">{label}</span><strong>{number(value)}</strong><small>{hint}</small></div></article>;
}
function Pill({ children, status }) {
  const klass = status === 'completed' ? 'green' : ['running','queued'].includes(status) ? 'blue' : ['failed','unknown'].includes(status) ? 'red' : 'gray';
  const labels = { completed:'已完成', running:'处理中', queued:'排队中', failed:'失败', unknown:'结果待确认', analyze:'平面识别', generate:'生成', edit:'局部编辑', restyle:'全图换风格' };
  return <span className={`pill ${klass}`}>{labels[children] || children || '—'}</span>;
}
function Table({ columns, rows, empty = '暂无数据' }) {
  return <div className="table-scroll"><table><thead><tr>{columns.map(item=><th key={item.key}>{item.label}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row,index)=><tr key={row.id || index}>{columns.map(item=><td key={item.key}>{item.render ? item.render(row[item.key],row) : row[item.key] ?? '—'}</td>)}</tr>) : <tr><td className="empty" colSpan={columns.length}>{empty}</td></tr>}</tbody></table></div>;
}
const fieldNames={id:'编号',username:'用户名',created_at:'创建时间',updated_at:'更新时间',is_sample:'样例项目',project_count:'项目数',task_count:'任务数',last_project_update:'最近项目更新',name:'名称',project:'项目',user:'用户',counts:'汇总',room_count:'房间数',version_count:'版本数',action:'任务类型',status:'任务状态',started_at:'开始时间',finished_at:'结束时间',provider:'服务商',model_name:'模型',actual_cost:'已记录费用',cost_currency:'币种',error_summary:'错误摘要',duration_seconds:'耗时（秒）',versions:'关联版本',version_no:'版本号',style_name:'风格',origin:'来源',asset_count:'素材数',projects:'项目摘要'};
function DetailDialog({detail,onClose}) {
  if(!detail)return null;
  const renderValue=(value)=>value==null?'—':typeof value==='boolean'?(value?'是':'否'):typeof value==='object'?JSON.stringify(value):String(value);
  return <div className="dialog-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><section className="detail-dialog" role="dialog" aria-modal="true" aria-labelledby="detail-title"><header><div><div className="eyebrow">READ ONLY</div><h2 id="detail-title">记录详情</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭">×</button></header>{detail.error?<div className="form-error">{detail.error}</div>:detail.loading?<div className="loading">正在读取…</div>:Object.entries(detail).map(([group,value])=><section className="detail-group" key={group}><h3>{fieldNames[group]||group}</h3>{Array.isArray(value)?value.map((item,index)=><dl key={item.id||index}>{Object.entries(item).map(([key,field])=><div key={key}><dt>{fieldNames[key]||key}</dt><dd>{renderValue(field)}</dd></div>)}</dl>):value&&typeof value==='object'?<dl>{Object.entries(value).map(([key,field])=><div key={key}><dt>{fieldNames[key]||key}</dt><dd>{renderValue(field)}</dd></div>)}</dl>:<p>{renderValue(value)}</p>}</section>)}</section></div>;
}
function Pager({ page, pages, onPage }) { return <div className="pager"><span>第 {page} / {Math.max(1,pages)} 页</span><div><button className="button subtle" disabled={page<=1} onClick={()=>onPage(page-1)}>上一页</button><button className="button subtle" disabled={page>=pages} onClick={()=>onPage(page+1)}>下一页</button></div></div>; }

function Dashboard({ token, user, onLogout }) {
  const [section,setSection]=useState('overview');
  const [data,setData]=useState(null);
  const [page,setPage]=useState(1);
  const [search,setSearch]=useState('');
  const [filter,setFilter]=useState('');
  const [dateFrom,setDateFrom]=useState('');
  const [dateTo,setDateTo]=useState('');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [health,setHealth]=useState(null);
  const [detail,setDetail]=useState(null);
  const [updated,setUpdated]=useState(new Date());
  useEffect(()=>{setPage(1);setSearch('');setFilter('');setDateFrom('');setDateTo('');setData(null);},[section]);

  async function load() {
    setLoading(true); setError('');
    try {
      const query = new URLSearchParams({ page:String(page), limit:'10' });
      if (search.trim()) query.set('q',search.trim());
      if (filter) query.set('filter',filter);
      if (dateFrom) query.set('from',dateFrom);
      if (dateTo) query.set('to',dateTo);
      const path = section === 'overview' ? '/api/admin/overview' : `/api/admin/${section}?${query}`;
      const result = await request(path,token);
      setData(result); setUpdated(new Date());
    } catch (reason) { if (reason.status===401 || reason.status===403) onLogout(); else setError(reason.message); }
    finally { setLoading(false); }
  }
  async function showDetail(type,id) { setDetail({loading:true}); try { setDetail(await request(`/api/admin/${type}/${encodeURIComponent(id)}`,token)); } catch(reason) { setDetail({error:reason.message}); } }
  useEffect(()=>{load();},[section,page,filter,dateFrom,dateTo]);
  useEffect(()=>{if(section==='overview')return;const timer=setTimeout(()=>{setPage(1);load();},300);return ()=>clearTimeout(timer);},[search]);
  useEffect(()=>{request('/api/admin/health',token).then(setHealth).catch(()=>setHealth({app:false,database:false,model:false}));},[token]);

  const controls = section==='users' ? <input className="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索用户名" />
    : section==='projects' ? <><input className="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索项目名称或用户名" /><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="">全部项目</option><option value="sample">样例项目</option><option value="user">用户项目</option></select><input aria-label="更新时间起始" type="date" value={dateFrom} max={dateTo||undefined} onChange={e=>setDateFrom(e.target.value)} /><input aria-label="更新时间结束" type="date" value={dateTo} min={dateFrom||undefined} onChange={e=>setDateTo(e.target.value)} /></>
    : section==='tasks' ? <><input className="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="用户名或项目名" /><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="">全部状态与类型</option><optgroup label="任务状态">{['queued','running','completed','failed','unknown'].map(value=><option key={value} value={value}>{value}</option>)}</optgroup><optgroup label="任务类型">{['analyze','generate','edit','restyle'].map(value=><option key={value} value={value}>{value}</option>)}</optgroup></select><input aria-label="提交时间起始" type="date" value={dateFrom} max={dateTo||undefined} onChange={e=>setDateFrom(e.target.value)} /><input aria-label="提交时间结束" type="date" value={dateTo} min={dateFrom||undefined} onChange={e=>setDateTo(e.target.value)} /></>
    : null;

  const overview = data?.metrics;
  const usersColumns=[{key:'id',label:'用户 ID'},{key:'username',label:'用户名'},{key:'created_at',label:'注册时间',render:date},{key:'project_count',label:'项目数',render:number},{key:'task_count',label:'任务数',render:number},{key:'last_project_update',label:'最近项目更新',render:date},{key:'id',label:'详情',render:v=><button className="text-button" onClick={()=>showDetail('users',v)}>查看</button>}];
  const projectColumns=[{key:'name',label:'项目名称'},{key:'username',label:'所属用户'},{key:'is_sample',label:'项目类型',render:v=><Pill>{v?'样例项目':'用户项目'}</Pill>},{key:'created_at',label:'创建时间',render:date},{key:'updated_at',label:'更新时间',render:date},{key:'asset_count',label:'素材数',render:number},{key:'task_count',label:'任务数',render:number},{key:'version_count',label:'版本数',render:number},{key:'id',label:'详情',render:v=><button className="text-button" onClick={()=>showDetail('projects',v)}>查看</button>}];
  const taskColumns=[{key:'id',label:'任务编号',render:v=><span className="mono">{String(v).slice(0,8)}…</span>},{key:'username',label:'用户'},{key:'project_name',label:'项目'},{key:'action',label:'任务类型',render:v=><Pill>{v}</Pill>},{key:'status',label:'状态',render:v=><Pill status={v}>{v}</Pill>},{key:'created_at',label:'提交时间',render:date},{key:'started_at',label:'开始时间',render:date},{key:'finished_at',label:'结束时间',render:date},{key:'duration_seconds',label:'耗时',render:v=>v==null?'—':`${number(v)} 秒`},{key:'provider',label:'服务商'},{key:'model_name',label:'模型'},{key:'actual_cost',label:'费用',render:(v,row)=>v==null?'未记录':`${v} ${row.cost_currency||''}`},{key:'error_summary',label:'错误摘要'},{key:'id',label:'详情',render:v=><button className="text-button" onClick={()=>showDetail('tasks',v)}>查看</button>}];
  const reviewColumns=[{key:'version_id',label:'版本编号'},{key:'username',label:'评价人'},{key:'project_name',label:'项目'},{key:'structure_preserved',label:'结构保持',render:flag},{key:'layout_preserved',label:'布局保持',render:flag},{key:'usable_for_client',label:'可沟通',render:flag},{key:'edit_region_preserved',label:'选区外保持',render:flag},{key:'notes',label:'用户评价内容',render:v=>{const notes=reviewNotes(v);const overall={good:'满意，可以用于客户沟通',partial:'部分满意，需要调整',poor:'不满意，难以使用'}[notes.overall];return <div className="review-note">{overall&&<b>{overall}</b>}{notes.tags?.length>0&&<span>问题：{notes.tags.join('、')}</span>}{notes.comment&&<p>{notes.comment}</p>}{!overall&&!notes.tags?.length&&!notes.comment&&'—'}</div>}},{key:'created_at',label:'评价时间',render:date}];

  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark">W</span><span><b>无垠空间</b><small>ADMIN CONSOLE</small></span></div>
      <div className="sidebar-label">工作台</div><nav>{nav.map(([key,label,icon])=><button key={key} className={section===key?'nav-item active':'nav-item'} onClick={()=>setSection(key)}><span className="nav-icon">{icon}</span>{label}{section===key&&<i/>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="privacy-mini"><span>◈</span><div><b>本地只读模式</b><small>图纸文件不在后台展示</small></div></div><button className="profile" onClick={onLogout}><span className="avatar">{user?.username?.slice(0,1)||'管'}</span><span className="profile-info"><b>{user?.username}</b><small>超级管理员</small></span><span className="logout">↪</span></button></div>
    </aside>
    <main className="main"><header className="topbar"><div className="breadcrumb">无垠空间 <span>/</span> <b>{titles[section]}</b></div><div className="top-actions"><span className="local-tag"><i/>本地演示</span><span className="top-divider"/><button className="icon-button" aria-label="刷新数据" onClick={load}>↻</button><button className="button logout-button" onClick={onLogout}>退出登录</button></div></header>
      <div className="content"><div className="page-heading"><div><div className="eyebrow">ADMINISTRATION</div><h1>{titles[section]}</h1><p>{section==='overview'?'查看产品使用情况与质量反馈，数据仅供本地演示。':'只读数据视图 · 不展示住宅图纸或生成图片'}</p></div>{section==='overview'&&<button className="button primary" onClick={load}>↻ 刷新数据</button>}</div>
        {error&&<div className="error-banner" role="alert">{error}</div>}
        {section==='overview' && <>
          <div className="metric-grid">{loading&&!overview?Array.from({length:4},(_,i)=><div className="metric skeleton" key={i}/>):<>
            <Metric label="注册用户" value={overview?.users?.total} hint={`近 7 天新增 ${number(overview?.users?.recent)}`} />
            <Metric label="设计项目" value={overview?.projects?.total} hint={`${number(overview?.projects?.sample)} 个样例 · ${number(overview?.projects?.user)} 个用户项目`} tone="violet" />
            <Metric label="生成任务" value={overview?.tasks?.total} hint={`${number(overview?.tasks?.active)} 个进行中`} tone="amber" />
            <Metric label="渲染版本" value={overview?.versions?.total} hint={`${number(overview?.reviews?.total)} 条人工评价`} tone="green" />
          </>}</div>
          <div className="overview-grid"><section className="panel"><div className="panel-head"><div><h2>任务状态</h2><p>当前记录分布</p></div><button className="text-button" onClick={()=>setSection('tasks')}>查看任务 →</button></div>
            {loading&&!overview?<div className="loading">正在读取…</div>:<div className="status-list">{[['queued','排队中'],['running','处理中'],['completed','已完成'],['failed','失败'],['unknown','结果待确认']].map(([key,label])=><div className="status-row" key={key}><span><Pill status={key}>{key}</Pill>{label}</span><b>{number(overview?.tasks?.byStatus?.[key])}</b></div>)}</div>}
            <div className="divider"/><div className="panel-subtitle">任务类型</div><div className="task-types">{Object.entries(overview?.tasks?.byAction||{}).map(([key,value])=><span key={key}><Pill>{key}</Pill><b>{number(value)}</b></span>)}</div>
            <div className="panel-subtitle">耗时与费用（仅统计有记录的数据）</div><div className="task-types"><span><small>平均耗时</small><b>{overview?.tasks?.avgDuration==null?'未记录':`${number(Math.round(overview.tasks.avgDuration))} 秒`}</b></span><span><small>费用合计</small><b>{overview?.cost?.recorded===0?'未记录':overview?.cost?.currencyCount!==1?'币种不一致，未合计':`${number(Number(overview.cost.amount).toFixed(2))} ${overview.cost.currency}`}</b></span></div>
          </section><section className="panel"><div className="panel-head"><div><h2>质量评价</h2><p>人工检查结果概览</p></div><button className="text-button" onClick={()=>setSection('reviews')}>查看评价 →</button></div>
            {loading&&!overview?<div className="loading">正在读取…</div>:<div className="review-summary">{[['结构保持',overview?.reviews?.structure],['布局保持',overview?.reviews?.layout],['客户沟通可用',overview?.reviews?.usable],['选区外保持',overview?.reviews?.edit]].map(([label,value])=><div className="review-row" key={label}><span>{label}</span><strong>{number(value?.yes)} <small>通过</small></strong><span className="review-no">{number(value?.no)} 未通过</span><div className="review-bar"><i style={{width:`${value?.total?value.yes/value.total*100:0}%`}}/></div></div>)}</div>}
            <div className="privacy-callout"><span>✦</span><p><b>隐私保护</b>管理后台只查看文字元数据，不加载图纸、效果图或原始文件名。</p></div>
          </section></div>
          <section className="panel system-panel"><div className="panel-head"><div><h2>系统状态</h2><p>本地服务基础连通性</p></div><span className="updated">更新于 {updated.toLocaleTimeString('zh-CN',{hour12:false})}</span></div><div className="health-items">{[['后台服务',true],['MySQL 数据库',health?.database],['设计服务',health?.app],['生图配置',health?.model]].map(([label,ok])=><div className="health-item" key={label}><span className={ok?'health-dot ok':ok===false?'health-dot bad':'health-dot unknown'}/><span>{label}</span><b>{ok?'正常':ok===false?'未就绪':'检查中'}</b></div>)}</div></section>
        </>}
        {section!=='overview'&&<section className="panel data-panel"><div className="panel-head"><div><h2>{titles[section]}</h2><p>{data?.total==null?'本页数据':`共 ${number(data.total)} 条记录`}</p></div><div className="table-controls">{controls}</div></div>
          {loading&&!data?<div className="loading">正在读取数据…</div>:section==='users'?<Table columns={usersColumns} rows={data?.items||[]} />:section==='projects'?<Table columns={projectColumns} rows={data?.items||[]} />:section==='tasks'?<Table columns={taskColumns} rows={data?.items||[]} />:<Table columns={reviewColumns} rows={data?.items||[]} />}
          {data?.pages>1&&<Pager page={data.page} pages={data.pages} onPage={setPage}/>}</section>}
      <footer className="footer">无垠空间管理后台 <span>·</span> 本地作品集 MVP <span>·</span> 只读访问</footer>
      </div>
    </main>
    <DetailDialog detail={detail} onClose={()=>setDetail(null)}/>
  </div>;
}
function flag(value) { return value == null ? <span className="flag pending">未评价</span> : value ? <span className="flag pass">通过</span> : <span className="flag fail">未通过</span>; }

function App() {
  const [token,setToken]=useState(()=>sessionStorage.getItem(tokenKey));
  const [user,setUser]=useState(null);
  const [checking,setChecking]=useState(Boolean(token));
  function logout() { const current=token; sessionStorage.removeItem(tokenKey); setToken(null); setUser(null); if(current)fetch('/api/auth/logout',{method:'POST',headers:{Authorization:`Bearer ${current}`}}).catch(()=>{}); }
  useEffect(()=>{ if(!token)return; request('/api/admin/session',token).then(result=>setUser(result.user)).catch(()=>logout()).finally(()=>setChecking(false)); },[token]);
  async function login(username,password) {
    const result=await request('/api/auth/login',null,{method:'POST',body:JSON.stringify({username,password})});
    sessionStorage.setItem(tokenKey,result.token);setToken(result.token);setUser(result.user);
  }
  if(checking)return <main className="checking"><div className="spinner"/>正在验证管理员会话…</main>;
  return token&&user?<Dashboard token={token} user={user} onLogout={logout}/>:<SignIn onLogin={login}/>;
}

createRoot(document.getElementById('root')).render(<App/>);

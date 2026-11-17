import {initialWorkspace as initial} from './workspace-state.mjs';
import {mountAuth,unmountAuth} from './auth.jsx';
import {workflowPage,mountWorkflow} from './workflow.js';
import {directions,snapDirection,resizeRect,moveRect} from './space-controls.mjs';
const $ = s => document.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths = {
 logo:'M3 20V4h18v16H3M3 4l18 16M12 4v16', grid:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
 folder:'M3 6h7l2 3h9v11H3z', image:'M3 4h18v16H3zM3 16l5-5 4 4 3-3 6 6M15 8h.01',
 spark:'m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',
 arrow:'M4 12h16m-6-6 6 6-6 6', upload:'M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6',
 download:'M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4', lock:'M6 10h12v11H6zM8 10V6a4 4 0 0 1 8 0v4',
 check:'m5 12 4 4L19 6', chevron:'m9 5 7 7-7 7', help:'M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 4h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
 plus:'M12 5v14M5 12h14', minus:'M5 12h14', expand:'M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6',
 select:'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5', camera:'M3 7h5l2-3h4l2 3h5v13H3zM16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
 history:'M3 5v5h5M3 10a9 9 0 1 1 1 8M12 7v5l3 2', close:'m6 6 12 12M6 18 18 6', leaf:'M20 3C8 1 1 9 6 17c7 5 16-1 14-14M5 20 16 8',
 compare:'M12 3v18M3 5h6v14H3zM15 5h6v14h-6z', file:'M5 3h9l5 5v13H5zM14 3v6h5', trash:'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7'
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.grid}"/></svg>`;
const styles = [
 {name:'现代简约',image:'modern',note:'利落线条 · 留白 · 中性色'},
 {name:'温柔奶油',image:'cream',note:'奶白配色 · 柔和光线 · 圆润家具'},
 {name:'自然原木',image:'wood',note:'自然木纹 · 温暖材质 · 松弛感'},
 {name:'侘寂质感',image:'wabi',note:'自然肌理 · 素色 · 手作细节'},
 {name:'意式轻奢',image:'luxury',note:'石材 · 深色木饰面 · 精致线条'},
 {name:'中古复古',image:'vintage',note:'胡桃木 · 皮革 · 经典家具'}
];
let avatarUrl='',collectionId='';
let collections=[];
let s=initial(), refs=[], drawMode='', toastTimer, saveTimer, saving=Promise.resolve(), polling=false;
let authUser=null, authEpoch=0, projects=[], uploading=false;
localStorage.removeItem('wuyin-auth-user');
const sessionKey='wuyin-tab-session', projectKey='wuyin-tab-project';
// A fresh navigation (including an opener-created tab) must not inherit a tab session.
if(performance.getEntriesByType('navigation')[0]?.type==='navigate'){sessionStorage.removeItem(sessionKey);sessionStorage.removeItem(projectKey);}
const privateImages=new Map();
function clearSession(){sessionStorage.removeItem(sessionKey);sessionStorage.removeItem(projectKey);projects=[];avatarUrl='';collectionId='';for(const value of privateImages.values())URL.revokeObjectURL(value);privateImages.clear();$('#modal').close();$('#modal').innerHTML='';}
function authHeaders(){const token=sessionStorage.getItem(sessionKey);return token?{Authorization:`Bearer ${token}`}:{ };}
async function hydrateImages(){
 const epoch=authEpoch;
 await Promise.all([...document.querySelectorAll('img[data-private-src]')].map(async image=>{
  const source=image.dataset.privateSrc;
  try{
   let url=privateImages.get(source);
   if(!url){const response=await fetch(source,{headers:authHeaders()});if(!response.ok)throw Error('图片读取失败');const blob=await response.blob();if(epoch!==authEpoch)return;url=privateImages.get(source);if(!url){url=URL.createObjectURL(blob);privateImages.set(source,url);}}
   if(epoch===authEpoch&&image.isConnected)image.src=url;
  }catch{if(image.isConnected)image.alt='图片读取失败，请重新登录后重试';}
 }));
}
function privateMarkup(html){return html.replace(/src="((?:\/outputs\/|\/api\/profile\/avatar)[^"]*)"/g,'data-private-src="$1"');}
function protectImages(root){for(const image of root.querySelectorAll('img[src^="/outputs/"],img[src^="/api/profile/avatar"]')){image.dataset.privateSrc=image.getAttribute('src');image.removeAttribute('src');}hydrateImages();}

const activeRoom=()=>s.rooms[s.roomIndex];
const activeVersion=()=>s.versions[s.selectedVersion];
const busy=()=>Boolean(s.job && ['running','queued'].includes(s.job.status));
async function api(path, data) {
 const response=await fetch(path, {headers:{...authHeaders(),...(data===undefined?{}:{'Content-Type':'application/json'})},...(data===undefined?{}:{method:'POST',body:JSON.stringify(data)})});
 const result=await response.json();
 if(!response.ok){if(response.status===401&&authUser){authEpoch++;authUser=null;clearSession();clearTimeout(saveTimer);s=initial();render();}const error=Error(result.error || '请求未完成');error.status=response.status;throw error;}
 if(result.token)sessionStorage.setItem(sessionKey,result.token);
 return result;
}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),5000);}
async function saveWorkspace(){
 if(!authUser||!s.projectId)return;
 const epoch=authEpoch,snapshot=JSON.parse(JSON.stringify(s));
 saving=saving.catch(()=>{}).then(async()=>{if(epoch!==authEpoch)return;const result=await api('/api/workspace',snapshot);if(epoch===authEpoch&&s.projectId===snapshot.projectId&&s.source===snapshot.source)result.rooms.forEach((room,i)=>{if(s.rooms[i]?.name===room.name)s.rooms[i]._dbId=room._dbId;});});
 return saving;
}
function persist(){if([...document.querySelectorAll('.panel-body input[type=number]')].some(el=>!el.validity.valid))return;clearTimeout(saveTimer);saveTimer=setTimeout(()=>saveWorkspace().catch(error=>toast(error.message)),200);}
function update(){render();persist();}
function renderAuth(){mountAuth({api,onSuccess:async user=>{authEpoch++;authUser=user;sessionStorage.removeItem(projectKey);s=initial();await bootWorkspace();}});}
const collectionRefs=id=>refs.filter(r=>(r.collectionId||'wuyin')===id);
const personalProjects=()=>projects.filter(project=>!project.isSample);
async function refreshProjects(){projects=await api('/api/projects');}
async function bootWorkspace(){
 try{
  [refs,collections]=await Promise.all([api('/assets/references.json'),api('/assets/collections.json')]);const profile=await api('/api/profile');avatarUrl=profile.avatar||'';await refreshProjects();
  const id=Number(sessionStorage.getItem(projectKey));
  const saved=id?await api('/api/workspace?projectId='+id):null;
  s={...initial(),...(saved||{}),page:'workspace'};
  s.camera.angle=snapDirection(s.camera.angle);if(activeRoom())activeRoom().camera={...s.camera};
  render();if(busy())poll();
  if(s.job?.pending&&!s.job.id&&s.job.status!=='failed'){s.job.status='unknown';s.job.error='上次提交未确认，请恢复本次任务查询。';render();showRecovery();}
 }catch(error){sessionStorage.removeItem(projectKey);s=initial();render();toast(error.message||'无法连接本地服务，请使用启动脚本打开网站。');}
}
async function ensureProject(name){
 if(s.projectId)return;
 const project=await api('/api/projects',{name:name||'未命名设计项目'});
 s.projectId=project.id;s.projectName=project.name;sessionStorage.setItem(projectKey,String(project.id));
 await refreshProjects();
}
async function openProject(id){
 if(uploading)return toast('文件正在上传，请稍候。');
 clearTimeout(saveTimer);await saveWorkspace();
 const saved=await api('/api/workspace?projectId='+id);
 authEpoch++;s={...initial(),...saved,page:'workspace'};drawMode='';
 if(s.versions.length){s.selectedVersion=s.versions.length-1;s.tab='result';s.step=4;s.selection=null;}
 sessionStorage.setItem(projectKey,String(id));render();if(busy())poll();
}
function newProjectDialog(){
 if(uploading)return toast('文件正在上传，请稍候。');
 if(busy())return toast('当前任务正在运行，完成后再新建项目。');
 openModal('新建项目',`<p class="modal-copy">给这次设计起个名字。图纸、生成结果和修改版本会保存在同一个项目中。</p><form id="project-form"><div class="field"><label class="label" for="project-name">项目名称</label><input id="project-name" name="projectName" required maxlength="128" placeholder="例如：望江公寓 · 客厅方案" autocomplete="off"></div><p class="error-box" id="project-error" role="alert" hidden></p><div class="project-form-actions"><button type="button" class="outline-btn" id="cancel-project">取消</button><button class="primary-btn" type="submit">创建并开始设计 ${icon('arrow')}</button></div></form>`);
 $('#project-name').focus();$('#cancel-project').onclick=()=>$('#modal').close();
 $('#project-form').onsubmit=async event=>{
  event.preventDefault();const name=$('#project-name').value.trim();if(!name){$('#project-name').focus();return;}
  const button=$('#project-form button[type=submit]');button.disabled=true;
  try{
   clearTimeout(saveTimer);await saveWorkspace();
   const project=await api('/api/projects',{name});
   authEpoch++;s={...initial(),projectId:project.id,projectName:project.name};drawMode='';
   sessionStorage.setItem(projectKey,String(project.id));await refreshProjects();
   $('#modal').close();render();await saveWorkspace();toast('项目已创建，请上传平面图。');
  }catch(error){if($('#project-error')){$('#project-error').hidden=false;$('#project-error').textContent=error.message;}}
  finally{button.disabled=false;}
 };
}
function projectsPage(){const personal=personalProjects();return `<div class="projects-heading"><div><div class="eyebrow">YOUR CREATIVE SPACE</div><h1 class="view-title">我的项目</h1><p class="project-subtitle">每次探索，留下一份完整的设计记录。</p></div></div>
 <div class="project-section-title"><h2>我的设计 <span>${personal.length} 个项目</span></h2></div>
 <div class="projects-grid"><button class="new-project-card" data-action="new-project">${icon('plus')}<strong>开启一个新项目</strong><span>上传平面图，探索新的空间意向</span></button>${personal.map(project=>`<article class="design-project-card"><div class="project-image">${project.cover?`<img src="${esc(project.cover)}" alt="${esc(project.name)} 最新生成结果">`:`<div class="project-placeholder">${icon('file')}<span>等待第一张效果图</span></div>`}<span class="project-badge ${project.versions?'complete':''}">${esc(project.status)}</span></div><div class="project-card-body"><h3>${esc(project.name)}</h3><p>${project.versions} 个生成版本 · ${new Date(project.updated).toLocaleDateString('zh-CN')} 更新</p><button class="secondary-btn" data-project="${project.id}">${project.versions?'查看成果与继续设计':'继续设计'} ${icon('arrow')}</button></div></article>`).join('')}</div>
 <div class="project-section-title sample-section-title"><h2>示例项目</h2></div><article class="sample-project-card"><img src="/assets/reference-01.jpg" alt="无垠住宅项目人工参考图"><div><span class="sample-tag">内置样例 · 不计入我的设计</span><h2>无垠住宅项目</h2><p>129 m² · 1 张户型平面图 · 13 张人工参考图<br>附真实 AI 生成与局部修改样例，供对照查看。</p><button class="outline-btn" data-action="sample">查看样例 ${icon('arrow')}</button></div></article>`;}
async function showSample(){
 const epoch=authEpoch, history=[];
 for(const project of projects.filter(project=>project.isSample)){
  const saved=await api('/api/workspace?projectId='+project.id);
  history.push(...saved.versions);
 }
 if(epoch!==authEpoch)return;
 openModal('无垠住宅项目 · 只读样例',`<p class="modal-copy">真实住宅项目，129 m²。图纸和人工图用于结构与风格对照，不作为你的上传资料。下方 AI 样例来自已有 ComfyUI 执行，结构精度仍需人工核对。</p><div class="sample-preview-grid">${[['/assets/plan.jpg','原始户型平面图'],['/assets/reference-01.jpg','人工效果图 · 对照参考'],['/workflows/results/first-render.png','AI 样例 · 首次生成'],['/workflows/results/local-edit.png','AI 样例 · 局部修改']].map(([url,label])=>`<figure><img src="${url}" alt="${label}"><figcaption>${label}</figcaption></figure>`).join('')}</div>${history.length?`<h3 class="sample-history-title">已有验证记录 · ${history.length} 个版本</h3><div class="sample-preview-grid">${history.map(version=>`<figure><img src="${esc(version.url)}" alt="${esc(version.name)} 历史验证结果"><figcaption>${esc(version.name)} · ${esc(version.origin)} · ${esc(version.style)}</figcaption></figure>`).join('')}</div>`:''}<div class="modal-copy">无垠项目人工参考图共 ${collectionRefs('wuyin').length} 张，可在“项目参考图库”中查看。样例不会写入你的设计项目，也不会触发生图。</div><div class="project-form-actions"><button class="primary-btn" id="sample-new">${icon('plus')} 新建自己的项目</button></div>`);
 $('#sample-new').onclick=()=>{$('#modal').close();newProjectDialog();};
}

function chooseRoom(i){if(i===s.roomIndex)return;s.roomIndex=i;s.camera={...activeRoom().camera,angle:snapDirection(activeRoom().camera.angle)};s.confirmed=false;s.selection=null;update();}
function refCards(items,modal=false){return items.map(r=>`<button class="ref-card ${s.reference===r.url?'selected':''}" data-ref="${esc(r.url)}" ${modal?'data-close="1"':''}><img src="${r.url}" alt="${esc(r.project||'无垠住宅项目')}：${esc(r.name)}" loading="lazy"><div class="ref-caption"><span>${esc(r.name)}</span><small>${esc(r.project||'无垠住宅项目')}</small></div></button>`).join('');}
function referencePage(){
 const collection=collections.find(c=>c.id===collectionId);
 if(!collection)return `<div class="eyebrow">PROJECT REFERENCE LIBRARY</div><h1 class="view-title">项目参考图库</h1><p class="helper collection-intro">按项目收纳空间灵感，先选择一本图库，再浏览其中的房间。</p><div class="collection-grid">${collections.map(c=>`<button class="collection-card" data-collection="${c.id}"><div class="collection-cover"><img src="${c.cover}" alt="${esc(c.name)} 图库封面"><span>${collectionRefs(c.id).length} 张参考图</span></div><div class="collection-info"><small>PROJECT COLLECTION</small><h2>${esc(c.name)}</h2><p>${esc(c.description)}</p><strong>打开图库 →</strong></div></button>`).join('')}</div>`;
 const items=collectionRefs(collection.id),rooms=[...new Set(items.map(r=>r.room))];
 return `<button class="text-btn" data-action="collections">← 全部项目图库</button><h1 class="view-title">${esc(collection.name)}</h1><p class="helper collection-intro">${esc(collection.description)} · ${items.length} 张 · 选择图片用作风格参考</p>${rooms.map(room=>`<section class="gallery-room"><div class="section-title"><h2>${esc(room)} <span>${items.filter(r=>r.room===room).length} 张</span></h2></div><div class="gallery-grid">${refCards(items.filter(r=>r.room===room))}</div></section>`).join('')}`;
}
function specsPanel(){return `<div class="field generation-specs"><div class="label">出图规格 <em>每次 1 张 · PNG</em></div><label class="label" for="output-size">画幅与像素尺寸</label><select id="output-size">${[['1536x1024','横幅 3:2 · 1536 × 1024'],['1024x1024','方形 1:1 · 1024 × 1024'],['1024x1536','竖幅 2:3 · 1024 × 1536']].map(([v,label])=>`<option value="${v}" ${s.outputSize===v?'selected':''}>${label}</option>`).join('')}</select><label class="label quality-label" for="output-quality">生成质量</label><select id="output-quality">${[['low','草稿 · 快速探索'],['medium','标准 · 风格沟通'],['high','精细 · 更多细节']].map(([v,label])=>`<option value="${v}" ${s.outputQuality===v?'selected':''}>${label}</option>`).join('')}</select><p class="helper">更高质量可能增加耗时与费用，实际以模型返回为准。局部修改保留原图尺寸。</p></div>`;}
function render(){
 if(!authUser){renderAuth();return;}
 unmountAuth();
 const steps=['上传平面图','核对空间','设计风格','生成效果图','局部修改'];
 $('#app').innerHTML=privateMarkup(`<div class="app-shell">
 <aside class="sidebar"><a href="#" class="brand" data-action="workspace"><div class="brand-mark">${icon('logo')}</div><div><strong>无垠空间</strong><small>WU YIN · DESIGN STUDIO</small></div></a>
 <div class="nav-label">创作空间 / WORKSPACE</div>
 <button class="nav-item ${s.page==='workspace'?'active':''}" data-action="workspace">${icon('grid')}<span>设计工作台</span><small class="tiny">⌘</small></button>
 <button class="nav-item ${s.page==='projects'?'active':''}" data-action="projects">${icon('folder')}<span>我的项目</span><small class="tiny">${personalProjects().length}</small></button>${s.page==='projects'?`<div class="project-mini"><button data-action="new-project">＋ 新建项目</button>${personalProjects().slice(0,4).map(project=>`<button data-project="${project.id}" title="${esc(project.name)}">${esc(project.name)}</button>`).join('')}<button data-action="sample">无垠住宅项目<span>只读样例</span></button></div>`:''}
 <div class="nav-label">设计资源 / RESOURCES</div><button class="nav-item ${s.page==='references'?'active':''}" data-action="references">${icon('image')}<span>项目参考图库</span><small class="tiny">${collections.length}</small></button><button class="nav-item" data-action="help">${icon('help')}<span>使用指南</span></button>
 <div class="nav-label">技术验证 / VALIDATION</div><button class="nav-item ${s.page==='workflow'?'active':''}" data-action="workflow" aria-label="ComfyUI 工作流">${icon('select')}<span>ComfyUI 工作流</span></button>
 <div class="side-bottom"><div class="note-card"><strong>${icon('leaf')} 让灵感，先被看见。</strong>保留空间的骨架，<br>探索生活的不同可能。</div><div class="user"><button class="avatar" data-action="avatar" aria-label="修改头像" title="上传本地图片修改头像">${avatarUrl?`<img src="${esc(avatarUrl)}" alt="我的头像">`:esc((authUser.username||'W').slice(0,1).toUpperCase())}</button><input id="avatar-upload" type="file" accept="image/jpeg,image/png,image/webp"><div><strong>${esc(authUser.username)}</strong><small><button class="logout-btn" data-action="logout">退出登录</button></small></div></div></div></aside>
 <main class="main"><header class="topbar"><div class="crumb">创作空间 ${icon('chevron')} <strong>${s.page==='references'?'项目参考图库':s.page==='projects'?'我的项目':s.page==='workflow'?'ComfyUI 工作流':'设计工作台'}</strong></div><div class="top-actions">${s.page!=='workspace'?'':`<button class="outline-btn" data-action="download">${icon('download')} 导出图片</button>`}</div></header>
 <div class="content">${s.page==='workspace'?`<div class="page-heading"><div><div class="eyebrow">FLOOR PLAN TO ATMOSPHERE</div><h1>从平面，到空间。</h1><p>${s.projectName?`${esc(s.projectName)} · 草稿自动保存，生图后在我的项目查看`:'上传一张平面图，开始新的设计；历史成果请前往“我的项目”。'}</p></div><button class="outline-btn" data-action="new-project">${icon('plus')} 新建项目</button></div>
 <nav class="steps" aria-label="设计流程">${steps.map((name,i)=>`<button class="step ${s.step===i?'active':''} ${i<s.step?'done':''}" data-step="${i}" ${busy()||(!s.source&&i>0)?'disabled':''}><span class="num">${i<s.step?'✓':String(i+1).padStart(2,'0')}</span><div><strong>${name}</strong><small>${['IMPORT YOUR PLAN','VERIFY THE SPACE','DEFINE YOUR STYLE','BRING IT TO LIFE','REFINE THE DETAILS'][i]}</small></div></button>`).join('')}</nav>
 <div class="work-grid"><div><section class="canvas-card"><div class="canvas-bar"><div class="tabs"><button class="tab ${s.tab==='plan'?'active':''}" data-tab="plan">${icon('grid')} 平面图</button><button class="tab ${s.tab==='reference'?'active':''}" data-tab="reference">人工参考图</button><button class="tab ${s.tab==='result'?'active':''}" data-tab="result">AI 效果图 ${s.versions.length?`· ${s.versions.length}`:''}</button><button class="tab ${s.tab==='compare'?'active':''}" data-tab="compare">对照</button></div><button class="icon-btn" data-action="fullscreen" aria-label="切换全屏">${icon('expand')}</button></div>${viewer()}
 <div class="canvas-foot"><span>${icon('file')}${esc(s.tab==='plan'?(s.sourceName||'尚未上传平面图'):s.tab==='reference'?'项目参考 · 仅作对照':s.tab==='compare'?'人工参考 / AI 结果':activeVersion()?.name||'等待生成第一张效果图')}</span><div class="tool-strip"><button class="icon-btn" data-action="zoom-out" aria-label="缩小">${icon('minus')}</button><span class="zoom-val">${s.zoom}%</span><button class="icon-btn" data-action="zoom-in" aria-label="放大">${icon('plus')}</button><button class="icon-btn" data-action="zoom-reset" aria-label="重置缩放">${icon('expand')}</button></div></div></section>
 ${s.source?`<div class="reference-section"><div class="section-title"><h2>项目灵感与对照 <span>PROJECT REFERENCES</span></h2><button class="text-btn" data-action="gallery">浏览 ${collections.length} 个项目 · ${refs.length} 张 ${icon('chevron')}</button></div><div class="reference-strip">${refCards(refs.filter(r=>r.room===(activeRoom()?.name||'客厅')).slice(0,4).length?refs.filter(r=>r.room===(activeRoom()?.name||'客厅')).slice(0,4):refs.slice(0,4))}</div><div class="small-notice">${icon('help')}参考图按项目收纳，为实景／人工效果参考，不代表 AI 生成结果。</div></div>`:''}</div>
 <aside class="settings"><div class="panel-head"><strong>${steps[s.step]}</strong><span>0${s.step+1} / 05</span></div><div class="panel-body">${jobNotice()}${panel()}</div><div class="panel-bottom">${bottomAction()}</div></aside></div>`:s.page==='workflow'?workflowPage():s.page==='references'?referencePage():projectsPage()}
 <footer class="page-footer"><span>WU YIN SPACE &nbsp; / &nbsp; 为设计灵感，留一处空间。</span><span>本地原型 · 资料保存在本机</span></footer></div></main></div>`);
 protectImages($('#app'));
 bind();
 if(s.page==='workflow')mountWorkflow();
}
function viewer(){
 if(!s.source&&!s.versions.length&&!(s.tab==='reference'&&s.reference))return `<div class="viewer empty-workspace"><div class="empty-canvas"><div class="empty-canvas-icon">${icon('file')}</div><span class="eyebrow">A NEW DESIGN STARTS HERE</span><h2>从一张平面图开始</h2><p>上传你的户型图，框选房间，探索空间的第一种可能。<br>JPG / PNG / PDF · 最大 25 MB</p><button class="primary-btn" data-action="upload-plan">${icon('upload')} 上传平面图</button><button class="text-btn" data-action="projects">查看我的项目与样例 ${icon('arrow')}</button></div></div>`;
 if(s.tab==='compare'){
  if(!s.reference)return `<div class="viewer"><div class="empty">请先选择一张人工参考图，再进行对照。<br><button class="text-btn" data-action="gallery">选择参考图 ${icon('arrow')}</button></div></div>`;
  if(!activeVersion())return `<div class="viewer"><div class="empty">${icon('compare')}<br>先生成一张 AI 效果图，再与人工图进行对照。<br><button class="text-btn" data-step="3">前往生成 ${icon('arrow')}</button></div></div>`;
  return `<div class="viewer"><div class="compare-stage" style="--split:50%"><img src="${esc(s.reference)}" alt="人工参考图"><div class="compare-front"><img src="${esc(activeVersion().url)}" alt="AI生成结果"></div><div class="compare-divider"></div><span class="compare-badge left">AI 结果</span><span class="compare-badge right">人工参考</span><input type="range" min="0" max="100" value="50" aria-label="拖动比较 AI 结果和人工图" id="compare-range"></div></div>`;
 }
 if(s.tab==='result'&&!activeVersion())return `<div class="viewer"><div class="empty">${icon('spark')}<br>你的第一张空间意向图，从这里开始。<br>核对空间、选择风格后，提交真实生成任务。<br><button class="text-btn" data-step="1">核对空间 ${icon('arrow')}</button></div></div>`;
 if(s.tab==='reference'&&!s.reference)return `<div class="viewer"><div class="empty">尚未选择参考图。<br><button class="text-btn" data-action="gallery">选择人工参考图 ${icon('arrow')}</button></div></div>`;
 const plan=s.tab==='plan', url=plan?s.source:s.tab==='reference'?s.reference:activeVersion()?.url;
 return `<div class="viewer"><span class="source-label">${plan?(s.isSample?'真实项目平面图':'已上传平面图'):s.tab==='reference'?'项目参考图 · 对照样本':'AI 生成 · 请核对结构'}</span><div id="image-stage" class="image-stage ${drawMode?'drawing':''}" style="width:${s.zoom}%;max-width:none"><img src="${esc(url)}" alt="${plan?'户型平面布置图':s.tab==='reference'?'项目参考效果图':'AI生成室内效果图'}" id="main-image">${plan?s.rooms.map((room,i)=>`<div class="room-box ${i===s.roomIndex?'selected':''}" data-box="${i}" style="left:${room.rect.x*100}%;top:${room.rect.y*100}%;width:${room.rect.w*100}%;height:${room.rect.h*100}%"><button class="room-hit" data-room="${i}" aria-label="选择${esc(room.name)}"><span class="room-tag">${esc(room.name)}${i===s.roomIndex?' · 已选择':''}</span></button>${i===s.roomIndex&&!drawMode&&!busy()?resizeHandles():''}</div>`).join(''):''}${plan&&activeRoom()?`<div class="camera-pin" style="left:${(activeRoom().rect.x+activeRoom().rect.w*s.camera.x)*100}%;top:${(activeRoom().rect.y+activeRoom().rect.h*s.camera.y)*100}%;transform:translate(-50%,-50%) rotate(${s.camera.angle+90}deg)">${icon('camera')}</div>`:''}${!plan&&s.selection?rectMarkup(s.selection):''}</div><span class="viewer-legend"><i class="legend-square"></i>${drawMode==='room'?'拖动框选目标房间':drawMode==='edit'?'拖动框选需要修改的区域':plan?'拖动选框边角调整大小 · 图纸上方为北':s.tab==='reference'?'人工参考图，不是 AI 生成结果':'每张结果均需人工核对空间结构'}</span></div>`;
}
function resizeHandles(target='room'){return [['nw','左上角'],['n','上边'],['ne','右上角'],['e','右边'],['se','右下角'],['s','下边'],['sw','左下角'],['w','左边']].map(([handle,label])=>`<button class="resize-handle handle-${handle}" data-resize="${handle}" data-target="${target}" aria-label="调整${target==='edit'?'选区':'房间'}${label}" title="拖动调整${label}；方向键微调"></button>`).join('');}
function paintRoomRect(r){
 const box=document.querySelector(`[data-box="${s.roomIndex}"]`);
 Object.assign(box.style,{left:r.x*100+'%',top:r.y*100+'%',width:r.w*100+'%',height:r.h*100+'%'});
 const pin=$('.camera-pin');if(pin){pin.style.left=(r.x+r.w*s.camera.x)*100+'%';pin.style.top=(r.y+r.h*s.camera.y)*100+'%';}
}
function cameraDirections(){
 const angle=snapDirection(s.camera.angle),name=directions.find(d=>d.angle===angle).name;
 return `<div class="camera-directions"><div class="label">摄像机朝向 <em>当前：${name}</em></div><div class="compass" role="group" aria-label="摄像机八向选择">${['西北','北','东北','西',null,'东','西南','南','东南'].map(name=>name?`<button class="direction-btn ${directions.find(d=>d.name===name).angle===angle?'selected':''}" data-direction="${directions.find(d=>d.name===name).angle}" aria-label="摄像机朝${name}" aria-pressed="${directions.find(d=>d.name===name).angle===angle}" ${busy()?'disabled':''}>${name}</button>`:`<span class="compass-center">${icon('camera')}</span>`).join('')}</div><p class="helper">以图纸上方为北、右侧为东。</p></div>`;
}
function rectMarkup(r){return `<div class="selection-box editable-selection" data-move="edit" tabindex="0" aria-label="移动局部修改选区，可用方向键微调" style="left:${r.x*100}%;top:${r.y*100}%;width:${r.w*100}%;height:${r.h*100}%">${!drawMode&&!busy()?resizeHandles('edit'):''}</div>`;}
function jobNotice(){
 if(!s.job)return '';
 if(busy())return `<div class="job-status" role="status"><span class="spinner"></span>${esc(s.job.stage)}<div class="helper">真实模型任务 · 已等待 <span id="elapsed">${Math.floor(Date.now()/1000-s.job.created)}</span> 秒<br>耗时取决于模型服务，请勿重复提交。</div></div>`;
 if(['failed','unknown'].includes(s.job.status))return `<div class="error-box" role="alert">${esc(s.job.error)}<br><button class="text-btn" data-action="dismiss-error">我已知晓，返回操作</button></div>`;
 return '';
}
function consent(){return `<label class="checkbox consent-box"><input type="checkbox" id="consent" ${s.consent?'checked':''}>允许将本次平面图／编辑图发送至已配置的模型服务，用于识别和生成。</label>`;}
function panel(){
 const room=activeRoom();
 if(s.step===0)return `<div class="field"><div class="label">项目平面图 <em>JPG / PNG / PDF</em></div><label class="upload-zone ${s.source?'has-preview':''}" id="drop-zone" for="plan-upload">${s.source?`<img class="upload-thumbnail" src="${esc(s.source)}" alt="已上传平面图缩略图"><span class="upload-replace">${icon('upload')} 点击替换，或拖入新图</span>`:`${icon('upload')}<strong>点击上传，或拖入平面图</strong><small>最大 25 MB · PDF 支持选择页面</small>`}</label><input id="plan-upload" type="file" accept="image/jpeg,image/png,application/pdf"><p class="helper">${esc(s.sourceName)}</p></div><div class="field"><div class="label">目标空间 <em>点击图中房间选择</em></div><div class="room-chips">${s.rooms.map((r,i)=>`<button class="chip ${s.roomIndex===i?'selected':''}" data-room="${i}" ${busy()?'disabled':''}>${esc(r.name)}</button>`).join('')}</div></div><button class="secondary-btn" data-action="draw-room" ${busy()||!s.source?'disabled':''}>${icon('select')} ${drawMode==='room'?'正在框选，拖动平面图':(activeRoom()?'重新框选当前房间':'手动框选房间')}</button><p class="annotation-note">${s.recognized?'当前房间来自模型识别，请逐项核对，可重新框选纠正边界。':s.isSample?'样例房间为预先标注，供核对与纠正；并非自动识别结果。':'新上传图纸请先自动识别，或手动框选目标房间。'}</p>${room?cameraDirections():''}${consent()}<button class="secondary-btn" data-action="analyze" ${busy()||!s.consent||!s.source?'disabled':''}>${icon('spark')} 自动识别空间</button><div class="summary-line"><span>资料来源</span><strong>${s.isSample?'无垠 · 真实住宅项目':s.source?'本地上传':'尚未上传'}</strong></div><div class="summary-line"><span>图纸尺寸</span><strong>待核对，不推测</strong></div>`;
 if(s.step===1)return room?`<div class="field"><label class="label" for="room-name">目标房间 <em>可纠正</em></label><input id="room-name" value="${esc(room.name)}"></div><div class="field"><label class="label" for="structure">空间与固定家具 <em>核对后用于生成</em></label><textarea id="structure" rows="4">${esc(room.structure)}</textarea></div><div class="field"><div class="label">房间净尺寸 <em>单位：米（m）</em></div><div class="dimension-grid"><label for="room-length">长<input id="room-length" type="number" min="0.1" max="100" step="0.01" value="${esc(room.length??'')}" placeholder="例如 5.20"></label><label for="room-width">宽<input id="room-width" type="number" min="0.1" max="100" step="0.01" value="${esc(room.width??'')}" placeholder="例如 3.60"></label></div><p class="helper">填写实际净尺寸；未知可留空，不按选框比例推算。</p><label class="label" for="dimensions">图纸尺寸备注 <em>选填</em></label><input id="dimensions" value="${esc(room.dimensions)}"></div><div class="field"><label class="label" for="height">层高 <em>选填</em></label><input id="height" value="${esc(s.height)}" placeholder="例如：2.8 m；未知可留空"></div><div class="field"><div class="label">推荐视角 <em>在房间内微调</em></div><div class="row"><label class="helper">位置 X <input class="range-input" id="camera-x" type="range" min="5" max="95" value="${s.camera.x*100}"></label><label class="helper">位置 Y <input class="range-input" id="camera-y" type="range" min="5" max="95" value="${s.camera.y*100}"></label></div>${cameraDirections()}<p class="helper">视角为建议值。请确认观察点未落在墙体或家具内。</p></div><label class="checkbox"><input id="confirmed" type="checkbox" ${s.confirmed?'checked':''}>我已核对墙体、门窗、空间划分和固定家具；缺失尺寸已注明。</label>`:`<div class="empty">请先框选或识别目标房间。</div><button class="secondary-btn" data-step="0">返回上传</button>`;
 if(s.step===2)return `<div class="field"><div class="label">空间风格 <em>选择一种设计语言</em></div><div class="style-grid">${styles.map(st=>`<button class="style-card ${s.style===st.name?'selected':''}" data-style="${st.name}" aria-pressed="${s.style===st.name}"><img src="/assets/styles/${st.image}.jpg" alt="${st.name}室内风格参考" loading="lazy"><span>${st.name}</span><small>${st.note}</small></button>`).join('')}</div><p class="helper">实景／项目效果参考，展示材质与配色方向，不保证生成同一空间。<a href="/assets/styles/sources.html" target="_blank" rel="noopener">图片来源 ↗</a></p></div><div class="field"><label class="label" for="intent">设计意向 <em>选填</em></label><textarea id="intent" rows="3" placeholder="描述喜欢的材质、家具和灯光氛围">${esc(s.intent)}</textarea></div><div class="field"><div class="label">风格参考图 <em>选填</em></div><label class="checkbox"><input id="use-reference" type="checkbox" ${s.useReference?'checked':''}>使用当前人工图作为风格参考</label><button class="secondary-btn" data-action="upload-reference">${icon('plus')} 上传自己的参考图</button><input id="reference-upload" type="file" accept="image/jpeg,image/png"><p class="helper">参考图仅引导风格，结构仍以确认后的平面图为准。</p></div>${lockCard()}`;
 if(s.step===3)return `<div class="field"><div class="label">本次生成方案 <em>单房间透视图</em></div><div class="summary-line"><span>目标空间</span><strong>${esc(room?.name||'未选择')}</strong></div><div class="summary-line"><span>设计风格</span><strong>${esc(s.style)}</strong></div><div class="summary-line"><span>空间核对</span><strong>${s.confirmed?'已确认':'待确认'}</strong></div><div class="summary-line"><span>房间长 × 宽</span><strong>${esc(room?.length||'待补充')} × ${esc(room?.width||'待补充')} m</strong></div></div>${specsPanel()}${lockCard()}${!s.confirmed?'<div class="error-box">请先完成空间核对，再生成效果图。</div>':''}${consent()}<p class="helper">提交后会向模型服务发送图纸与设计要求。结构约束用于引导生成，结果仍需人工检查。</p>${historyMarkup()}`;
 return `${activeVersion()?`<div class="creation-next"><strong>已保存到我的项目</strong><p>继续打磨，或从新的平面图开始。</p><button class="secondary-btn" data-action="regenerate">按当前方案再生成</button><button class="outline-btn" data-action="new-creation">${icon('plus')} 开始新创作</button></div>`:''}<div class="field"><div class="label">修改方式 <em>沿用当前视角</em></div><div class="room-chips"><button class="chip ${s.editMode==='edit'?'selected':''}" data-editmode="edit">局部重绘</button><button class="chip ${s.editMode==='restyle'?'selected':''}" data-editmode="restyle">全图换风格</button></div></div>${s.editMode==='edit'?`<button class="secondary-btn" data-action="draw-edit" ${busy()?'disabled':''}>${icon('select')}${s.selection?'重新框选修改区域':'框选修改区域'}</button>${s.selection?'<button class="text-btn" data-action="clear-selection">清除选区</button>':''}<p class="helper">${s.selection?'拖动选区移动，拖动八个边角调整；选区外保持原图。':'在图片上拖动框选，如沙发、地毯或灯具。'}</p>`:`<div class="field"><label class="label" for="restyle">整体风格</label><select id="restyle">${styles.map(st=>`<option ${s.style===st.name?'selected':''}>${st.name}</option>`).join('')}</select></div>`}<div class="field" style="margin-top:16px"><label class="label" for="edit-instruction">修改要求</label><textarea id="edit-instruction" placeholder="例如：将沙发换成米色亚麻款，保持位置、体量与其他家具不变。">${esc(s.editInstruction)}</textarea></div>${s.tab==='reference'?'<div class="annotation-note">当前编辑对象为人工参考图，生成版本将标记为“人工图编辑”。</div>':''}<p class="helper">修改沿用当前方案的生成质量，画幅与像素尺寸保持原图。</p>${lockCard()}${consent()}${historyMarkup()}${activeVersion()?`<div class="review-flags"><button class="outline-btn" data-action="quality-review">${icon('check')} 质量评价</button><p class="helper">评价将与当前生成版本关联，用于改进生成体验。</p></div>`:''}`;
}
function lockCard(){return `<div class="lock-card"><strong>${icon('lock')} 本次结构锁定要求</strong>墙体 · 门窗位置 · 空间分隔<br>固定家具位置 · 主要家具布局与比例</div>`;}
function historyMarkup(){return `<div class="section-title"><h2>${icon('history')} 版本记录 <span>${s.versions.length} 个版本</span></h2></div>${s.versions.length?s.versions.map((v,i)=>`<button class="history-item ${i===s.selectedVersion?'selected':''}" data-version="${i}"><img src="${esc(v.url)}" alt="${esc(v.name)}"><div><strong>${esc(v.name)}</strong><small>${esc(v.origin)} · ${esc(v.style)}${v.outputSize?' · '+esc(v.outputSize.replace('x',' × ')):''} · ${new Date(v.time).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</small></div></button>`).reverse().join(''):'<div class="empty">尚无 AI 版本<br>成功结果会保留在这里。</div>'}`;}
function bottomAction(){
 if(busy())return `<button class="primary-btn" disabled><span class="spinner"></span>任务处理中</button><p class="helper">输入与历史版本已保留，可稍后返回。</p>`;
 if(s.step<3){const disabled=s.step===0?!activeRoom():s.step===1?!s.confirmed:false;return `<button class="primary-btn" data-action="next" ${disabled?'disabled':''}>${['选择房间，核对空间','确认空间，选择风格','准备生成效果图'][s.step]} ${icon('arrow')}</button><p class="helper">${['从已有方案，开启一次新的设计探索','确认后的空间信息将作为生成依据','风格由你决定，结构约束随任务提交'][s.step]}</p>`;}
 if(s.step===3)return `<button class="primary-btn" data-action="generate" ${!s.confirmed||!s.consent||!activeRoom()?'disabled':''}>${icon('spark')} 生成空间意向图</button><p class="helper">真实模型调用 · 耗时与成本待实测</p>${activeVersion()?'<button class="text-btn" style="width:100%;justify-content:center;margin-top:12px" data-step="4">继续局部修改 →</button>':''}`;
 return `<button class="primary-btn" data-action="edit" ${!s.consent||(s.tab!=='reference'&&!activeVersion())||(s.editMode==='edit'&&(!s.selection||!s.editInstruction.trim()))?'disabled':''}>${icon('spark')} ${s.editMode==='edit'?'应用局部修改':'生成新的风格版本'}</button><p class="helper">每次修改均保留原版本，可返回重选。</p>`;
}
function bind(){
 document.querySelectorAll('[data-action]').forEach(el=>el.onclick=e=>{e.preventDefault();action(el.dataset.action);});
 document.querySelectorAll('[data-project]').forEach(el=>el.onclick=()=>openProject(Number(el.dataset.project)).catch(error=>toast(error.message)));
 document.querySelectorAll('[data-step]').forEach(el=>el.onclick=()=>{if(busy())return toast('请等待当前任务结束。');if(!s.source&&+el.dataset.step>0)return toast('请先上传平面图。');s.step=+el.dataset.step;s.zoom=100;drawMode='';if(s.step<=1)s.tab='plan';if(s.step===4)s.tab=activeVersion()?'result':'reference';update();});
 document.querySelectorAll('[data-tab]').forEach(el=>el.onclick=()=>{if(s.tab!==el.dataset.tab)s.selection=null;s.tab=el.dataset.tab;s.zoom=100;drawMode='';update();});
 document.querySelectorAll('[data-room]').forEach(el=>el.onclick=e=>{if(drawMode==='room'||busy())return;e.stopPropagation();chooseRoom(+el.dataset.room);});
 document.querySelectorAll('[data-collection]').forEach(el=>el.onclick=()=>{collectionId=el.dataset.collection;render();});
 document.querySelectorAll('[data-style]').forEach(el=>el.onclick=()=>{s.style=el.dataset.style;update();});
 document.querySelectorAll('[data-ref]').forEach(el=>el.onclick=()=>{s.selection=null;s.reference=el.dataset.ref;s.tab='reference';s.page='workspace';if(el.dataset.close)$('#modal').close();update();});
 document.querySelectorAll('[data-version]').forEach(el=>el.onclick=()=>{s.selectedVersion=+el.dataset.version;s.tab='result';s.selection=null;update();});
 document.querySelectorAll('[data-editmode]').forEach(el=>el.onclick=()=>{s.editMode=el.dataset.editmode;drawMode='';update();});
 const fields={'output-size':v=>s.outputSize=v,'output-quality':v=>s.outputQuality=v,'room-length':v=>{activeRoom().length=v;s.confirmed=false;},'room-width':v=>{activeRoom().width=v;s.confirmed=false;},'room-name':v=>{activeRoom().name=v;s.confirmed=false;},structure:v=>{activeRoom().structure=v;s.confirmed=false;},dimensions:v=>{activeRoom().dimensions=v;s.confirmed=false;},height:v=>{s.height=v;s.confirmed=false;},intent:v=>s.intent=v,'edit-instruction':v=>s.editInstruction=v,restyle:v=>s.style=v};
 for(const [id,set] of Object.entries(fields)){const el=$('#'+id);if(el)el.oninput=()=>{set(el.value);persist();const confirmation=$('#confirmed');if(confirmation){confirmation.checked=s.confirmed;const next=$('.panel-bottom [data-action=next]');if(next)next.disabled=!s.confirmed;}const edit=$('.panel-bottom [data-action=edit]');if(edit)edit.disabled=!s.consent||(s.tab!=='reference'&&!activeVersion())||(s.editMode==='edit'&&(!s.selection||!s.editInstruction.trim()));};}
 for(const [id,key] of [['consent','consent'],['confirmed','confirmed'],['use-reference','useReference']]){const el=$('#'+id);if(el)el.onchange=()=>{if(key==='confirmed'&&el.checked&&[...document.querySelectorAll('.panel-body input[type=number]')].some(input=>!input.reportValidity())){el.checked=false;return;}s[key]=el.checked;update();};}
 for(const key of ['x','y']){const el=$('#camera-'+key);if(el){el.oninput=()=>{s.camera[key]=+el.value/100;activeRoom().camera={...s.camera};const pin=$('.camera-pin'), r=activeRoom().rect;if(pin){pin.style.left=(r.x+r.w*s.camera.x)*100+'%';pin.style.top=(r.y+r.h*s.camera.y)*100+'%';pin.style.transform=`translate(-50%,-50%) rotate(${s.camera.angle+90}deg)`;}};el.onchange=()=>{s.confirmed=false;update();};}}
 document.querySelectorAll('[data-direction]').forEach(el=>el.onclick=()=>{if(busy())return;s.camera.angle=+el.dataset.direction;activeRoom().camera={...s.camera};s.confirmed=false;update();});
 if($('#compare-range'))$('#compare-range').oninput=e=>$('.compare-stage').style.setProperty('--split',e.target.value+'%');
 if($('#avatar-upload'))$('#avatar-upload').onchange=e=>uploadAvatar(e.target.files[0]);
 if($('#plan-upload'))$('#plan-upload').onchange=e=>upload(e.target.files[0]);
 if($('#reference-upload'))$('#reference-upload').onchange=e=>upload(e.target.files[0],true);
 const drop=$('#drop-zone');if(drop){drop.ondragover=e=>{e.preventDefault();drop.classList.add('drag');};drop.ondragleave=()=>drop.classList.remove('drag');drop.ondrop=e=>{e.preventDefault();drop.classList.remove('drag');upload(e.dataTransfer.files[0]);};}
 if(busy())document.querySelectorAll('.panel-body input,.panel-body textarea,.panel-body select').forEach(el=>el.disabled=true);
 bindDrawing();
}
function bindDrawing(){
 const stage=$('#image-stage');if(!stage)return;
 let start,preview,drag;
 const point=e=>{const r=stage.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};};
 const paint=(r,target)=>{if(target==='room')paintRoomRect(r);else{const box=stage.querySelector('.editable-selection');Object.assign(box.style,{left:r.x*100+'%',top:r.y*100+'%',width:r.w*100+'%',height:r.h*100+'%'});}};
 const commit=(r,target)=>{if(target==='room'){activeRoom().rect=r;s.confirmed=false;}else s.selection=r;};
 stage.onpointerdown=e=>{
  if(e.button!==0||busy())return;
  const handle=e.target.closest('[data-resize]'),move=e.target.closest('[data-move]');
  if(!drawMode&&(handle||move)){e.preventDefault();const target=handle?.dataset.target||'edit',rect={...(target==='room'?activeRoom().rect:s.selection)};drag={target,handle:handle?.dataset.resize,rect,next:rect,start:point(e)};stage.setPointerCapture(e.pointerId);return;}
  if(!drawMode)return;e.preventDefault();start=point(e);stage.setPointerCapture(e.pointerId);preview=document.createElement('div');preview.className='selection-box';stage.append(preview);
 };
 stage.onpointermove=e=>{
  const p=point(e);
  if(drag){drag.next=drag.handle?resizeRect(drag.rect,drag.handle,p):moveRect(drag.rect,p.x-drag.start.x,p.y-drag.start.y);paint(drag.next,drag.target);return;}
  if(!start)return;Object.assign(preview.style,{left:Math.min(start.x,p.x)*100+'%',top:Math.min(start.y,p.y)*100+'%',width:Math.abs(p.x-start.x)*100+'%',height:Math.abs(p.y-start.y)*100+'%'});
 };
 stage.onpointerup=e=>{
  if(drag){commit(drag.next,drag.target);drag=null;update();return;}
  if(!start)return;const p=point(e),r={x:Math.min(start.x,p.x),y:Math.min(start.y,p.y),w:Math.abs(p.x-start.x),h:Math.abs(p.y-start.y)};start=null;
  if(r.w<.02||r.h<.02){preview.remove();return toast('选区过小，请重新框选。');}
  if(drawMode==='room'){if(activeRoom())activeRoom().rect=r;else{s.rooms.push({name:'自定义房间',rect:r,structure:'请补充墙体、门窗和固定家具信息。',dimensions:'未标注尺寸，待补充',camera:{x:.5,y:.8,angle:270}});s.roomIndex=s.rooms.length-1;}s.camera={...activeRoom().camera,angle:snapDirection(activeRoom().camera.angle)};s.confirmed=false;}else s.selection=r;
  drawMode='';update();
 };
 stage.onpointercancel=()=>{start=null;preview?.remove();if(drag){drag=null;render();}};
 stage.querySelectorAll('[data-resize],[data-move]').forEach(el=>el.onkeydown=e=>{
  if(e.target!==el||busy()||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
  e.preventDefault();e.stopPropagation();const target=el.dataset.target||'edit',r=target==='room'?activeRoom().rect:s.selection,h=el.dataset.resize,delta=e.shiftKey?.02:.005,dx=e.key==='ArrowLeft'?-delta:e.key==='ArrowRight'?delta:0,dy=e.key==='ArrowUp'?-delta:e.key==='ArrowDown'?delta:0;
  const next=h?resizeRect(r,h,{x:(h.includes('w')?r.x:r.x+r.w)+dx,y:(h.includes('n')?r.y:r.y+r.h)+dy}):moveRect(r,dx,dy);
  commit(next,target);update();document.querySelector(h?`[data-target="${target}"][data-resize="${h}"]`:'[data-move="edit"]')?.focus();
 });
}

async function action(name){
 if(name==='logout'){if(uploading)return toast('文件正在上传，请稍候。');try{clearTimeout(saveTimer);await saveWorkspace();await api('/api/auth/logout',{});authEpoch++;authUser=null;clearSession();s=initial();drawMode='';render();}catch(error){toast(error.message);}return;}
 if(name==='avatar'){$('#avatar-upload').click();return;}
 if(name==='quality-review'){showQualityReview();return;}
 if(name==='collections'){collectionId='';render();return;}
 if(name==='clear-selection'){s.selection=null;drawMode='';update();return;}
 if(name==='regenerate'){s.step=3;s.tab='plan';s.selection=null;update();return;}
 if(name==='new-creation'){if(busy()||uploading)return toast('请等待当前任务完成。');try{clearTimeout(saveTimer);await saveWorkspace();authEpoch++;s=initial();drawMode='';sessionStorage.removeItem(projectKey);render();toast('历史成果已保留，请上传新的平面图。');}catch(error){toast(error.message);}return;}
 if(name==='new-project'){newProjectDialog();return;}
 if(name==='sample'){try{await showSample();}catch(error){toast(error.message);}return;}
 if(name==='upload-plan'){$('#plan-upload')?.click();return;}
 if(['workspace','projects','references','workflow'].includes(name)){try{if(name==='projects'){await saveWorkspace();await refreshProjects();}s.page=name;render();}catch(error){toast(error.message);}return;}
 if(name==='next'){if([...document.querySelectorAll('.panel-body input')].some(el=>!el.reportValidity()))return;s.step++;s.tab='plan';update();return;}
 if(name==='help'){showHelp();return;}
 if(name==='gallery'){s.page='references';collectionId='';render();return;}
 if(name==='draw-room'){if(busy())return;if(!s.source)return toast('请先上传平面图。');drawMode=drawMode==='room'?'':'room';s.tab='plan';update();return;}
 if(name==='draw-edit'){if(busy())return;if(!activeVersion()&&s.tab!=='reference')s.tab='reference';drawMode='edit';update();return;}
 if(name==='fullscreen'){document.body.classList.toggle('fullscreen');return;}
 if(name.startsWith('zoom-')){s.zoom=name==='zoom-reset'?100:Math.max(50,Math.min(200,s.zoom+(name==='zoom-in'?25:-25)));update();return;}
 if(name==='download'){const version=activeVersion();if(!version)return toast('请先生成 AI 效果图，再导出。');const a=document.createElement('a');const response=await fetch(version.url,{headers:authHeaders()});if(!response.ok)return toast('图片下载失败，请重新登录后重试。');const url=URL.createObjectURL(await response.blob());a.href=url;a.download=`无垠-${version.name}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
 if(name==='upload-reference'){$('#reference-upload').click();return;}
 if(name==='dismiss-error'){s.job=null;update();return;}
 if(['generate','edit','analyze'].includes(name))await submit(name);
}
function openModal(title,body){$('#modal').innerHTML=privateMarkup(`<div class="modal-heading"><h2>${title}</h2><button class="icon-btn" id="close-modal" aria-label="关闭">${icon('close')}</button></div>${body}`);$('#close-modal').onclick=()=>$('#modal').close();protectImages($('#modal'));$('#modal').showModal();document.querySelectorAll('#modal [data-ref]').forEach(el=>el.onclick=()=>{s.selection=null;s.reference=el.dataset.ref;s.page='workspace';s.tab='reference';$('#modal').close();update();});}
function showQualityReview(){const id=activeVersion()?.id;if(!id)return;const review=s.review[id]||{},issues=['墙体、门窗或空间分隔有偏差','主要家具布局或比例不符合平面图','整体风格与选择不一致','家具款式不符合预期','材质或细节表现不足','光线与氛围不合适','视角或画面构图不理想','图片清晰度不足','局部修改影响了未选区域','其他问题'];openModal('生成图片质量评价',`<p class="modal-copy">请评价当前版本 ${esc(activeVersion().name)}。固定选项和补充意见会一起保存，帮助我们定位需要改进的环节。</p><form id="quality-review-form"><fieldset class="review-group"><legend>整体体验</legend>${[['good','满意，可以用于客户沟通'],['partial','部分满意，需要调整'],['poor','不满意，难以使用']].map(([value,label])=>`<label class="review-option"><input type="radio" name="review-overall" value="${value}" ${review.overall===value?'checked':''}>${label}</label>`).join('')}</fieldset><fieldset class="review-group"><legend>结果核对</legend>${[['structure','结构与门窗保持',0],['layout','主要家具布局保持',1],['usable','可用于客户沟通',2],['editRegion','局部修改未影响其他区域',3]].map(([name,label,key])=>`<label class="review-option"><input type="checkbox" name="${name}" ${review[key]?'checked':''}>${label}</label>`).join('')}</fieldset><fieldset class="review-group"><legend>遇到的问题（可多选）</legend><div class="review-tag-grid">${issues.map(tag=>`<label class="review-tag"><input type="checkbox" name="review-tag" value="${esc(tag)}" ${(review.tags||[]).includes(tag)?'checked':''}><span>${esc(tag)}</span></label>`).join('')}</div></fieldset><label class="review-comment-label" for="review-comment">补充意见 <span>选填</span></label><textarea id="review-comment" name="comment" maxlength="2000" placeholder="例如：客厅窗户位置基本正确，但沙发距离电视墙太近；希望下一版能更准确地保留走道宽度。">${esc(review.comment||'')}</textarea><div class="project-form-actions"><button type="button" class="outline-btn" id="cancel-review">取消</button><button type="submit" class="primary-btn">保存评价</button></div></form>`);$('#cancel-review').onclick=()=>$('#modal').close();$('#quality-review-form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type=submit]');button.disabled=true;const tags=[...form.querySelectorAll('[name="review-tag"]:checked')].map(el=>el.value),overall=form.querySelector('[name="review-overall"]:checked')?.value||'';s.review[id]={...(s.review[id]||{}),0:form.elements.structure.checked,1:form.elements.layout.checked,2:form.elements.usable.checked,3:form.elements.editRegion.checked,tags,overall,comment:form.elements.comment.value.trim()};try{await saveWorkspace();$('#modal').close();toast('质量评价已保存，感谢你的反馈。');}catch(error){button.disabled=false;toast(`评价保存失败：${error.message}`);}};}
function showHelp(){openModal('让平面图，成为空间意向。',`<div class="modal-copy"><h3>01 / 上传与核对</h3><p>每次登录从空白工作台开始，在“我的项目”新建项目或直接上传后自动建档。内置无垠项目仅作只读样例。请上传 JPG、PNG 或 PDF，运行自动识别或手动框选；模型识别结果必须人工核对。原图未标注尺寸，不能视为已知。</p><h3>02 / 风格与真实生成</h3><p>核对墙体、门窗、固定家具和尺寸后，选择风格。勾选资料发送确认，即可提交真实模型任务。资料将发往本机已配置的第三方服务 mckj.hk.cn。密钥只由本机服务读取，不会进入网页。</p><h3>03 / 局部修改与版本</h3><p>打开生成结果，选择“局部修改”，在图片上拖动框选并填写要求。选区外像素由本地合成保留；选区内的结构、家具比例仍须人工核对。修改不覆盖原版本，也支持对人工参考图进行编辑实验。</p><h3>04 / 资料与边界</h3><p>上传图纸与版本保存在当前原型目录的 outputs/。原始项目文件不修改。登录账号用于进入本机原型；账号密码以哈希形式保存在 MySQL，图片文件仍保存在本地 outputs/。账号、项目、房间、任务和版本信息保存在本机 MySQL，文件访问按登录账号校验。请勿直接删除数据库记录或图片文件，以免破坏关联；历史 JSON 仅作迁移备份。</p><h3>05 / 对照与恢复</h3><p>人工图库不作为 AI 成果。真实生成成功后，可以切换对照视图拖动比较。任务失败保留输入；超时或服务中断会标记结果未知，请核对上游记录，避免重复提交。</p></div>`);}
async function uploadAvatar(file){
 if(!file)return;if(file.size>5*1024*1024)return toast('头像最大支持 5 MB。');
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))return toast('请选择 JPG、PNG 或 WebP 图片。');
 try{const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file);});
 const profile=await api('/api/profile/avatar',{data});avatarUrl=profile.avatar;render();toast('头像已更新。');}catch(error){toast(error.message||'头像上传失败。');}
}
async function upload(file,reference=false){
 if(!file)return;if(uploading)return toast('文件正在上传，请稍候。');if(busy())return toast('请等待当前任务结束后再替换图纸。');
 if(file.size>25*1024*1024)return toast('文件超过25 MB，请压缩后上传。');
 if(!/\.(jpe?g|png|pdf)$/i.test(file.name)||reference&&/\.pdf$/i.test(file.name))return toast('请选择 JPG、PNG 或 PDF；参考图仅支持图片。');
 uploading=true;const epoch=authEpoch;toast('正在处理文件，请稍候…');
 try{await ensureProject(file.name.replace(/\.[^.]+$/,'').slice(0,128)||'未命名设计项目');const buffer=await file.arrayBuffer();let raw='';for(const b of new Uint8Array(buffer))raw+=String.fromCharCode(b);const result=await api('/api/upload',{projectId:s.projectId,data:btoa(raw),name:file.name,reference});if(epoch!==authEpoch)return;
 const apply=url=>{if(reference){s.reference=url;s.useReference=true;toast('已添加风格参考图。');}else{s.page='workspace';s.source=url;s.sourceName=file.name;s.isSample=false;s.recognized=false;s.rooms=[];s.roomIndex=0;s.confirmed=false;s.selectedVersion=-1;s.selection=null;s.job=null;s.tab='plan';s.step=0;toast('上传成功。请自动识别或手动框选房间。');}update();};
 if(result.pages.length===1)apply(result.pages[0]);else{openModal('选择 PDF 页面',`<div class="modal-grid">${result.pages.map((url,i)=>`<button class="ref-card" data-pdf="${url}"><img src="${url}" alt="PDF第${i+1}页"><div class="ref-caption">第 ${i+1} 页</div></button>`).join('')}</div>`);document.querySelectorAll('[data-pdf]').forEach(el=>el.onclick=()=>{$('#modal').close();apply(el.dataset.pdf);});}
 }catch(error){toast(error.message);}finally{uploading=false;}
}
async function submit(kind){
 if(busy())return;if(!s.projectId||!s.source)return toast('请先上传平面图。');if(!s.consent)return toast('请先确认允许发送本次资料。');
 if(s.job?.status==='unknown')return toast('上次任务结果未知，请先核对上游记录并确认后关闭提示。');
 const room=activeRoom();
 if(kind==='generate'&&(!room||!s.confirmed))return toast('请先核对空间结构。');
 const base=s.tab==='reference'?s.reference:activeVersion()?.url;
 if(kind==='edit'&&!base)return toast('请先选择生成结果或人工参考图。');
 const requestId=crypto.randomUUID();
 const data={projectId:s.projectId,requestId,roomId:room?._dbId,outputSize:s.outputSize,outputQuality:s.outputQuality,roomLength:room?.length||null,roomWidth:room?.width||null,cameraSettings:{...s.camera},parentVersionId:kind==='edit'&&s.tab!=='reference'?activeVersion()?.id:null,source:kind==='edit'?base:s.source,consent:s.consent,room:room?.name,roomRect:room?.rect,structure:(room?.structure||'')+'；尺寸：'+(room?.dimensions||'未知'),height:s.height,style:s.style,camera:`房间框内相对位置(${s.camera.x.toFixed(2)},${s.camera.y.toFixed(2)})，朝${directions.find(d=>d.angle===s.camera.angle)?.name}，方向${s.camera.angle}度（图纸上方为北）`,confirmed:s.confirmed,instruction:kind==='edit'?s.editInstruction:s.intent,action:kind==='edit'?s.editMode:'generate',selection:s.selection,reference:s.useReference?s.reference:null};
 const context={style:s.style,origin:kind==='analyze'?'空间识别':kind==='generate'?'平面图生成':s.tab==='reference'?'人工图编辑':s.editMode==='edit'?'局部重绘':'全图换风格',parent:kind==='edit'&&s.tab!=='reference'?activeVersion()?.id:null};
 // Save the request identity before dispatch so a lost response can be recovered idempotently.
 s.job={id:null,requestId,status:'queued',created:Date.now()/1000,stage:'正在提交任务',context,pending:{path:kind==='analyze'?'/api/analyze':'/api/generate',data}};update();
 try{clearTimeout(saveTimer);await saveWorkspace();const job=await api(s.job.pending.path,data);s.job={...job,context};update();poll();}
 catch(error){s.job={...s.job,status:error.status&&error.status<500?'failed':'unknown',error:error.status&&error.status<500?error.message:`未确认任务是否已受理：${error.message}。可恢复查询。`};update();if(s.job.status==='unknown')showRecovery();}
}
function showRecovery(){if(!s.job?.pending||s.job.status!=='unknown')return;const box=$('.error-box');if(box){const b=document.createElement('button');b.className='secondary-btn';b.textContent='恢复本次任务查询';b.onclick=async()=>{try{const j=await api(s.job.pending.path,s.job.pending.data);s.job={...j,context:s.job.context};update();poll();}catch(e){toast(e.message);}};box.append(b);}}
async function poll(){
 if(polling===authEpoch||!authUser||!s.job?.id||!busy())return;const epoch=authEpoch;polling=epoch;
 try{while(authUser&&epoch===authEpoch&&s.job?.id&&busy()){
  let job;try{job=await api('/api/jobs/'+s.job.id);}catch{if(epoch!==authEpoch||!authUser)break;toast('暂时无法查询任务，稍后自动恢复。');await new Promise(r=>setTimeout(r,5000));continue;}
  if(epoch!==authEpoch||!authUser)break;
  const context=s.job.context;s.job={...job,context};
  if(job.status==='completed'){
   if(job.kind==='analyze'){s.rooms=job.rooms;s.recognized=true;s.roomIndex=0;s.camera={...activeRoom().camera,angle:snapDirection(activeRoom().camera.angle)};s.confirmed=false;s.tab='plan';s.step=1;toast('识别完成，请核对结构和尺寸。');}
   else{if(!s.versions.some(v=>v.id===job.id)){s.versions.push({id:job.id,url:job.image,name:`V${String(s.versions.length+1).padStart(2,'0')} · ${context?.origin||'AI 结果'}`,style:context?.style||s.style,origin:context?.origin||'真实生成',time:Date.now(),outputSize:job.outputSize,outputQuality:job.outputQuality,seconds:Math.round(job.finished-job.created),parent:context?.parent});}s.selectedVersion=s.versions.findIndex(v=>v.id===job.id);s.tab='result';s.step=4;s.selection=null;toast('生图记录已保存到“我的项目”，请核对结构与布局。');}update();try{clearTimeout(saveTimer);await saveWorkspace();await refreshProjects();render();}catch(error){toast('生成结果已入库，但草稿同步未确认：'+error.message);}break;
  }
  render();persist();if(!busy())break;await new Promise(r=>setTimeout(r,2500));
 }}finally{if(polling===epoch)polling=false;}
}
try{const session=await api('/api/auth/session');authUser=session.user;if(authUser)await bootWorkspace();else render();}catch(error){render();toast(error.message);}

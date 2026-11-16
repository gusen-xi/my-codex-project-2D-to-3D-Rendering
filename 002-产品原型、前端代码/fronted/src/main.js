import {workflowPage,mountWorkflow} from './workflow.js';
import {directions,snapDirection,resizeRect} from './space-controls.mjs';
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
const sampleRooms = [
 {name:'客厅',rect:{x:.415,y:.06,w:.225,h:.425},structure:'客厅位于户型上部中央，沙发沿右侧布置、茶几居中，左侧为电视背景墙，上侧有外窗及吊椅。相邻餐厅位于右侧。墙体、门窗与家具位置请对照原图核对。',dimensions:'原图未标注尺寸，待补充',camera:{x:.18,y:.87,angle:300}},
 {name:'餐厅',rect:{x:.638,y:.18,w:.13,h:.29},structure:'餐桌位于客厅右侧，长桌与餐椅沿纵向布置，靠近厨房。门窗及固定家具待核对。',dimensions:'原图未标注尺寸，待补充',camera:{x:.5,y:.86,angle:270}},
 {name:'主卧',rect:{x:.185,y:.50,w:.228,h:.32},structure:'户型左下卧室，床头靠上侧，衣柜沿下侧布置，左侧连接阳光房。房间命名及门窗位置待核对。',dimensions:'原图未标注尺寸，待补充',camera:{x:.8,y:.85,angle:235}},
 {name:'次卧',rect:{x:.185,y:.18,w:.225,h:.31},structure:'户型左上卧室，床头靠上侧，右侧为衣柜，左侧外窗。门洞位于右下侧。',dimensions:'原图未标注尺寸，待补充',camera:{x:.82,y:.85,angle:230}},
 {name:'书房',rect:{x:.778,y:.18,w:.145,h:.21},structure:'户型右上房间，长桌靠上侧布置。右上侧墙体转角弧形，开窗与柜体待核对。',dimensions:'原图未标注尺寸，待补充',camera:{x:.4,y:.84,angle:270}},
 {name:'厨房',rect:{x:.778,y:.398,w:.148,h:.23},structure:'户型右侧中部厨房，操作台与灶台沿右侧及下侧布置，水槽位于右侧。',dimensions:'原图未标注尺寸，待补充',camera:{x:.16,y:.3,angle:45}}
];
const styles = [
 {name:'现代简约',en:'MODERN',colors:['#d7d8d0','#838880','#393d38']},
 {name:'温柔奶油',en:'CREAM',colors:['#e7dfcd','#d4c6ac','#b4a58a']},
 {name:'自然原木',en:'NATURAL',colors:['#d6c7af','#a78a65','#eee9dd']},
 {name:'侘寂质感',en:'WABI-SABI',colors:['#c8c3b5','#8c8a7e','#dedbd1']},
 {name:'意式轻奢',en:'ITALIAN',colors:['#aaa292','#5d5b54','#c8b58d']},
 {name:'中古复古',en:'VINTAGE',colors:['#b89c7d','#675747','#d6c5a8']}
];
const initial = () => ({page:'workspace',source:'/assets/plan.jpg',sourceName:'无垠 · 户型平面布置图.jpg',isSample:true,recognized:false,rooms:structuredClone(sampleRooms),roomIndex:0,step:0,tab:'plan',style:'现代简约',height:'',intent:'黑白灰基调，低靠背模块沙发，黑色金属细节，通透自然光。',confirmed:false,consent:false,camera:{x:.18,y:.87,angle:300},versions:[],selectedVersion:-1,reference:'/assets/reference-01.jpg',selection:null,editInstruction:'',editMode:'edit',job:null,zoom:100,review:{}});
let s=initial(), refs=[], drawMode='', toastTimer, saveTimer, saving=Promise.resolve(), polling=false;
const activeRoom=()=>s.rooms[s.roomIndex];
const activeVersion=()=>s.versions[s.selectedVersion];
const busy=()=>Boolean(s.job && ['running','queued'].includes(s.job.status));
async function api(path, data) {
 const response=await fetch(path, data === undefined ? {} : {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 const result=await response.json();
 if(!response.ok){const error=Error(result.error || '请求未完成');error.status=response.status;throw error;}
 return result;
}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),5000);}
function persist(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{const snapshot=JSON.parse(JSON.stringify(s));saving=saving.catch(()=>{}).then(()=>api('/api/workspace',snapshot)).catch(()=>toast('工作区暂未保存，请保持页面打开。'));},200);}
function update(){render();persist();}
function chooseRoom(i){if(i===s.roomIndex)return;s.roomIndex=i;s.camera={...activeRoom().camera,angle:snapDirection(activeRoom().camera.angle)};s.confirmed=false;s.selection=null;update();}
function refCards(items,modal=false){return items.map(r=>`<button class="ref-card ${s.reference===r.url?'selected':''}" data-ref="${esc(r.url)}" ${modal?'data-close="1"':''}><img src="${r.url}" alt="无垠项目人工效果图：${esc(r.name)}" loading="lazy"><div class="ref-caption"><span>${esc(r.name)}</span><small>人工参考</small></div></button>`).join('');}
function render(){
 const steps=['上传平面图','核对空间','设计风格','生成效果图','局部修改'];
 $('#app').innerHTML=`<div class="app-shell">
 <aside class="sidebar"><a href="#" class="brand" data-action="workspace"><div class="brand-mark">${icon('logo')}</div><div><strong>无垠空间</strong><small>WU YIN · DESIGN STUDIO</small></div></a>
 <div class="nav-label">创作空间 / WORKSPACE</div>
 <button class="nav-item ${s.page==='workspace'?'active':''}" data-action="workspace">${icon('grid')}<span>设计工作台</span><small class="tiny">⌘</small></button>
 <button class="nav-item ${s.page==='projects'?'active':''}" data-action="projects">${icon('folder')}<span>我的项目</span><small class="tiny">01</small></button>${s.page==='projects'?`<div class="project-mini">无垠 · 住宅设计<span>129 m² · 真实项目样例</span></div>`:''}
 <div class="nav-label">设计资源 / RESOURCES</div><button class="nav-item ${s.page==='references'?'active':''}" data-action="references">${icon('image')}<span>项目参考图库</span><small class="tiny">13</small></button><button class="nav-item" data-action="help">${icon('help')}<span>使用指南</span></button>
 <div class="nav-label">技术验证 / VALIDATION</div><button class="nav-item ${s.page==='workflow'?'active':''}" data-action="workflow" aria-label="ComfyUI 工作流">${icon('select')}<span>ComfyUI 工作流</span></button>
 <div class="side-bottom"><div class="note-card"><strong>${icon('leaf')} 让灵感，先被看见。</strong>保留空间的骨架，<br>探索生活的不同可能。</div><div class="user"><div class="avatar">W</div><div><strong>设计师试用空间</strong><small>LOCAL PROTOTYPE · v0.1</small></div></div></div></aside>
 <main class="main"><header class="topbar"><div class="crumb">创作空间 ${icon('chevron')} <strong>${s.page==='references'?'项目参考图库':s.page==='projects'?'我的项目':s.page==='workflow'?'ComfyUI 工作流':'设计工作台'}</strong></div><div class="top-actions">${s.page==='workflow'?'':`<button class="outline-btn" data-action="download">${icon('download')} 导出图片</button>`}</div></header>
 <div class="content">${s.page==='workspace'?`<div class="page-heading"><div><div class="eyebrow">FLOOR PLAN TO ATMOSPHERE</div><h1>从平面，到空间。</h1><p>让每一份户型，都有看得见的设计想象。</p></div></div>
 <nav class="steps" aria-label="设计流程">${steps.map((name,i)=>`<button class="step ${s.step===i?'active':''} ${i<s.step?'done':''}" data-step="${i}" ${busy()?'disabled':''}><span class="num">${i<s.step?'✓':String(i+1).padStart(2,'0')}</span><div><strong>${name}</strong><small>${['IMPORT YOUR PLAN','VERIFY THE SPACE','DEFINE YOUR STYLE','BRING IT TO LIFE','REFINE THE DETAILS'][i]}</small></div></button>`).join('')}</nav>
 <div class="work-grid"><div><section class="canvas-card"><div class="canvas-bar"><div class="tabs"><button class="tab ${s.tab==='plan'?'active':''}" data-tab="plan">${icon('grid')} 平面图</button><button class="tab ${s.tab==='reference'?'active':''}" data-tab="reference">人工参考图</button><button class="tab ${s.tab==='result'?'active':''}" data-tab="result">AI 效果图 ${s.versions.length?`· ${s.versions.length}`:''}</button><button class="tab ${s.tab==='compare'?'active':''}" data-tab="compare">对照</button></div><button class="icon-btn" data-action="fullscreen" aria-label="切换全屏">${icon('expand')}</button></div>${viewer()}
 <div class="canvas-foot"><span>${icon('file')}${esc(s.tab==='plan'?s.sourceName:s.tab==='reference'?'人工制作 · 仅作对照':s.tab==='compare'?'人工参考 / AI 结果':activeVersion()?.name||'等待生成第一张效果图')}</span><div class="tool-strip"><button class="icon-btn" data-action="zoom-out" aria-label="缩小">${icon('minus')}</button><span class="zoom-val">${s.zoom}%</span><button class="icon-btn" data-action="zoom-in" aria-label="放大">${icon('plus')}</button><button class="icon-btn" data-action="zoom-reset" aria-label="重置缩放">${icon('expand')}</button></div></div></section>
 <div class="reference-section"><div class="section-title"><h2>项目灵感与对照 <span>PROJECT REFERENCES</span></h2><button class="text-btn" data-action="gallery">查看全部 13 张 ${icon('chevron')}</button></div><div class="reference-strip">${refCards(refs.filter(r=>r.room===(activeRoom()?.name||'客厅')).slice(0,4).length?refs.filter(r=>r.room===(activeRoom()?.name||'客厅')).slice(0,4):refs.slice(0,4))}</div><div class="small-notice">${icon('help')}参考图来自无垠住宅项目，均为人工效果图，不代表 AI 生成结果。</div></div></div>
 <aside class="settings"><div class="panel-head"><strong>${steps[s.step]}</strong><span>0${s.step+1} / 05</span></div><div class="panel-body">${jobNotice()}${panel()}</div><div class="panel-bottom">${bottomAction()}</div></aside></div>`:s.page==='workflow'?workflowPage():s.page==='references'?`<div class="eyebrow">THE PROJECT ARCHIVE</div><h1 class="view-title">无垠 · 项目参考图库</h1><p class="helper" style="margin-bottom:24px">13 张人工效果图，作为生成结果的结构、布局与风格对照。点击选择一张参考图。</p><div class="gallery-grid">${refCards(refs)}</div>`:`<div class="eyebrow">YOUR CREATIVE SPACE</div><h1 class="view-title">我的项目</h1><div class="overview-card"><img class="project-cover" src="/assets/reference-01.jpg" alt="无垠住宅项目客厅人工效果图"><h2>无垠 · 住宅设计</h2><p>129 m² · 真实住宅项目<br>1 张户型平面图 · 13 张人工效果图 · ${s.versions.length} 个 AI 版本<br>原始 DWG 已归档；当前原型以平面图进行验证。</p><button class="primary-btn" data-action="workspace">进入设计工作台 ${icon('arrow')}</button></div>`}
 <footer class="page-footer"><span>WU YIN SPACE &nbsp; / &nbsp; 为设计灵感，留一处空间。</span><span>本地原型 · 资料保存在本机</span></footer></div></main></div>`;
 bind();
 if(s.page==='workflow')mountWorkflow();
}
function viewer(){
 if(s.tab==='compare'){
  if(!activeVersion())return `<div class="viewer"><div class="empty">${icon('compare')}<br>先生成一张 AI 效果图，再与人工图进行对照。<br><button class="text-btn" data-step="3">前往生成 ${icon('arrow')}</button></div></div>`;
  return `<div class="viewer"><div class="compare-stage" style="--split:50%"><img src="${esc(s.reference)}" alt="人工参考图"><div class="compare-front"><img src="${esc(activeVersion().url)}" alt="AI生成结果"></div><div class="compare-divider"></div><span class="compare-badge left">AI 结果</span><span class="compare-badge right">人工参考</span><input type="range" min="0" max="100" value="50" aria-label="拖动比较 AI 结果和人工图" id="compare-range"></div></div>`;
 }
 if(s.tab==='result'&&!activeVersion())return `<div class="viewer"><div class="empty">${icon('spark')}<br>你的第一张空间意向图，从这里开始。<br>核对空间、选择风格后，提交真实生成任务。<br><button class="text-btn" data-step="1">核对空间 ${icon('arrow')}</button></div></div>`;
 const plan=s.tab==='plan', url=plan?s.source:s.tab==='reference'?s.reference:activeVersion()?.url;
 return `<div class="viewer"><span class="source-label">${plan?(s.isSample?'真实项目平面图':'已上传平面图'):s.tab==='reference'?'人工效果图 · 对照样本':'AI 生成 · 请核对结构'}</span><div id="image-stage" class="image-stage ${drawMode?'drawing':''}" style="width:${s.zoom}%;max-width:none"><img src="${esc(url)}" alt="${plan?'户型平面布置图':s.tab==='reference'?'项目人工参考效果图':'AI生成室内效果图'}" id="main-image">${plan?s.rooms.map((room,i)=>`<div class="room-box ${i===s.roomIndex?'selected':''}" data-box="${i}" style="left:${room.rect.x*100}%;top:${room.rect.y*100}%;width:${room.rect.w*100}%;height:${room.rect.h*100}%"><button class="room-hit" data-room="${i}" aria-label="选择${esc(room.name)}"><span class="room-tag">${esc(room.name)}${i===s.roomIndex?' · 已选择':''}</span></button>${i===s.roomIndex&&!drawMode&&!busy()?resizeHandles():''}</div>`).join(''):''}${plan&&activeRoom()?`<div class="camera-pin" style="left:${(activeRoom().rect.x+activeRoom().rect.w*s.camera.x)*100}%;top:${(activeRoom().rect.y+activeRoom().rect.h*s.camera.y)*100}%;transform:translate(-50%,-50%) rotate(${s.camera.angle+90}deg)">${icon('camera')}</div>`:''}${!plan&&s.selection?rectMarkup(s.selection):''}</div><span class="viewer-legend"><i class="legend-square"></i>${drawMode==='room'?'拖动框选目标房间':drawMode==='edit'?'拖动框选需要修改的区域':plan?'拖动选框边角调整大小 · 图纸上方为北':s.tab==='reference'?'人工参考图，不是 AI 生成结果':'每张结果均需人工核对空间结构'}</span></div>`;
}
function resizeHandles(){return [['nw','左上角'],['n','上边'],['ne','右上角'],['e','右边'],['se','右下角'],['s','下边'],['sw','左下角'],['w','左边']].map(([handle,label])=>`<button class="resize-handle handle-${handle}" data-resize="${handle}" aria-label="调整房间${label}" title="拖动调整${label}；方向键微调"></button>`).join('');}
function paintRoomRect(r){
 const box=document.querySelector(`[data-box="${s.roomIndex}"]`);
 Object.assign(box.style,{left:r.x*100+'%',top:r.y*100+'%',width:r.w*100+'%',height:r.h*100+'%'});
 const pin=$('.camera-pin');if(pin){pin.style.left=(r.x+r.w*s.camera.x)*100+'%';pin.style.top=(r.y+r.h*s.camera.y)*100+'%';}
}
function cameraDirections(){
 const angle=snapDirection(s.camera.angle),name=directions.find(d=>d.angle===angle).name;
 return `<div class="camera-directions"><div class="label">摄像机朝向 <em>当前：${name}</em></div><div class="compass" role="group" aria-label="摄像机八向选择">${['西北','北','东北','西',null,'东','西南','南','东南'].map(name=>name?`<button class="direction-btn ${directions.find(d=>d.name===name).angle===angle?'selected':''}" data-direction="${directions.find(d=>d.name===name).angle}" aria-label="摄像机朝${name}" aria-pressed="${directions.find(d=>d.name===name).angle===angle}" ${busy()?'disabled':''}>${name}</button>`:`<span class="compass-center">${icon('camera')}</span>`).join('')}</div><p class="helper">以图纸上方为北、右侧为东。</p></div>`;
}
function rectMarkup(r){return `<div class="selection-box" style="left:${r.x*100}%;top:${r.y*100}%;width:${r.w*100}%;height:${r.h*100}%"></div>`;}
function jobNotice(){
 if(!s.job)return '';
 if(busy())return `<div class="job-status" role="status"><span class="spinner"></span>${esc(s.job.stage)}<div class="helper">真实模型任务 · 已等待 <span id="elapsed">${Math.floor(Date.now()/1000-s.job.created)}</span> 秒<br>耗时取决于模型服务，请勿重复提交。</div></div>`;
 if(['failed','unknown'].includes(s.job.status))return `<div class="error-box" role="alert">${esc(s.job.error)}<br><button class="text-btn" data-action="dismiss-error">我已知晓，返回操作</button></div>`;
 return '';
}
function consent(){return `<label class="checkbox consent-box"><input type="checkbox" id="consent" ${s.consent?'checked':''}>允许将本次平面图／编辑图发送至已配置的模型服务，用于识别和生成。</label>`;}
function panel(){
 const room=activeRoom();
 if(s.step===0)return `<div class="field"><div class="label">项目平面图 <em>JPG / PNG / PDF</em></div><label class="upload-zone ${s.source?'has-preview':''}" id="drop-zone" for="plan-upload">${s.source?`<img class="upload-thumbnail" src="${esc(s.source)}" alt="已上传平面图缩略图"><span class="upload-replace">${icon('upload')} 点击替换，或拖入新图</span>`:`${icon('upload')}<strong>点击上传，或拖入平面图</strong><small>最大 25 MB · PDF 支持选择页面</small>`}</label><input id="plan-upload" type="file" accept="image/jpeg,image/png,application/pdf"><p class="helper">${esc(s.sourceName)}</p></div><div class="field"><div class="label">目标空间 <em>点击图中房间选择</em></div><div class="room-chips">${s.rooms.map((r,i)=>`<button class="chip ${s.roomIndex===i?'selected':''}" data-room="${i}" ${busy()?'disabled':''}>${esc(r.name)}</button>`).join('')}</div></div><button class="secondary-btn" data-action="draw-room" ${busy()?'disabled':''}>${icon('select')} ${drawMode==='room'?'正在框选，拖动平面图':(activeRoom()?'重新框选当前房间':'手动框选房间')}</button><p class="annotation-note">${s.recognized?'当前房间来自模型识别，请逐项核对，可重新框选纠正边界。':s.isSample?'样例房间为预先标注，供核对与纠正；并非自动识别结果。':'新上传图纸请先自动识别，或手动框选目标房间。'}</p>${room?cameraDirections():''}${consent()}<button class="secondary-btn" data-action="analyze" ${busy()||!s.consent?'disabled':''}>${icon('spark')} 自动识别空间</button><div class="summary-line"><span>资料来源</span><strong>${s.isSample?'无垠 · 真实住宅项目':'本地上传'}</strong></div><div class="summary-line"><span>图纸尺寸</span><strong>待核对，不推测</strong></div>`;
 if(s.step===1)return room?`<div class="field"><label class="label" for="room-name">目标房间 <em>可纠正</em></label><input id="room-name" value="${esc(room.name)}"></div><div class="field"><label class="label" for="structure">空间与固定家具 <em>核对后用于生成</em></label><textarea id="structure" rows="4">${esc(room.structure)}</textarea></div><div class="field"><label class="label" for="dimensions">尺寸信息</label><input id="dimensions" value="${esc(room.dimensions)}"><p class="helper">未标注尺寸时请补充，或保留“待补充”。</p></div><div class="field"><label class="label" for="height">层高 <em>选填</em></label><input id="height" value="${esc(s.height)}" placeholder="例如：2.8 m；未知可留空"></div><div class="field"><div class="label">推荐视角 <em>在房间内微调</em></div><div class="row"><label class="helper">位置 X <input class="range-input" id="camera-x" type="range" min="5" max="95" value="${s.camera.x*100}"></label><label class="helper">位置 Y <input class="range-input" id="camera-y" type="range" min="5" max="95" value="${s.camera.y*100}"></label></div>${cameraDirections()}<p class="helper">视角为建议值。请确认观察点未落在墙体或家具内。</p></div><label class="checkbox"><input id="confirmed" type="checkbox" ${s.confirmed?'checked':''}>我已核对墙体、门窗、空间划分和固定家具；缺失尺寸已注明。</label>`:`<div class="empty">请先框选或识别目标房间。</div><button class="secondary-btn" data-step="0">返回上传</button>`;
 if(s.step===2)return `<div class="field"><div class="label">空间风格 <em>选择一种设计语言</em></div><div class="style-grid">${styles.map(st=>`<button class="style-card ${s.style===st.name?'selected':''}" data-style="${st.name}"><div class="swatch" style="--c1:${st.colors[0]};--c2:${st.colors[1]};--c3:${st.colors[2]}"></div><span>${st.name}</span></button>`).join('')}</div></div><div class="field"><label class="label" for="intent">设计意向 <em>选填</em></label><textarea id="intent" rows="3" placeholder="描述喜欢的材质、家具和灯光氛围">${esc(s.intent)}</textarea></div><div class="field"><div class="label">风格参考图 <em>选填</em></div><label class="checkbox"><input id="use-reference" type="checkbox" ${s.useReference?'checked':''}>使用当前人工图作为风格参考</label><button class="secondary-btn" data-action="upload-reference">${icon('plus')} 上传自己的参考图</button><input id="reference-upload" type="file" accept="image/jpeg,image/png"><p class="helper">参考图仅引导风格，结构仍以确认后的平面图为准。</p></div>${lockCard()}`;
 if(s.step===3)return `<div class="field"><div class="label">本次生成方案 <em>单房间透视图</em></div><div class="summary-line"><span>目标空间</span><strong>${esc(room?.name||'未选择')}</strong></div><div class="summary-line"><span>设计风格</span><strong>${esc(s.style)}</strong></div><div class="summary-line"><span>空间核对</span><strong>${s.confirmed?'已确认':'待确认'}</strong></div><div class="summary-line"><span>生成方式</span><strong>真实模型生成</strong></div></div>${lockCard()}${!s.confirmed?'<div class="error-box">请先完成空间核对，再生成效果图。</div>':''}${consent()}<p class="helper">提交后会向模型服务发送图纸与设计要求。结构约束用于引导生成，结果仍需人工检查。</p>${historyMarkup()}`;
 return `<div class="field"><div class="label">修改方式 <em>沿用当前视角</em></div><div class="room-chips"><button class="chip ${s.editMode==='edit'?'selected':''}" data-editmode="edit">局部重绘</button><button class="chip ${s.editMode==='restyle'?'selected':''}" data-editmode="restyle">全图换风格</button></div></div>${s.editMode==='edit'?`<button class="secondary-btn" data-action="draw-edit" ${busy()?'disabled':''}>${icon('select')}${s.selection?'重新框选修改区域':'框选修改区域'}</button><p class="helper">${s.selection?'已选中区域，选区外保持原图。':'在图片上拖动框选，如沙发、地毯或灯具。'}</p>`:`<div class="field"><label class="label" for="restyle">整体风格</label><select id="restyle">${styles.map(st=>`<option ${s.style===st.name?'selected':''}>${st.name}</option>`).join('')}</select></div>`}<div class="field" style="margin-top:16px"><label class="label" for="edit-instruction">修改要求</label><textarea id="edit-instruction" placeholder="例如：将沙发换成米色亚麻款，保持位置、体量与其他家具不变。">${esc(s.editInstruction)}</textarea></div>${s.tab==='reference'?'<div class="annotation-note">当前编辑对象为人工参考图，生成版本将标记为“人工图编辑”。</div>':''}${lockCard()}${consent()}${historyMarkup()}${activeVersion()?`<div class="review-flags"><strong>结果核对 · 人工记录</strong>${['结构与门窗保持','主要布局保持','可用于客户沟通'].map((label,i)=>`<label class="checkbox"><input data-review="${i}" type="checkbox" ${s.review[activeVersion().id]?.[i]?'checked':''}>${label}</label>`).join('')}</div>`:''}`;
}
function lockCard(){return `<div class="lock-card"><strong>${icon('lock')} 本次结构锁定要求</strong>墙体 · 门窗位置 · 空间分隔<br>固定家具位置 · 主要家具布局与比例</div>`;}
function historyMarkup(){return `<div class="section-title"><h2>${icon('history')} 版本记录 <span>${s.versions.length} 个版本</span></h2></div>${s.versions.length?s.versions.map((v,i)=>`<button class="history-item ${i===s.selectedVersion?'selected':''}" data-version="${i}"><img src="${esc(v.url)}" alt="${esc(v.name)}"><div><strong>${esc(v.name)}</strong><small>${esc(v.origin)} · ${esc(v.style)} · ${new Date(v.time).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</small></div></button>`).reverse().join(''):'<div class="empty">尚无 AI 版本<br>成功结果会保留在这里。</div>'}`;}
function bottomAction(){
 if(busy())return `<button class="primary-btn" disabled><span class="spinner"></span>任务处理中</button><p class="helper">输入与历史版本已保留，可稍后返回。</p>`;
 if(s.step<3){const disabled=s.step===0?!activeRoom():s.step===1?!s.confirmed:false;return `<button class="primary-btn" data-action="next" ${disabled?'disabled':''}>${['选择房间，核对空间','确认空间，选择风格','准备生成效果图'][s.step]} ${icon('arrow')}</button><p class="helper">${['从已有方案，开启一次新的设计探索','确认后的空间信息将作为生成依据','风格由你决定，结构约束随任务提交'][s.step]}</p>`;}
 if(s.step===3)return `<button class="primary-btn" data-action="generate" ${!s.confirmed||!s.consent||!activeRoom()?'disabled':''}>${icon('spark')} 生成空间意向图</button><p class="helper">真实模型调用 · 耗时与成本待实测</p>${activeVersion()?'<button class="text-btn" style="width:100%;justify-content:center;margin-top:12px" data-step="4">继续局部修改 →</button>':''}`;
 return `<button class="primary-btn" data-action="edit" ${!s.consent||(s.tab!=='reference'&&!activeVersion())||(s.editMode==='edit'&&(!s.selection||!s.editInstruction.trim()))?'disabled':''}>${icon('spark')} ${s.editMode==='edit'?'应用局部修改':'生成新的风格版本'}</button><p class="helper">每次修改均保留原版本，可返回重选。</p>`;
}
function bind(){
 document.querySelectorAll('[data-action]').forEach(el=>el.onclick=e=>{e.preventDefault();action(el.dataset.action);});
 document.querySelectorAll('[data-step]').forEach(el=>el.onclick=()=>{if(busy())return toast('请等待当前任务结束。');s.step=+el.dataset.step;s.zoom=100;drawMode='';if(s.step<=1)s.tab='plan';if(s.step===4)s.tab=activeVersion()?'result':'reference';update();});
 document.querySelectorAll('[data-tab]').forEach(el=>el.onclick=()=>{s.tab=el.dataset.tab;s.zoom=100;drawMode='';update();});
 document.querySelectorAll('[data-room]').forEach(el=>el.onclick=e=>{if(drawMode==='room'||busy())return;e.stopPropagation();chooseRoom(+el.dataset.room);});
 document.querySelectorAll('[data-style]').forEach(el=>el.onclick=()=>{s.style=el.dataset.style;update();});
 document.querySelectorAll('[data-ref]').forEach(el=>el.onclick=()=>{s.reference=el.dataset.ref;s.tab='reference';s.page='workspace';if(el.dataset.close)$('#modal').close();update();});
 document.querySelectorAll('[data-version]').forEach(el=>el.onclick=()=>{s.selectedVersion=+el.dataset.version;s.tab='result';s.selection=null;update();});
 document.querySelectorAll('[data-editmode]').forEach(el=>el.onclick=()=>{s.editMode=el.dataset.editmode;drawMode='';update();});
 document.querySelectorAll('[data-review]').forEach(el=>el.onchange=()=>{const id=activeVersion().id;s.review[id]??={};s.review[id][el.dataset.review]=el.checked;persist();});
 const fields={'room-name':v=>{activeRoom().name=v;s.confirmed=false;},structure:v=>{activeRoom().structure=v;s.confirmed=false;},dimensions:v=>{activeRoom().dimensions=v;s.confirmed=false;},height:v=>{s.height=v;s.confirmed=false;},intent:v=>s.intent=v,'edit-instruction':v=>s.editInstruction=v,restyle:v=>s.style=v};
 for(const [id,set] of Object.entries(fields)){const el=$('#'+id);if(el)el.oninput=()=>{set(el.value);persist();const confirmation=$('#confirmed');if(confirmation){confirmation.checked=s.confirmed;const next=$('.panel-bottom [data-action=next]');if(next)next.disabled=!s.confirmed;}const edit=$('.panel-bottom [data-action=edit]');if(edit)edit.disabled=!s.consent||(s.tab!=='reference'&&!activeVersion())||(s.editMode==='edit'&&(!s.selection||!s.editInstruction.trim()));};}
 for(const [id,key] of [['consent','consent'],['confirmed','confirmed'],['use-reference','useReference']]){const el=$('#'+id);if(el)el.onchange=()=>{s[key]=el.checked;update();};}
 for(const key of ['x','y']){const el=$('#camera-'+key);if(el){el.oninput=()=>{s.camera[key]=+el.value/100;activeRoom().camera={...s.camera};const pin=$('.camera-pin'), r=activeRoom().rect;if(pin){pin.style.left=(r.x+r.w*s.camera.x)*100+'%';pin.style.top=(r.y+r.h*s.camera.y)*100+'%';pin.style.transform=`translate(-50%,-50%) rotate(${s.camera.angle+90}deg)`;}};el.onchange=()=>{s.confirmed=false;update();};}}
 document.querySelectorAll('[data-direction]').forEach(el=>el.onclick=()=>{if(busy())return;s.camera.angle=+el.dataset.direction;activeRoom().camera={...s.camera};s.confirmed=false;update();});
 if($('#compare-range'))$('#compare-range').oninput=e=>$('.compare-stage').style.setProperty('--split',e.target.value+'%');
 if($('#plan-upload'))$('#plan-upload').onchange=e=>upload(e.target.files[0]);
 if($('#reference-upload'))$('#reference-upload').onchange=e=>upload(e.target.files[0],true);
 const drop=$('#drop-zone');if(drop){drop.ondragover=e=>{e.preventDefault();drop.classList.add('drag');};drop.ondragleave=()=>drop.classList.remove('drag');drop.ondrop=e=>{e.preventDefault();drop.classList.remove('drag');upload(e.dataTransfer.files[0]);};}
 if(busy())document.querySelectorAll('.panel-body input,.panel-body textarea,.panel-body select').forEach(el=>el.disabled=true);
 bindDrawing();
}
function bindDrawing(){
 const stage=$('#image-stage');if(!stage)return;
 let start,preview,resizing;
 const point=e=>{const r=stage.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};};
 stage.onpointerdown=e=>{if(e.button!==0||busy())return;const handle=e.target.closest('[data-resize]');if(handle){e.preventDefault();resizing={handle:handle.dataset.resize,rect:{...activeRoom().rect},next:{...activeRoom().rect}};stage.setPointerCapture(e.pointerId);return;}if(!drawMode)return;e.preventDefault();start=point(e);stage.setPointerCapture(e.pointerId);preview=document.createElement('div');preview.className='selection-box';stage.append(preview);};
 stage.onpointermove=e=>{if(resizing){resizing.next=resizeRect(resizing.rect,resizing.handle,point(e));paintRoomRect(resizing.next);return;}if(!start)return;const p=point(e);Object.assign(preview.style,{left:Math.min(start.x,p.x)*100+'%',top:Math.min(start.y,p.y)*100+'%',width:Math.abs(p.x-start.x)*100+'%',height:Math.abs(p.y-start.y)*100+'%'});};
 stage.onpointerup=e=>{if(resizing){activeRoom().rect=resizeRect(resizing.rect,resizing.handle,point(e));resizing=null;s.confirmed=false;update();return;}if(!start)return;const p=point(e),r={x:Math.min(start.x,p.x),y:Math.min(start.y,p.y),w:Math.abs(p.x-start.x),h:Math.abs(p.y-start.y)};start=null;if(r.w<.02||r.h<.02){preview.remove();return toast('选区过小，请重新框选。');}if(drawMode==='room'){if(activeRoom()){activeRoom().rect=r;}else{s.rooms.push({name:'自定义房间',rect:r,structure:'请补充墙体、门窗和固定家具信息。',dimensions:'未标注尺寸，待补充',camera:{x:.5,y:.8,angle:270}});s.roomIndex=s.rooms.length-1;}s.camera={...activeRoom().camera,angle:snapDirection(activeRoom().camera.angle)};s.confirmed=false;}else s.selection=r;drawMode='';update();};
 stage.onpointercancel=()=>{start=null;preview?.remove();if(resizing){resizing=null;render();}};
 stage.querySelectorAll('[data-resize]').forEach(el=>el.onkeydown=e=>{if(busy()||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const r=activeRoom().rect,h=el.dataset.resize,p={x:h.includes('w')?r.x:r.x+r.w,y:h.includes('n')?r.y:r.y+r.h},delta=e.shiftKey?.02:.005;if(e.key==='ArrowLeft')p.x-=delta;if(e.key==='ArrowRight')p.x+=delta;if(e.key==='ArrowUp')p.y-=delta;if(e.key==='ArrowDown')p.y+=delta;activeRoom().rect=resizeRect(r,h,p);s.confirmed=false;update();document.querySelector(`[data-resize=${h}]`)?.focus();});
}
async function action(name){
 if(['workspace','projects','references','workflow'].includes(name)){s.page=name;update();return;}
 if(name==='next'){s.step++;s.tab='plan';update();return;}
 if(name==='help'){showHelp();return;}
 if(name==='gallery'){openModal('项目参考图库',`<p class="helper" style="margin-bottom:16px">无垠项目 · 人工效果图 · 仅作对照与风格参考</p><div class="modal-grid">${refCards(refs,true)}</div>`);return;}
 if(name==='draw-room'){if(busy())return;drawMode=drawMode==='room'?'':'room';s.tab='plan';update();return;}
 if(name==='draw-edit'){if(busy())return;if(!activeVersion()&&s.tab!=='reference')s.tab='reference';drawMode='edit';update();return;}
 if(name==='fullscreen'){document.body.classList.toggle('fullscreen');return;}
 if(name.startsWith('zoom-')){s.zoom=name==='zoom-reset'?100:Math.max(50,Math.min(200,s.zoom+(name==='zoom-in'?25:-25)));update();return;}
 if(name==='download'){const version=activeVersion();if(!version)return toast('请先生成 AI 效果图，再导出。');const a=document.createElement('a');a.href=version.url;a.download=`无垠-${version.name}.png`;a.click();return;}
 if(name==='upload-reference'){$('#reference-upload').click();return;}
 if(name==='dismiss-error'){s.job=null;update();return;}
 if(['generate','edit','analyze'].includes(name))await submit(name);
}
function openModal(title,body){$('#modal').innerHTML=`<div class="modal-heading"><h2>${title}</h2><button class="icon-btn" id="close-modal" aria-label="关闭">${icon('close')}</button></div>${body}`;$('#close-modal').onclick=()=>$('#modal').close();$('#modal').showModal();document.querySelectorAll('#modal [data-ref]').forEach(el=>el.onclick=()=>{s.reference=el.dataset.ref;s.page='workspace';s.tab='reference';$('#modal').close();update();});}
function showHelp(){openModal('让平面图，成为空间意向。',`<div class="modal-copy"><h3>01 / 上传与核对</h3><p>已载入无垠住宅真实样例，房间为预先标注。你也可以上传 JPG、PNG 或 PDF，运行自动识别或手动框选；模型识别结果必须人工核对。原图未标注尺寸，不能视为已知。</p><h3>02 / 风格与真实生成</h3><p>核对墙体、门窗、固定家具和尺寸后，选择风格。勾选资料发送确认，即可提交真实模型任务。资料将发往本机已配置的第三方服务 mckj.hk.cn。密钥只由本机服务读取，不会进入网页。</p><h3>03 / 局部修改与版本</h3><p>打开生成结果，选择“局部修改”，在图片上拖动框选并填写要求。选区外像素由本地合成保留；选区内的结构、家具比例仍须人工核对。修改不覆盖原版本，也支持对人工参考图进行编辑实验。</p><h3>04 / 资料与边界</h3><p>上传图纸与版本保存在当前原型目录的 outputs/。原始项目文件不修改。此原型为本机单用户试用，未提供账号、云端存储或施工精度保证。需要清除资料时，关闭服务后删除 outputs/ 中对应文件及 workspace.json；已发送的资料以模型服务的数据规则为准。</p><h3>05 / 对照与恢复</h3><p>人工图库不作为 AI 成果。真实生成成功后，可以切换对照视图拖动比较。任务失败保留输入；超时或服务中断会标记结果未知，请核对上游记录，避免重复提交。</p></div>`);}
async function upload(file,reference=false){
 if(!file)return;if(busy())return toast('请等待当前任务结束后再替换图纸。');
 if(file.size>25*1024*1024)return toast('文件超过25 MB，请压缩后上传。');
 if(!/\.(jpe?g|png|pdf)$/i.test(file.name)||reference&&/\.pdf$/i.test(file.name))return toast('请选择 JPG、PNG 或 PDF；参考图仅支持图片。');
 toast('正在处理文件，请稍候…');
 try{const buffer=await file.arrayBuffer();let raw='';for(const b of new Uint8Array(buffer))raw+=String.fromCharCode(b);const result=await api('/api/upload',{data:btoa(raw)});
 const apply=url=>{if(reference){s.reference=url;s.useReference=true;toast('已添加风格参考图。');}else{s.source=url;s.sourceName=file.name;s.isSample=false;s.recognized=false;s.rooms=[];s.roomIndex=0;s.confirmed=false;s.versions=[];s.selectedVersion=-1;s.selection=null;s.job=null;s.tab='plan';s.step=0;toast('上传成功。请自动识别或手动框选房间。');}update();};
 if(result.pages.length===1)apply(result.pages[0]);else{openModal('选择 PDF 页面',`<div class="modal-grid">${result.pages.map((url,i)=>`<button class="ref-card" data-pdf="${url}"><img src="${url}" alt="PDF第${i+1}页"><div class="ref-caption">第 ${i+1} 页</div></button>`).join('')}</div>`);document.querySelectorAll('[data-pdf]').forEach(el=>el.onclick=()=>{$('#modal').close();apply(el.dataset.pdf);});}
 }catch(error){toast(error.message);}
}
async function submit(kind){
 if(busy())return;if(!s.consent)return toast('请先确认允许发送本次资料。');
 if(s.job?.status==='unknown')return toast('上次任务结果未知，请先核对上游记录并确认后关闭提示。');
 const room=activeRoom();
 if(kind==='generate'&&(!room||!s.confirmed))return toast('请先核对空间结构。');
 const base=s.tab==='reference'?s.reference:activeVersion()?.url;
 if(kind==='edit'&&!base)return toast('请先选择生成结果或人工参考图。');
 const requestId=crypto.randomUUID();
 const data={requestId,source:kind==='edit'?base:s.source,consent:s.consent,room:room?.name,roomRect:room?.rect,structure:(room?.structure||'')+'；尺寸：'+(room?.dimensions||'未知'),height:s.height,style:s.style,camera:`房间框内相对位置(${s.camera.x.toFixed(2)},${s.camera.y.toFixed(2)})，朝${directions.find(d=>d.angle===s.camera.angle)?.name}，方向${s.camera.angle}度（图纸上方为北）`,confirmed:s.confirmed,instruction:kind==='edit'?s.editInstruction:s.intent,action:kind==='edit'?s.editMode:'generate',selection:s.selection,reference:s.useReference?s.reference:null};
 const context={style:s.style,origin:kind==='analyze'?'空间识别':kind==='generate'?'平面图生成':s.tab==='reference'?'人工图编辑':s.editMode==='edit'?'局部重绘':'全图换风格',parent:kind==='edit'&&s.tab!=='reference'?activeVersion()?.id:null};
 // Save the request identity before dispatch so a lost response can be recovered idempotently.
 s.job={id:null,requestId,status:'queued',created:Date.now()/1000,stage:'正在提交任务',context,pending:{path:kind==='analyze'?'/api/analyze':'/api/generate',data}};update();
 try{const job=await api(s.job.pending.path,data);s.job={...job,context};update();poll();}
 catch(error){s.job={...s.job,status:error.status&&error.status<500?'failed':'unknown',error:error.status&&error.status<500?error.message:`未确认任务是否已受理：${error.message}。可恢复查询。`};update();if(s.job.status==='unknown')showRecovery();}
}
function showRecovery(){if(!s.job?.pending||s.job.status!=='unknown')return;const box=$('.error-box');if(box){const b=document.createElement('button');b.className='secondary-btn';b.textContent='恢复本次任务查询';b.onclick=async()=>{try{const j=await api(s.job.pending.path,s.job.pending.data);s.job={...j,context:s.job.context};update();poll();}catch(e){toast(e.message);}};box.append(b);}}
async function poll(){
 if(polling||!s.job?.id||!busy())return;polling=true;
 try{while(s.job?.id&&busy()){
  let job;try{job=await api('/api/jobs/'+s.job.id);}catch{toast('暂时无法查询任务，稍后自动恢复。');await new Promise(r=>setTimeout(r,5000));continue;}
  const context=s.job.context;s.job={...job,context};
  if(job.status==='completed'){
   if(job.kind==='analyze'){s.rooms=job.rooms;s.recognized=true;s.roomIndex=0;s.camera={...activeRoom().camera,angle:snapDirection(activeRoom().camera.angle)};s.confirmed=false;s.tab='plan';s.step=1;toast('识别完成，请核对结构和尺寸。');}
   else{if(!s.versions.some(v=>v.id===job.id)){s.versions.push({id:job.id,url:job.image,name:`V${String(s.versions.length+1).padStart(2,'0')} · ${context?.origin||'AI 结果'}`,style:context?.style||s.style,origin:context?.origin||'真实生成',time:Date.now(),seconds:Math.round(job.finished-job.created),parent:context?.parent});}s.selectedVersion=s.versions.findIndex(v=>v.id===job.id);s.tab='result';s.step=4;s.selection=null;toast('新版本已保存，请核对结构与布局。');}update();break;
  }
  render();persist();if(!busy())break;await new Promise(r=>setTimeout(r,2500));
 }}finally{polling=false;}
}
try{refs=await api('/assets/references.json');const saved=await api('/api/workspace');if(saved)s={...initial(),...saved,page:'workspace'};s.camera.angle=snapDirection(s.camera.angle);if(activeRoom())activeRoom().camera={...s.camera};render();if(busy())poll();if(s.job?.pending&&!s.job.id&&s.job.status!=='failed'){s.job.status='unknown';s.job.error='上次提交未确认，请恢复本次任务查询。';render();showRecovery();}}
catch(error){render();toast('无法连接本地服务，请使用启动脚本打开网站。');}

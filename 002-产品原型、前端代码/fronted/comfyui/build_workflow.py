"""Build explicit ComfyUI 0.4 UI workflow and matching API prompt."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'public/workflows'
DEST.mkdir(exist_ok=True)
# id, type, title, position, linked inputs, output sockets, widget values
specs = [
(1,'LoadImage','01 · 无垠住宅平面图',(40,160),[],[('IMAGE','IMAGE'),('MASK','MASK')],{'image':'wuyin-plan.jpg'}),
(2,'WuyinAnalyze','02 · 自动识别结构',(420,80),[('plan','IMAGE',1,0)],[('rooms_json','STRING')],{'consent':False}),
(3,'WuyinConfirm','03 · 人工核对与八向视角',(800,80),[('rooms_json','STRING',2,0)],[('confirmed_space','WUYIN_SPACE')],{'room':'客厅','rectangle':'{"x":0.415,"y":0.06,"w":0.225,"h":0.425}','structure':'沙发沿右侧，茶几居中，电视背景墙在左，上侧外窗。保留墙体、门窗、固定家具与主要布局。未标注尺寸，待补充。','height':'未知，不作为实测尺寸','direction':'东北','position':'0.18,0.87','confirmed':False}),
(4,'WuyinStyle','04 · 风格与材质意向',(1200,80),[('space','WUYIN_SPACE',3,0)],[('design','WUYIN_SPACE')],{'style':'现代简约','intent':'黑白灰基调，低靠背模块沙发，黑色金属细节，通透自然光。'}),
(5,'WuyinGenerate','05 · 平面图 → 室内透视图',(1600,80),[('plan','IMAGE',1,0),('design','WUYIN_SPACE',4,0)],[('render','IMAGE'),('job_id','STRING')],{'consent':False}),
(6,'SaveImage','06 · 保存首版效果图',(2000,40),[('images','IMAGE',5,0)],[('images','IMAGE')],{'filename_prefix':'Wuyin/first-render'}),
(7,'WuyinSelection','07 · 局部选区与修改要求',(1200,630),[],[('edit_region','WUYIN_EDIT')],{'rectangle':'{"x":0.25,"y":0.45,"w":0.45,"h":0.4}','instruction':'将选区内家具面料改为米白色亚麻，保留家具位置、体量和其他物体。'}),
(8,'WuyinEdit','08 · 蒙版编辑与像素合成',(2000,530),[('image','IMAGE',5,0),('space','WUYIN_SPACE',3,0),('edit_region','WUYIN_EDIT',7,0)],[('edited_render','IMAGE'),('job_id','STRING')],{'consent':False}),
(9,'SaveImage','09 · 保存局部修改版本',(2400,530),[('images','IMAGE',8,0)],[('images','IMAGE')],{'filename_prefix':'Wuyin/local-edit'}),
]
nodes=[]; links=[]; prompt={}
for order,(i,kind,title,pos,inputs,outputs,widgets) in enumerate(specs):
    node={'id':i,'type':kind,'title':title,'pos':list(pos),'size':[330, max(190,110+len(widgets)*52+len(inputs)*24)],'flags':{},'order':order,'mode':0,'inputs':[],
          'outputs':[{'name':name,'type':typ,'links':[]} for name,typ in outputs],
          'properties':{'Node name for S&R':kind},'widgets_values':list(widgets.values())}
    if kind == 'LoadImage': node['size'][1] = 360
    if kind == 'SaveImage': node['size'][1] = 320
    values=dict(widgets)
    if kind=='LoadImage': node['widgets_values'].append('image')
    for slot,(name,typ,origin,origin_slot) in enumerate(inputs):
        lid=len(links)+1; links.append([lid,origin,origin_slot,i,slot,typ]);node['inputs'].append({'name':name,'type':typ,'link':lid});values[name]=[str(origin),origin_slot]
    nodes.append(node);prompt[str(i)]={'class_type':kind,'inputs':values,'_meta':{'title':title}}
for lid,origin,slot,*_ in links:
    next(n for n in nodes if n['id']==origin)['outputs'][slot]['links'].append(lid)
workflow={'last_node_id':9,'last_link_id':len(links),'nodes':nodes,'links':links,
'groups':[{'title':'A · 平面输入 / 识别 / 人工确认','bounding':[10,10,1140,600],'color':'#48685d','font_size':24},
{'title':'B · 风格约束 / 真实 API 生图','bounding':[1170,10,1180,550],'color':'#596d82','font_size':24},
{'title':'C · 局部蒙版 / 选区外像素保持','bounding':[1170,590,1600,430],'color':'#8a7453','font_size':24}],
'config':{},'extra':{'ds':{'scale':0.45,'offset':[30,30]},'wuyin':{'model':'gpt-image-2 via imageStyle API','notes':'所有自定义节点均随包提供。未使用 FLUX 权重或未展开的封装节点。默认 consent / confirmed 均为 false；核对后手动启用。'}},'version':0.4}
for name,value in [('wuyin-interior.json',workflow),('wuyin-api.json',prompt)]:
    (DEST/name).write_text(json.dumps(value,ensure_ascii=False,indent=2))
print(f'{len(nodes)} nodes, {len(links)} links')

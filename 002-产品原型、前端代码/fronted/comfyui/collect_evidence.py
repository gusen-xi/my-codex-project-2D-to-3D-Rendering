"""Publish only evidence returned by a successful real ComfyUI execution."""
import hashlib
import json
import shutil
from datetime import datetime,timezone
from pathlib import Path
import subprocess
from PIL import Image, ImageChops, ImageDraw
ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'public/workflows'
history=json.loads((DEST/'execution-history.json').read_text())
ident,h=next(iter(history.items()))
assert h['status']['completed'] and h['status']['status_str']=='success',h['status']
assert {'2','5','6','8','9'}<=h['outputs'].keys(),h['outputs'].keys()
(DEST/'results').mkdir(exist_ok=True)
runs=[]
for nid,name,label in [('6','first-render.png','ComfyUI 首次生成'),('9','local-edit.png','ComfyUI 局部修改')]:
    item=h['outputs'][nid]['images'][0]
    assert item['type']=='output'
    source=ROOT/'work/ComfyUI/output'/item['subfolder']/item['filename']
    target=DEST/'results'/name
    shutil.copyfile(source,target)
    with Image.open(target) as im:size=list(im.size)
    runs.append({'node':nid,'label':label,'image':'/workflows/results/'+name,'size':f'{size[0]} × {size[1]}',
        'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
with Image.open(DEST/'results/first-render.png') as a,Image.open(DEST/'results/local-edit.png') as b:
    assert a.size==b.size
    r=json.loads(h['prompt'][2]['7']['inputs']['rectangle'])
    w,ht=a.size;box=(round(r['x']*w),round(r['y']*ht),round((r['x']+r['w'])*w),round((r['y']+r['h'])*ht))
    diff=ImageChops.difference(a.convert('RGB'),b.convert('RGB'))
    ImageDraw.Draw(diff).rectangle((box[0],box[1],box[2]-1,box[3]-1),fill=(0,0,0))
    outside_unchanged=diff.getbbox() is None
    assert outside_unchanged,'Unexpected pixel differences outside edit selection'
jobs=[]
for node in ['5','8']:
    job_id=h['outputs'][node]['job_id'][0]
    job=json.loads((ROOT/'outputs/jobs'/(job_id+'.json')).read_text())
    jobs.append({'node':node,'job_id':job_id,'seconds':round(job['finished']-job['created'],2),'status':job['status']})
recognition=json.loads((DEST/'recognition-history.json').read_text())
info={'status':'success','label':'真实 ComfyUI 执行成功','engine':'ComfyUI 0.45.0 / CPU + 外部图像 API',
    'engine_commit':subprocess.check_output(['git','-C',str(ROOT/'work/ComfyUI'),'rev-parse','HEAD'],text=True).strip(),
    'checked_at':datetime.now(timezone.utc).isoformat(),'prompt_id':ident,'recognition_prompt_id':next(iter(recognition)),
    'nodes':9,'links':10,'runs':runs,'jobs':jobs,'edit_rectangle':r,'outside_selection_pixels_unchanged':outside_unchanged,
    'summary':'真实 ComfyUI 引擎已完成结构识别、人工核对参数、首次生图、局部蒙版编辑和两次 SaveImage 保存。原始执行历史与输出文件可下载；选区外像素逐像素对比一致。',
    'limitation':'通过外部 imageStyle API 生图；结构保持依靠图纸参考与提示约束，未通过几何精度验收，须人工核对。',
    'history_sha256':hashlib.sha256((DEST/'execution-history.json').read_bytes()).hexdigest()}
(DEST/'verification.json').write_text(json.dumps(info,ensure_ascii=False,indent=2))
(ROOT/'outputs/ComfyUI验证记录.json').write_text(json.dumps(info,ensure_ascii=False,indent=2))
print(json.dumps(info,ensure_ascii=False,indent=2))

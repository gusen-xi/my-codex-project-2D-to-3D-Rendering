"""ComfyUI adapters for the real Wuyin prototype image pipeline (V1 node API)."""
import importlib.util
import json
import os
from pathlib import Path
import time
import uuid
import numpy as np
import torch
from PIL import Image

ROOT = Path(os.environ.get('WUYIN_PROJECT_ROOT', Path(__file__).resolve().parents[3]))
spec = importlib.util.spec_from_file_location('wuyin_server', ROOT / 'server/app.py')
backend = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backend)


def source_url(image):
    path = backend.OUTPUT / 'uploads' / f'comfy-{uuid.uuid4().hex}.png'
    Image.fromarray(np.clip(image[0].cpu().numpy() * 255, 0, 255).astype(np.uint8)).save(path)
    return '/outputs/uploads/' + path.name


def tensor(url):
    with Image.open(backend.local_image(url)) as im:
        return torch.from_numpy(np.array(im.convert('RGB')).astype(np.float32) / 255)[None, ...]


def run(data, kind='generate'):
    if not data.pop('consent', False):
        raise ValueError('请先同意将本次图片发送至 mckj.hk.cn；未提交外部模型。')
    job = {'id': uuid.uuid4().hex, 'created': time.time(), 'kind': kind, 'status': 'queued', 'request': data}
    (backend.analyze if kind == 'analyze' else backend.generate)(job, data)
    if job['status'] != 'completed':
        raise RuntimeError(f"{job['status']}: {job.get('error', '任务未完成')}，禁止自动重试")
    return job


class WuyinAnalyze:
    @classmethod
    def INPUT_TYPES(cls):
        return {'required': {'plan': ('IMAGE',), 'consent': ('BOOLEAN', {'default': False})}}
    RETURN_TYPES = ('STRING',)
    RETURN_NAMES = ('rooms_json',)
    FUNCTION = 'execute'
    CATEGORY = 'Wuyin/01 Input'
    OUTPUT_NODE = True
    def execute(self, plan, consent):
        job = run({'source': source_url(plan), 'consent': consent}, 'analyze')
        content = json.dumps(job['rooms'], ensure_ascii=False)
        return {'ui': {'text': [content]}, 'result': (content,)}


class WuyinConfirm:
    @classmethod
    def INPUT_TYPES(cls):
        return {'required': {'rooms_json': ('STRING', {'forceInput': True}),
            'room': ('STRING', {'default': '客厅及餐厅'}),
            'rectangle': ('STRING', {'default': '{"x":0.405,"y":0.065,"w":0.38,"h":0.528}'}),
            'structure': ('STRING', {'multiline': True, 'default': '保留墙体、门窗、固定家具及主要家具布局。尺寸未标注，待核对。'}),
            'height': ('STRING', {'default': '未知，不作为实测尺寸'}),
            'direction': (['东','南','西','北','东南','东北','西南','西北'],),
            'position': ('STRING', {'default': '0.48,0.63'}),
            'confirmed': ('BOOLEAN', {'default': False})}}
    RETURN_TYPES = ('WUYIN_SPACE',)
    RETURN_NAMES = ('confirmed_space',)
    FUNCTION = 'execute'
    CATEGORY = 'Wuyin/02 Verify'
    def execute(self, rooms_json, room, rectangle, structure, height, direction, position, confirmed):
        json.loads(rooms_json)
        if not confirmed:
            raise ValueError('请在网站核对识别结果、房间框、门窗及布局后，再将 confirmed 设为 true。')
        xy = [float(v) for v in position.split(',')]
        if len(xy) != 2 or not all(0 <= v <= 1 for v in xy):
            raise ValueError('观察点应为两个 0~1 的房间内坐标')
        angles = {'东':0,'南':90,'西':180,'北':270,'东南':45,'东北':315,'西南':135,'西北':225}
        return ({'room': room, 'roomRect': backend.rectangle(json.loads(rectangle)), 'structure': structure,
                 'height': height, 'camera': f'x={xy[0]},y={xy[1]},angle={angles[direction]}（{direction}）', 'confirmed': True},)


class WuyinStyle:
    @classmethod
    def INPUT_TYPES(cls):
        return {'required': {'space': ('WUYIN_SPACE',), 'style': (['现代简约','奶油风','自然原木','中古风','侘寂风','轻奢'],),
            'intent': ('STRING', {'multiline': True, 'default': '温暖自然光，低饱和配色，单张室内透视图。'})}}
    RETURN_TYPES = ('WUYIN_SPACE',)
    RETURN_NAMES = ('design',)
    FUNCTION = 'execute'
    CATEGORY = 'Wuyin/03 Design'
    def execute(self, space, style, intent):
        return ({**space, 'style': style, 'instruction': intent},)


class WuyinGenerate:
    @classmethod
    def INPUT_TYPES(cls):
        return {'required': {'plan': ('IMAGE',), 'design': ('WUYIN_SPACE',), 'consent': ('BOOLEAN', {'default': False})}}
    RETURN_TYPES = ('IMAGE', 'STRING')
    RETURN_NAMES = ('render', 'job_id')
    FUNCTION = 'execute'
    CATEGORY = 'Wuyin/04 Generate'
    def execute(self, plan, design, consent):
        job = run({**design, 'source': source_url(plan), 'action': 'generate', 'consent': consent})
        return {'ui': {'job_id': [job['id']]}, 'result': (tensor(job['image']), job['id'])}


class WuyinSelection:
    @classmethod
    def INPUT_TYPES(cls):
        return {'required': {'rectangle': ('STRING', {'default': '{"x":0.25,"y":0.45,"w":0.45,"h":0.4}'}),
            'instruction': ('STRING', {'multiline': True, 'default': '将选区内家具面料改为米白色亚麻，保留家具位置、体量和其他物体。'})}}
    RETURN_TYPES = ('WUYIN_EDIT',)
    RETURN_NAMES = ('edit_region',)
    FUNCTION = 'execute'
    CATEGORY = 'Wuyin/05 Edit'
    def execute(self, rectangle, instruction):
        if not instruction.strip():
            raise ValueError('请填写修改要求')
        return ({'selection': backend.rectangle(json.loads(rectangle)), 'instruction': instruction},)


class WuyinEdit:
    @classmethod
    def INPUT_TYPES(cls):
        return {'required': {'image': ('IMAGE',), 'space': ('WUYIN_SPACE',), 'edit_region': ('WUYIN_EDIT',),
            'consent': ('BOOLEAN', {'default': False})}}
    RETURN_TYPES = ('IMAGE', 'STRING')
    RETURN_NAMES = ('edited_render', 'job_id')
    FUNCTION = 'execute'
    CATEGORY = 'Wuyin/05 Edit'
    def execute(self, image, space, edit_region, consent):
        job = run({**space, **edit_region, 'source': source_url(image), 'action': 'edit', 'consent': consent})
        return {'ui': {'job_id': [job['id']]}, 'result': (tensor(job['image']), job['id'])}


NODE_CLASS_MAPPINGS = {c.__name__: c for c in [WuyinAnalyze, WuyinConfirm, WuyinStyle, WuyinGenerate, WuyinSelection, WuyinEdit]}
NODE_DISPLAY_NAME_MAPPINGS = {'WuyinAnalyze':'结构识别 · 视觉模型', 'WuyinConfirm':'人工核对 · 房间与八向视角',
    'WuyinStyle':'风格与设计意向', 'WuyinGenerate':'平面图生图 · imageStyle API',
    'WuyinSelection':'局部选区与修改指令', 'WuyinEdit':'蒙版编辑 · 选区外像素锁定'}

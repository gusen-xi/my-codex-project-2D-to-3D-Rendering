"""Queue exactly one ComfyUI execution; inspect history without retrying model calls."""
import argparse
import json
import time
from pathlib import Path
from urllib.request import Request, urlopen
ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'public/workflows'
def request(path,data=None):
    raw=None if data is None else json.dumps(data).encode()
    with urlopen(Request('http://127.0.0.1:8188'+path,data=raw,headers={'Content-Type':'application/json'}),timeout=15) as r:return json.load(r)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('stage',choices=['recognize','render']);args=parser.parse_args()
    prompt=json.loads((DEST/'wuyin-api.json').read_text())
    info=request('/object_info')
    for key,node in prompt.items():
        assert node['class_type'] in info, node['class_type']
        required=info[node['class_type']]['input']['required']
        assert set(required)<=node['inputs'].keys(),(key,required)
    (ROOT/'outputs/comfy-object-info.json').write_text(json.dumps({k:v for k,v in info.items() if k.startswith('Wuyin')},ensure_ascii=False,indent=2))
    for node in prompt.values():
        if 'consent' in node['inputs']:node['inputs']['consent']=True
        if 'confirmed' in node['inputs']:node['inputs']['confirmed']=True
    if args.stage=='recognize':prompt={k:prompt[k] for k in ['1','2']}
    result=request('/prompt',{'prompt':prompt,'extra_data':{'extra_pnginfo':{'workflow':json.loads((DEST/'wuyin-interior.json').read_text())}}})
    assert not result.get('node_errors'),result
    ident=result['prompt_id']; print(json.dumps(result),flush=True)
    (ROOT/f'work/comfy-{args.stage}-submission.json').write_text(json.dumps(result))
    start=time.time()
    while time.time()-start<1400:
        history=request('/history/'+ident)
        if ident in history:
            (DEST/('recognition-history.json' if args.stage=='recognize' else 'execution-history.json')).write_text(json.dumps(history,ensure_ascii=False,indent=2))
            print(json.dumps(history[ident]['status'],ensure_ascii=False),flush=True)
            break
        time.sleep(5)
    else:raise RuntimeError('Engine result unknown; do not auto retry.')

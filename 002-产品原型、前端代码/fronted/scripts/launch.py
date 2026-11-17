"""Build React login and launch the Node API with its existing Python design service."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser

root=Path(__file__).resolve().parents[1]
backend=root.parent/'backend'
node=shutil.which('node')
if not node:
    bundled=Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node'
    node=str(bundled) if bundled.exists() else None
if not node:
    sys.exit('需要Node.js 22+，请先安装Node.js。')
url='http://127.0.0.1:8766'
try:
    with urllib.request.urlopen(url+'/health',timeout=1) as response:
        if json.load(response).get('application')=='wuyin-node-backend':
            webbrowser.open(url)
            sys.exit(0)
except (OSError,ValueError):
    pass
build=subprocess.run([node,str(root/'node_modules/vite/bin/vite.js'),'build'],cwd=root)
if build.returncode:
    sys.exit('前端构建失败，请先在fronted目录安装依赖。')

def open_ready():
    for _ in range(40):
        try:
            with urllib.request.urlopen(url+'/health',timeout=.5):
                webbrowser.open(url)
                return
        except OSError:
            time.sleep(.25)

threading.Thread(target=open_ready,daemon=True).start()
env=os.environ.copy()
env['PYTHON_COMMAND']=sys.executable
try:
    result=subprocess.run([node,str(backend/'src/server.js')],cwd=backend,env=env)
    sys.exit(result.returncode)
except KeyboardInterrupt:
    pass

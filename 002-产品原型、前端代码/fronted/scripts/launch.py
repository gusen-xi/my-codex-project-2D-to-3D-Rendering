"""Open an existing local prototype or start it on the first available port."""
import json
from pathlib import Path
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser

root = Path(__file__).resolve().parents[1]
for port in range(8766, 8790):
    url = f'http://127.0.0.1:{port}'
    try:
        with urllib.request.urlopen(url + '/api/config', timeout=.5) as response:
            if json.load(response).get('application') == 'wuyin-space':
                webbrowser.open(url)
                print('已打开正在运行的工作台：' + url)
                sys.exit(0)
    except Exception:
        pass
    with socket.socket() as probe:
        if probe.connect_ex(('127.0.0.1', port)) != 0:
            break
else:
    sys.exit('8766–8789 端口均被占用，请手动指定其他端口。')

def open_when_ready():
    for _ in range(40):
        try:
            with urllib.request.urlopen(url + '/api/config', timeout=.5):
                webbrowser.open(url)
                return
        except Exception:
            time.sleep(.25)

threading.Thread(target=open_when_ready, daemon=True).start()
try:
    subprocess.run([sys.executable, str(root / 'server/app.py'), '--port', str(port)], cwd=root)
except KeyboardInterrupt:
    pass

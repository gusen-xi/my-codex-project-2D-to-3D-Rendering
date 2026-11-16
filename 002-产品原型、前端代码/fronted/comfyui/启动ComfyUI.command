#!/bin/zsh
cd "${0:A:h}/.." || exit 1
export WUYIN_PROJECT_ROOT="$PWD"
if [[ ! -x work/comfy-venv/bin/python || ! -f work/ComfyUI/main.py ]]; then
  print '未找到本机 ComfyUI 运行时，请阅读 comfyui/README.md。'
  read '?按回车退出'
  exit 1
fi
if curl -sf --max-time 2 http://127.0.0.1:8188/object_info/WuyinGenerate >/dev/null; then
  open http://127.0.0.1:8188
  exit 0
fi
open http://127.0.0.1:8188
exec work/comfy-venv/bin/python work/ComfyUI/main.py --cpu --listen 127.0.0.1 --port 8188

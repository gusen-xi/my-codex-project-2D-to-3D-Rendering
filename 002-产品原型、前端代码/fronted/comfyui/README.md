# 无垠空间 · ComfyUI 单房间工作流

## 内容与边界

`wuyin-interior.json` 是 ComfyUI 0.4 格式的 UI 工作流；`wuyin-api.json` 是对应后端 API prompt。9 个节点、10 条连线，6 种自定义类型全部提供源码，没有封装子图。其余为 ComfyUI 内置 LoadImage / SaveImage。

参考原资料中的 Janus → FLUX → 保存思路，适配为现有产品实际接通的视觉识别 → 人工确认 → imageStyle API → 局部蒙版编辑 → 保存。不是对原 FLUX 工作流的已运行声明；不要求下载 FLUX / Janus / LoRA 权重。

## 安装

1. 安装官方 ComfyUI： https://github.com/Comfy-Org/ComfyUI ，使用其 requirements.txt。
2. 将 `custom_nodes/wuyin` 复制到 ComfyUI 的 `custom_nodes/wuyin`，并在其 Python 环境安装原型 `requirements.txt`（包含网站后端共享代码需要的 PyMySQL）。
3. 设置环境变量 `WUYIN_PROJECT_ROOT` 为本原型根目录（包含 server/app.py、public/、outputs/）；本包使用本原型的真实生成与像素合成实现，并非独立脱离原型运行的节点库。
4. 确保本机 imageStyle 服务已配置。默认位置 `~/.codex/mcp-services/imageStyle-1.1.6`，可通过 `IMAGE_STYLE_SERVICE` 修改；密钥使用服务原有配置，不写入工作流。
5. 将 `wuyin-plan.jpg` 放入 ComfyUI 的 `input/`，重启 ComfyUI，导入 `wuyin-interior.json`。可换成自己的平面图。
6. 开启结构识别节点的 consent。先运行识别节点、查看网站识别结果或 ComfyUI 的节点输出；核对房间框、门窗、结构和观察点，修改节点 3 参数并设置 confirmed=true。生图与编辑节点 consent=true 表示同意将图片发送至 mckj.hk.cn。默认 false 防止导入即发生模型调用。
7. 整图和裁切图经 reference-generate 生成首版。蒙版编辑节点依据归一化矩形生成同尺寸透明蒙版，使用 base-edit，然后仅在选区内合成。调整节点 7 的选区应覆盖待替换物体及必要阴影，执行后人工验收。

识别节点输出为 STRING；可在 ComfyUI 临时连接文本预览插件查看（不属于交付工作流必需依赖），或在原型的 outputs/jobs 中查看本次真实识别结果。首次核对可只连接节点 2 至内置文本保存/预览工具，或先用网站完成相同识别核对。已核对的执行样例参数只适用于随包样例图纸。

## 本机复现

运行时位于原型 `work/ComfyUI` 与 `work/comfy-venv`。在原型根目录：

```sh
WUYIN_PROJECT_ROOT="$PWD" work/comfy-venv/bin/python work/ComfyUI/main.py --cpu --listen 127.0.0.1 --port 8188
```

浏览 http://127.0.0.1:8188 。CPU 只负责图像读写、蒙版、API 编排，图像模型在外部服务执行。工作流会产生识别一次、首次生图一次、局部编辑一次的上游调用；无可确认费用信息时不承诺价格。超时/结果未知不得自动重试。ComfyUI 会缓存未变的节点；清理缓存或重启后再次排队可能重新调用。

网站中静态画布读取同一 UI JSON，支持平移缩放与查看全部参数，不会在浏览页面时调用模型。下载的 JSON 默认未同意发送，执行记录里的参数为当次人工确认样例。

## 验证依据

以 `verification.json` 及 `execution-history.json` 为准。JSON 结构正确与实际模型运行分别记录。成功执行只证明链路可运行，不证明墙体、门窗、比例已通过几何验收。局部编辑选区外像素保持由本地合成实现，选区内仍需人工核对。

规范：https://docs.comfy.org/specs/workflow_json_0.4
自定义节点：https://docs.comfy.org/custom-nodes/backend/server_overview

本机节点类型与返回插槽已对照真实 `/object_info` 检查；9 个节点全部匹配。默认导入文件的外发与确认开关为 false，原始执行历史记录了本次核对后的 true 参数。样例只验证链路，自动识别存在误判，生成图也未作为几何精度合格样本。

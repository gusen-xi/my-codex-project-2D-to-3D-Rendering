# 无垠空间 · 前端开发

住宅室内设计师使用的平面图转效果图网页原型。使用原生 JavaScript ES Modules 与 CSS，配套 Python 本地 API 服务；无前端框架、打包或 CDN 依赖。

## 快速启动

macOS 双击根目录 **启动网站.command**，或执行 `npm run dev`。脚本优先使用本机 Codex Python，自动打开网站并复用运行中的服务。默认地址 http://127.0.0.1:8766 。终端窗口需保持打开。

其他环境先安装 Python 3.10+ 及依赖：

```sh
python3 -m pip install -r requirements.txt
python3 server/app.py --port 8766
```

不要直接打开 index.html 或仅运行静态文件服务器；上传、持久化与模型调用依赖本地 API。

## 项目结构

```text
fronted/
├── index.html                # 页面入口
├── package.json              # 开发、语法检查及测试命令，无 npm 依赖
├── src/                      # 浏览器端源码
│   ├── main.js               # 应用状态、导航与设计工作台
│   ├── workflow.js           # ComfyUI 工作流画布与执行证据
│   ├── space-controls.mjs    # 房间选框与八向视角计算
│   └── styles/main.css       # 页面样式与响应式布局
├── public/                   # 直接提供给浏览器的静态资源
│   ├── assets/               # 项目平面图、人工效果图副本
│   └── workflows/            # 可下载工作流、节点包、历史与验证图片
├── server/
│   └── app.py                # 本地 HTTP/API、上传与模型任务
├── scripts/
│   └── launch.py             # 端口检查、启动服务、打开浏览器
├── tests/                    # API、工作流完整性及选框/方向测试
├── comfyui/                  # 自定义节点、工作流构建和复现工具
├── docs/                     # 详细产品说明与迁移记录
├── outputs/                  # 上传、生成结果、当前工作区、执行证据
├── work/                     # 临时裁图、蒙版、ComfyUI 及其虚拟环境
├── requirements.txt          # 本地服务的 Python 依赖
└── 启动网站.command           # macOS 启动入口
```

## 开发约定

- 应用代码放 `src/`，图片与可下载文件放 `public/`；浏览器通过 `/src/`、`/assets/` 和 `/workflows/` 访问。
- 本地服务仅公开页面源码、静态资源与允许的输出图片，不公开服务端源码、密钥、运行时或整个项目目录。
- Python 服务与自定义节点均根据文件位置解析项目根目录；新增脚本避免写死电脑上的绝对项目路径。
- 测试代码放 `tests/`，临时材料放 `work/`，运行结果和交付证据放 `outputs/`。
- ComfyUI 构建文件和配套节点改动后运行 `python3 comfyui/build_workflow.py`、`python3 comfyui/package_workflow.py`；真实模型执行可能产生外部调用，不能当作离线测试自动运行。

## 验证

在已安装 Python 依赖和 Node.js 的环境中运行 `npm test`；`npm run check` 检查前端脚本语法。也可单独执行：

```sh
python3 -m unittest discover -s tests -v
node tests/test_space_controls.mjs
```

## 功能与资料

- [详细产品说明与既有验证](docs/原型说明与验证.md)
- [目录迁移说明](docs/目录迁移说明.md)
- [ComfyUI 安装与复现](comfyui/README.md)
- [真实模型验证记录](outputs/验证记录.md)

图像服务读取本机 imageStyle 的既有配置，凭据不进入前端或下载包。结构精度仍需人工验收；本原型是单机试用环境。

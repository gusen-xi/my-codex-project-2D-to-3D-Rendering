# 无垠空间 · 前端开发

住宅室内设计师使用的平面图转效果图网页原型，包含本地用户名/密码登录与注册入口。使用 React + Vite 实现登录/注册页，原有设计工作台继续使用原生 JavaScript ES Modules 与 CSS；Node.js/Express 提供认证入口，Python 保留上传、识别、生图和项目业务 API。

## 快速启动

先启动 Docker Desktop 和 `wuyin-mysql` 容器。网站账号、项目、房间、任务、版本和评价已接入本机 MySQL；旧账号密码保持不变。详见 [MySQL 接入说明](docs/MySQL接入说明.md)。

macOS 双击根目录 **启动网站.command**，脚本会先构建 Vite 前端，再启动 Node.js 认证网关（8766）和 Python 设计服务（内部8767），自动打开 http://127.0.0.1:8766。终端窗口需保持打开。开发时可执行 `pnpm dev`（仅前端，API 代理到8766）。

新环境需要 Node.js 22+、pnpm、Python 3.10+ 及依赖。完整配置和启动步骤见 [后端说明](../backend/README.md)：

```sh
python3 -m pip install -r requirements.txt
pnpm install
pnpm build
cd ../backend
pnpm install
pnpm start
```

不要直接打开 index.html 或仅运行静态文件服务器；上传、持久化与模型调用依赖本地 API。

## 项目结构

```text
fronted/
├── index.html                # 页面入口
├── package.json              # React/Vite 开发、构建、测试命令
├── vite.config.js             # 本地开发代理到 Node 网关
├── src/                      # 浏览器端源码
│   ├── workspace-state.mjs    # 每次登录的空白设计状态
│   ├── auth.jsx              # React 登录与注册表单
│   ├── main.js               # 应用状态、导航与设计工作台
│   ├── workflow.js           # ComfyUI 工作流画布与执行证据
│   ├── space-controls.mjs    # 房间选框与八向视角计算
│   └── styles/main.css       # 页面样式与响应式布局
├── public/                   # 直接提供给浏览器的静态资源
│   ├── assets/               # 项目平面图、人工效果图副本
│   └── workflows/            # 可下载工作流、节点包、历史与验证图片
├── server/
│   ├── app.py                # Python 业务 API、上传与模型任务（内部8767）
│   └── database.py           # MySQL 连接、事务和业务记录
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

- 应用代码放 `src/`，图片与可下载文件放 `public/`；Vite 开发时加载源码，正式启动只提供 dist 构建产物和 public 静态资源。
- 本地服务仅公开页面源码、静态资源与允许的输出图片，不公开服务端源码、密钥、运行时或整个项目目录。
- Python 服务与自定义节点均根据文件位置解析项目根目录；新增脚本避免写死电脑上的绝对项目路径。
- 测试代码放 `tests/`，临时材料放 `work/`，运行结果和交付证据放 `outputs/`。
- ComfyUI 构建文件和配套节点改动后运行 `python3 comfyui/build_workflow.py`、`python3 comfyui/package_workflow.py`；真实模型执行可能产生外部调用，不能当作离线测试自动运行。

## 项目管理

每次密码登录后进入空白工作台；当前项目只在同页刷新时恢复。“我的项目”支持新建、继续设计和生图记录自动归档；无垠项目为只读样例，与个人设计分开。详见 [项目管理与归档](docs/项目管理与归档.md)。

## 后端架构

`backend/` 是 Node.js + Express 认证网关：`POST /api/auth/register`、`POST /api/auth/login`、`GET /api/auth/session` 和 `POST /api/auth/logout`。密码使用 PBKDF2-SHA256，随机会话令牌只以 SHA-256 摘要写入 `auth_sessions`，保存在当前标签页的sessionStorage，通过Authorization请求头传递。新标签页粘贴地址需重新登录，原标签页刷新保留登录；私有图片通过认证fetch读取。网关将其他 `/api/` 与 `/outputs/` 请求转发给 Python 服务；Python 只通过同一会话表识别用户，因此登录后原有工作台权限继续生效。

## 验证

在已安装 Python 依赖和 Node.js、运行 MySQL 且具备临时测试库管理权限的环境中运行 `npm test`；`npm run check` 检查前端脚本语法。也可单独执行：

```sh
python3 -m unittest discover -s tests -v
node tests/test_space_controls.mjs
```

## 功能与资料

- [详细产品说明与既有验证](docs/原型说明与验证.md)
- [目录迁移说明](docs/目录迁移说明.md)
- [ComfyUI 安装与复现](comfyui/README.md)
- [真实模型验证记录](outputs/验证记录.md)

图像服务读取本机 imageStyle 的既有配置，凭据不进入前端或下载包。账号密码以哈希形式保存在 MySQL，图片文件仍保存在本机；历史 JSON 已备份，正常使用不再更新旧账号和工作区文件。结构精度仍需人工验收；本原型是单机试用环境。

## 2026-11-17 创作体验更新

参考图库按项目和房间分组；空间核对加入长宽输入；风格卡片展示装修参考图；局部修改支持选区缩放与移动；头像可本地上传；成果页可按原方案重生成或开始新创作。出图画幅、像素和质量已接入真实任务参数。详见 [交互、参数和验证说明](docs/创作体验与出图规格.md)。

参考图库已按用户指定接入雨林的鲸、幻城、中式凤鸣湾、新中式金辉城、中式传家合院，与无垠共6个项目、140张参考图；支持按房间浏览和选择预览，原始案例文件保留。

# 无垠空间 · JavaScript 后端

## 当前实现与边界

项目原先已有 Python 后端，并非只有前端和数据库。此次按 React + Vite 的选择，新增 Node.js + Express + mysql2 认证后端，先完成用户名/密码注册、登录、会话查询和退出。React 负责登录/注册界面，原有 JavaScript 设计工作台保持可用。

网站统一入口 `http://127.0.0.1:8766`：浏览器 → Node 网关 → 认证接口直接访问 MySQL；上传、项目、房间、模型任务、版本和图片请求转发至本机 Python 服务（8767）。两个服务通过 `auth_sessions` 验证同一用户，业务权限仍由 Python 按账号、项目和素材归属检查。不会让浏览器直接连接数据库。

## 启动

当前电脑已安装依赖并执行增量会话表脚本。启动 Docker Desktop 和 `wuyin-mysql` 后，双击相邻 `fronted/启动网站.command`。脚本构建 Vite 前端，再启动 Node 和所需 Python 子进程；终端需保持打开，停止后可再次双击。原网站账号和密码继续有效。

修改后端代码后，需要先在原启动终端按 `Ctrl+C` 停止服务，再重新运行 `启动网站.command`；已运行的 Python 服务不会自动加载磁盘上的新代码。

新环境准备（Node.js 22+、Python 3.10+、MySQL 8.4）：

1. 在 `fronted` 中执行 `pnpm install`、`python3 -m pip install -r requirements.txt` 和 `pnpm build`。
2. 在本目录执行 `pnpm install`。
3. 选择目标数据库，依次执行项目 `003-数据库脚本/001_create_tables.sql` 和 `002_create_auth_sessions.sql`。既有环境仅补执行002，不重置旧表。
4. 配置项目根目录私有 `work/mysql/.env` 的 `MYSQL_USER/MYSQL_PASSWORD/MYSQL_DATABASE`，或使用 `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME` 环境变量。Node 和 Python 必须连接同一数据库。
5. 在本目录执行 `pnpm start`，或使用上述启动脚本。

前端开发：先启动完整网站，再在 `fronted` 执行 `pnpm dev`，打开 `http://127.0.0.1:5173`；Vite 将 `/api` 和 `/outputs` 代理至8766。`vite preview` 仅用于检查静态构建，不提供后端接口。

## 目录与接口

```text
backend/
├── src/
│   ├── server.js   # 检查数据库/构建产物、启动Python、监听8766
│   ├── app.js      # 请求边界、认证路由、业务代理、静态资源、错误响应
│   ├── auth.js     # 凭据校验、密码派生、会话签发和撤销
│   └── config.js   # 私有配置读取与连接池设置
├── tests/auth.test.js
├── package.json
└── pnpm-lock.yaml
```

| 接口 | 输入 | 成功结果 |
|---|---|---|
| `POST /api/auth/register` | JSON `{username,password}` | 201 `{user:{id,username},token}`，自动登录 |
| `POST /api/auth/login` | JSON `{username,password}` | 200 `{user:{id,username},token}` |
| `GET /api/auth/session` | `Authorization: Bearer <token>` | 200 `{authenticated,user}`，未登录时user为null |
| `POST /api/auth/logout` | JSON `{}` 与 Authorization | 200 `{loggedOut:true}`，撤销当前会话 |
| `GET /health` | 无 | MySQL连接正常时200 |

用户名3–32位，支持中文及其他Unicode字母、数字、下划线和连字符，去除首尾空白且区分大小写。密码6–64位，不自动去除空白。响应不包含密码、盐或哈希。新注册及每次密码登录后进入空白工作台，由用户命名新建或首次上传时创建项目，不自动恢复旧项目。

错误：400输入无效、401凭据错误、403跨站请求、409用户名重复、413请求过大、415非JSON、429频率限制、503数据库/内部服务不可用。前端展示服务端中文错误，不以“网络失败”代替所有原因。

## 登录实现

- 注册：校验 → 随机盐与PBKDF2-SHA256（210000次）→ 事务插入用户和会话 → 返回令牌；用户名唯一索引处理并发重复。
- 登录：参数化查询用户 → 按记录中的迭代次数校验哈希 → 常量时间比较 → 换发随机会话；兼容旧Python账号的120000次PBKDF2格式。
- 会话：32字节随机令牌，有效期7天；数据库仅保存令牌的SHA-256摘要。令牌保存在当前标签页的sessionStorage，通过Authorization请求头传递；服务端不再接受旧Cookie认证，也不把令牌放入URL。会话重启后仍有效；过期或退出即失效。登录时撤销当前标签页旧令牌，签发会话时清理过期记录。
- 每IP15分钟最多60次登录/注册请求；当前本地进程内计数，重启重置。
- 新标签页粘贴地址要求重新登录，原标签页刷新保留登录。新导航时清除继承的存储，不影响其他标签页的独立会话。私有图片通过携带Authorization的fetch读取为Blob预览，下载同样检查认证；直接打开图片地址返回401。
- 服务只监听本机。sessionStorage中的令牌可被同源JavaScript读取，不能防御同源脚本注入或本机恶意代码；生产部署还需HTTPS、脚本注入防护和相应部署审查。浏览器自身的会话恢复行为不作为“每次开启浏览器必须输入密码”的保证。

## 后续业务设计

| 模块 | 当前逻辑 | 后续工作边界 |
|---|---|---|
| 账号认证 | 本目录Node实现，MySQL保存 | 本次已完成 |
| 项目、素材、房间、草稿 | Python API和MySQL事务已实现 | 若统一JavaScript，逐接口迁移并保留所有权检查 |
| 识别、生成、局部编辑 | Python任务执行、幂等请求、状态/版本保存已存在 | 可逐步迁移调度；保留现有模型适配器与完成日志恢复 |
| 人工验收与版本 | 已由Python保存和读取 | 保留父版本关系、只追加成功结果规则 |
| 多项目管理 | 已实现创建、列表、按ID恢复、生成记录归档和样例展示 | [交互与接口说明](../fronted/docs/项目管理与归档.md) |
| 团队、收费 | 未实现 | 不在当前范围 |

不一次性改写已工作的模型服务，避免将登录改造扩大为全业务迁移。

## 验证

在本目录运行 `pnpm test`、`pnpm check`。认证集成测试使用真实MySQL创建随机 `wuyin_node_test_*` 临时库，完成后清理；需要本机私有配置中已有管理凭据，不写入真实业务账号。测试覆盖注册、重复、校验、旧密码格式、登录、会话轮换/失效/过期、应用重建后恢复、跨站拒绝、限流和数据库故障。

`fronted` 中运行 `python3 -m unittest discover -s tests -v`、`node tests/test_space_controls.mjs` 和 `pnpm build`。Python集成测试验证共享会话下的业务权限和账号隔离，不再直接调用旧Python注册接口。

本轮验证：6项Node集成测试、19项Python测试、选框/八向视角检查及Vite生产构建通过。浏览器使用既有测试账号验证错误密码、成功登录、刷新保持、退出、重复注册提示；成功注册在临时库验证。本轮没有调用付费生图模型。

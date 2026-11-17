# 后台管理系统后端

本服务使用 Node.js + Express + MySQL，只读查询现有产品数据。默认监听 `127.0.0.1:8770`，并复用产品后端 `127.0.0.1:8766` 的登录 API；它不自行校验或保存密码。管理员身份必须同时满足有效 `auth_sessions` 和唯一 `super_admins` 授权记录。

## 启动

从项目根目录运行：

```sh
cd "004-后台管理系统/frontend" && pnpm install && pnpm build
cd "../backend" && pnpm install && pnpm start
```

浏览器打开 `http://127.0.0.1:8770`。先启动 MySQL 与产品 JavaScript 后端（默认 8766）。数据库连接读取项目根目录 `work/mysql/.env` 的 `MYSQL_USER`、`MYSQL_PASSWORD`、`MYSQL_DATABASE`，可用 `DB_HOST`、`DB_PORT`、`DB_USER`、`DB_PASSWORD`、`DB_NAME` 覆盖。认证与健康检查只访问本机产品后端。

本地开发：前端 `pnpm dev` 使用 5175 端口并代理至 8770；后端另开终端运行 `pnpm dev`。Vite 配置只允许本机访问。

## 首位管理员授权

先通过产品注册/登录流程创建普通账号，再由项目所有者明确选择账号后，在 `backend` 目录运行：

```sh
node scripts/authorize-admin.js <现有产品用户名>
```

脚本只在 `super_admins` 为空时登记一名用户；已有记录时拒绝执行，不会修改 schema。当前交付不会自动挑选或授权账号。PRD 规定该表应恰好有一条记录，未登记或授权不唯一时后台拒绝登录/访问。

## 数据与隐私边界

没有业务写接口、图纸或效果图文件接口、文件预览、下载、CSV 导出或草稿查询。SQL 仅返回列表白名单字段，密码派生数据、会话令牌、文件名、路径和完整 JSON 快照不进入 API。登录会复用现有产品认证；普通用户即使密码正确也会被拒绝，刚签发的会话会立即撤销。退出后台会撤销当前会话。服务不记录请求正文或认证头。

运行日志仅输出本地启动/错误摘要到当前终端，不写数据库或项目日志文件；关闭终端即停止记录。清理时关闭终端并清空其滚屏即可。管理数据只读，schema 不包含自动迁移。

## 检查

```sh
pnpm check
pnpm test
```

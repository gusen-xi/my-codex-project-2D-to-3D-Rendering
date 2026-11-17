# 无垠空间数据库设计 v0.1

根据产品 PRD v0.1 和当前 `002-产品原型、前端代码/fronted/` 的账号、工作区、任务及版本数据设计。目标环境为本机 Docker 的 MySQL 8.4.13，数据库名为 `wuyin`。

本目录交付表结构，不包含测试账号。网站随后已接入 MySQL，旧数据已迁移，参见 [接入说明](../002-产品原型、前端代码/fronted/docs/MySQL接入说明.md)；仅对新环境执行建表脚本不会自动导入旧 JSON。

## 文件和执行方式

- `001_create_tables.sql`：七张业务表、字段注释、索引、外键与 CHECK 约束。
- `002_create_auth_sessions.sql`：Node.js 登录会话表；在业务表之后执行。先选择数据库再运行，脚本本身不切换数据库。
- `verify_schema.py`：在现有 `wuyin-mysql` 容器创建随机命名的临时库，执行建表及完整链路验证，结束后删除该临时库。

Navicat 中打开连接，选择 `wuyin` 数据库，打开并执行 `001_create_tables.sql`，刷新“表”列表即可。使用已有 `wuyin` 用户可执行，其密码沿用本机配置；脚本不包含凭据。

终端执行（在项目根目录）：

```sh
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
docker exec -i wuyin-mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql -u "$MYSQL_USER" "$MYSQL_DATABASE" --default-character-set=utf8mb4' < '003-数据库脚本/001_create_tables.sql'
```

脚本不包含 DROP、TRUNCATE、初始化数据或权限修改。`IF NOT EXISTS` 只支持相同结构重复执行，不会更新已有同名表；若已有其他版本，应另写增量迁移。MySQL DDL 不是整份脚本原子事务，遇错需先检查执行结果再重试。

## 表设计与业务对应

| 表 | 作用 | 主要关联和约束 |
|---|---|---|
| `users` | 用户名和密码派生信息 | 用户名唯一且区分大小写；存盐、算法和迭代次数 |
| `auth_sessions` | 7天登录会话 | 随机令牌摘要为主键；用户外键；过期索引 |
| `projects` | 设计项目、所属用户、UI恢复草稿 | 所属用户外键；按用户/更新时间查询 |
| `assets` | 上传图、PDF原件/页面、人工参考图、结果图、蒙版 | 项目关联、父文件关联；按项目/素材类型查询 |
| `rooms` | 目标房间、可调整范围、核对信息和八向视角 | 归一化选区合法性、八向角度、确认人与时间成对 |
| `model_tasks` | 识别、生成、局部编辑和全图换风格任务 | 项目内请求编号唯一；输入快照、状态、耗时、费用及失败诊断 |
| `render_versions` | 成功结果及连续编辑分支 | 每任务最多一个结果；项目内版本号唯一；父版本关联 |
| `version_reviews` | 人工记录结构、布局、沟通价值及编辑保持 | 每版本/评价人唯一；NULL表示未评价 |

关系：一个用户拥有多个项目；项目包含素材、房间、任务与结果版本；任务使用素材和已确认房间，成功后新增一个结果版本；编辑版本指向父版本；评价指向版本及评价人。具体字段类型、默认值和注释以 SQL 为准。

## 当前前端字段映射

| 当前字段/文件 | 数据库位置 |
|---|---|
| `outputs/users.json` 的用户名、`salt/hash` | `users.username/password_salt/password_hash`，算法与迭代次数须按原实现填写 |
| `source/sourceName/isSample` | 平面图 `assets`、`projects.is_sample`；当前选中素材ID可放草稿 |
| PDF `pages` | 一个 `plan_original` 文件对应多条 `plan_page`，`parent_asset_id` 指向原文件 |
| `references.json` 的 `url/name/room` | `assets.storage_path/original_name/reference_room`，标记 `is_human_reference=1` |
| `rooms[].rect` | `rooms.rect_x/rect_y/rect_w/rect_h` |
| `rooms[].structure/dimensions` | `rooms.structure_notes/dimensions_notes` |
| `camera.x/y/angle` | `rooms.camera_x/camera_y/camera_angle` |
| `height/confirmed` | `rooms.ceiling_height_m/confirmed_by/confirmed_at` |
| `job.id/requestId/action/status/stage/request` | `model_tasks` 对应字段；完整请求放 `request_snapshot` |
| 识别返回的 `rooms/usage` | `model_tasks.result_snapshot`；确认后的房间单独写入 `rooms` |
| `job.created/finished` 秒时间戳 | 转为UTC，写入任务时间字段；耗时按结束/开始或提交时间计算 |
| `versions[].url/name/style/origin/parent` | `render_versions` 和关联 `assets`；旧版本UUID通过任务ID映射，不直接作为新版本整数主键 |
| `review[versionId][0/1/2]` | `version_reviews.structure_preserved/layout_preserved/usable_for_client` |
| `step/tab/zoom/selectedVersion/editInstruction/style/intent/reference` 等当前编辑态 | `projects.workspace_draft`；提交时复制所需值到不可变任务快照 |

当前上传接口将 PDF 转成页面，但不保留 PDF 原件；迁移时只登记真实存在的文件，不补造原件。当前层高是文本，迁移须解析明确数值；不能解析时数值列留 NULL，原文保留在草稿/任务快照。现有复选框未区分“未评价”和“不通过”，历史 false 不应直接批量当作负面评价。

## 关键数据规则

1. 图片/PDF本体继续保存为文件；库中只存路径和元信息。文件访问必须由后端校验项目所有权，不能直接信任前端传入的路径。
2. 空间框相对整图取值0–1；相机位置相对房间框取值0–1。角度对应：东0、东南45、南90、西南135、西180、西北225、北270、东北315。现有旧角度先按前端规则归一到八向。
3. 修改结构、尺寸、范围或视角后，后端必须清空房间确认信息；生成任务须验证已人工确认，并将确认内容、摄像机、风格、参考图、局部选区和外发同意写入快照。快照提交后不跟随房间编辑改变。
4. `model_tasks.request_id` 在同一项目内幂等；失败后手动重试使用新编号，查询同一次请求沿用原编号。状态 `unknown` 表示可能已在上游完成，不能自动重发。实际成本未知为 NULL，不能用0代表未知。
5. 局部修改的选区保存在 `request_snapshot.selection`，沿用原有归一化结构；原始请求保留 `parentVersionId`（如有）。仅在任务成功并校验输出文件有效后，在事务中写素材和新版本。失败不创建版本、不覆盖旧结果。
6. 同一项目版本号在锁定项目行的事务中分配，并受唯一索引兜底，不能无锁 `MAX+1`。
7. 普通外键只保证记录存在。**同项目限制、用户所有权、素材类型、任务成功才出版本、父版本无循环**须由后端在事务中检查；当前脚本不等于已实现多用户权限隔离。`workspace_draft` 不保存密码、Cookie或提供商密钥。
8. 时间统一UTC（DATETIME需由应用连接设置 `time_zone='+00:00'`），页面显示北京时间。外键使用默认限制删除，避免意外级联丢失历史；删除项目需另行设计文件与记录的清理流程。
9. `password_hash` 保存派生结果，不能写明文或仅普通SHA散列。当前原型的PBKDF2格式可迁入；Node.js认证后端通过增量脚本002新增会话表；不新增收费/团队表。ComfyUI工作流当前是静态JSON及证据文件，本次不复制成业务表。

## 验证结果

在本机 MySQL 8.4.13 的独立临时库实际执行并通过：七表创建、重复执行、账号→项目→素材→房间→任务→结果→评价的插入链路，以及用户名唯一、任务幂等、外键、越界选区、非法角度、非法评价值和删除保护。设计阶段的临时库已清理；随后已按用户指令在 `wuyin` 正式建表并完成网站接入和旧资料迁移，接入细节见上方链接。

复验命令（需 Docker 容器运行，脚本使用容器既有 root 环境凭据）：

```sh
python3 '003-数据库脚本/verify_schema.py'
```

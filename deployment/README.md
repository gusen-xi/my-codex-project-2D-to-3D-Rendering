# 免费云端面试演示

采用 Render Free Docker Web Service（新加坡）和 TiDB Cloud Starter MySQL（新加坡，月支出上限 $0）。服务独立于个人电脑运行；不部署管理后台，不迁移本地用户与历史项目。

## 体验规则

`DEMO_MODE=1` 关闭公开注册。通过 Render 私密环境变量 `DEMO_ACCOUNTS` 提供独立账号 JSON：`[{"username":"interview_01","password":"至少12位随机密码"}]`。初始化仅添加不存在的账号，重启不会重置密码或额度。给每位面试官分发一个账号；共享账号也共享额度。

每个账号终身允许提交一次识别、一次图片任务；生图、换风格、局部编辑共用图片额度。任务提交入库即占用，失败也不自动恢复，防止重复消耗。相同 requestId 返回原任务。所有项目按账号串行核对额度，刷新、换项目和重新登录不能重置。

## 部署配置

Render：Docker，Dockerfile `deployment/Dockerfile`，构建上下文仓库根目录，Free，Singapore，健康检查 `/health`。也可用根目录 `render.yaml` 创建 Blueprint。

私密环境变量：

- `DB_HOST`、`DB_PORT=4000`、`DB_USER`、`DB_PASSWORD`、`DB_NAME`：TiDB 连接信息，先建立独立数据库。
- `DB_SSL=1`：使用系统 CA 验证 TLS。
- `IMAGE_2_API_KEY`：既有模型服务密钥，仅存服务端环境，不放仓库或前端。
- `DEMO_ACCOUNTS`：独立体验账号列表。
- `PUBLIC_ORIGIN`：默认从 `RENDER_EXTERNAL_URL` 获取；绑定域名后设置为实际 HTTPS 域名。

启动时 `cloud_init.py` 幂等执行两份基础 SQL 和云端文件分块表；仅在云端初始化时将用户名排序规则转换成 TiDB 支持的 `utf8mb4_bin`，保持大小写敏感。

Render 免费磁盘是临时的。`CLOUD_FILES=1` 将上传和生成图片、PDF、头像存入 TiDB 的 `demo_file_chunks`，每块 1 MiB，单文件最多 50 MiB；缺失本地缓存时自动恢复。小规模面试演示使用数据库存图，规模增长再改对象存储。

云端图库仅显示已纳入仓库的无垠样例；未跟踪的其他案例目录不会打包，构建时过滤对应图库条目，避免破图。原始项目资料、CAD、本地配置、输出与工作目录不进入容器。

模型适配 `deployment/model/route_a_image.py` 复制自本机已安装的 imageStyle-1.1.6 同名脚本；连接现有模型中转，不包含密钥；模型服务自身的额度及收费不受免费托管影响。

## 域名

建议绑定 `demo.zanegao.cn`。Render 添加该域名后，按其给出的 CNAME 在阿里云 DNS 中新增 `demo` 记录，保留其他解析；等待域名验证和 HTTPS 证书签发，再将 `PUBLIC_ORIGIN` 改为 `https://demo.zanegao.cn`。

## 使用限制

Render 免费服务闲置 15 分钟后休眠，冷启动可能约一分钟；每月免费运行时间受账号额度限制。TiDB 达到 $0 支出上限后的免费额度边界会限流。海外服务在国内的访问质量需要实际网络测试，无法承诺所有运营商稳定。模型生成也需要等待；浏览器轮询任务时保持页面打开。

官方说明：[Render Free](https://render.com/docs/free)、[TiDB 套餐](https://docs.pingcap.com/tidbcloud/select-cluster-tier/)。

## 验证

本地 MySQL：Python 25 项、Node 7 项集成测试通过，覆盖账号隔离、公开注册关闭、来源限制、跨项目并发额度、失败不返还、幂等请求和重启文件恢复；前端构建、语法和交互脚本通过。所有测试使用模型替身，没有消耗真实模型额度。实际云端最终状态见项目入口 README 的部署记录。

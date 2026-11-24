# 成都外国语学校国际部小程序 企业级工程任务书

本仓库是三人七天工程任务的唯一入口。项目目前处于需求和任务规划阶段，**尚无应用代码**。项目目标是交付可部署、可维护、可验证的企业级工程候选版，包含微信小程序、Web 内容管理后台、API 服务和数据库。适用范围以学校批准的最新需求为准。

## 请先认领

| 角色 | 唯一责任 | 任务书 | 认领入口 |
| --- | --- | --- | --- |
| A | 后端/API、数据库、安全、基础设施、CI 与集成 | [A 后端与平台](tasks/A-工程与集成.md) | [Issue 1](https://github.com/MAGA2010/CFLS/issues/1) |
| B | 微信小程序用户端、页面、交互与客户端测试 | [B 小程序用户端](tasks/B-学校与课程.md) | [Issue 2](https://github.com/MAGA2010/CFLS/issues/2) |
| C | Web 管理后台、编辑审核工作流、后台测试 | [C 管理后台](tasks/C-校园资讯与服务.md) | [Issue 3](https://github.com/MAGA2010/CFLS/issues/3) |

先确认 Issue 没有被认领，将自己设为负责人；无权限则在 Issue 留言并请项目负责人确认。不要三人同时从零搭同一套工程。按 [协作与工程约定](docs/共同约定.md) 分支开发、发 PR、互审及每日报告。

## 阅读顺序

1. [范围、七天排期和验收](docs/七天排期和验收.md)：交付承诺、每日检查和验收门槛。
2. [系统架构与数据契约](docs/系统架构与数据契约.md)：项目结构、模型、API、状态流转、权限与错误规则，三人以此联调。
3. [安全、部署与运维](docs/安全部署与运维.md)：安全基线、环境隔离、备份恢复、发布回滚和生产前条件。
4. [测试与验收用例](docs/测试与验收用例.md)：功能、权限、并发、异常、构建、恢复和交付证据。
5. [负责人执行与验收模板](docs/负责人执行与验收模板.md)：如何追踪、报缺陷、签收成果。
6. 各角色任务书：工作包、步骤、每日交付、依赖、PR、AI 执行指令。

## 七天交付边界

假设三人七天均可投入约 6–8 小时/天，熟悉 TypeScript/Web，能访问代码仓库、微信开发者工具和测试环境。第 1 天验证这个假设；资源或经验不足立即报阻塞，调整范围或时间，不降低质量后伪称完成。

P0 包括小程序核心内容、受控 CMS、真实 API 和测试数据库、基于角色的服务端鉴权、内容草稿/送审/审核/发布、合成咨询数据、自动化检查、可复现部署及验收证据。阶段环境只允许合成数据。P1 和外部依赖见排期；未完成如实登记。

“企业级候选版”指按工程和质量标准交付的**待验收版本**，不是声称已正式投产或已经通过安全/隐私/合规审查。真实用户数据、公开服务、学校品牌与正式内容、账号资质、备案和平台审批需校方确认及生产发布门槛通过。

## 项目负责人

负责人不必写代码，但须确定 A/B/C、一个可投入的验收人、校方决策及素材对接人；第一天确认工具和资源，第三天看端到端接口，第五天锁定范围，第七天在固定版本上验收。阻塞超过半天须决定处理方式；需求变更记下负责人、影响及决定。仓库公开，禁止上传内部材料、真实师生数据、密钥、未授权素材或账号。

---

# 实施说明（A：后端与平台）

[![CI](https://github.com/MAGA2010/CFLS/actions/workflows/ci.yml/badge.svg?branch=feat%2Fa-backend-platform)](https://github.com/MAGA2010/CFLS/actions/workflows/ci.yml)

## 技术决策

| 项 | 决策 |
| --- | --- |
| 运行时 | Node.js 22+ |
| 包管理 | pnpm 11 workspace |
| API | Fastify 5 + TypeScript |
| 数据库 | PostgreSQL 16，测试同时支持 PGlite 内存实例 |
| 密码 | bcrypt cost 12 |
| 会话 | 服务端会话 + `HttpOnly` cookie；idle 120 分钟、absolute 720 分钟 |
| CSRF | 双提交 cookie + `X-CSRF-Token` |
| 接口契约 | `packages/contracts/openapi.yaml`（v1） |
| 静态检查 | oxlint + TypeScript strict |
| 日志 | Fastify/pino JSON，敏感字段脱敏 |

## 快速开始

### 方式一：Compose + PostgreSQL

```bash
export POSTGRES_PASSWORD='local-only-random-password'
export SESSION_SECRET='local-only-random-secret-at-least-32-bytes'
docker compose -f infra/docker-compose.yml up -d --build
curl http://127.0.0.1:3000/health/ready
docker compose -f infra/docker-compose.yml exec api node apps/api/dist/seed.js local
```

种子只在 `local/staging` 运行，生产配置硬拒绝；生成的合成账号密码只打印一次。不要提交 `.env`、备份或真实数据。

### 方式二：本机 Node + 内存 PostgreSQL（适合契约测试）

```bash
pnpm install --frozen-lockfile
DATABASE_URL='memory://' \
SESSION_SECRET='local-only-random-secret-at-least-32-bytes' \
CORS_ORIGIN='http://127.0.0.1:5173' \
INQUIRY_ENABLED=true \
AUTO_MIGRATE=true \
pnpm dev
```

`memory://` 只用于本地无 Docker 环境，进程退出后数据清空，不代表可部署数据库。

## 常用命令

```bash
pnpm dev          # AUTO_MIGRATE=true 时启动前执行迁移
pnpm build        # API TypeScript 构建
pnpm lint         # oxlint
pnpm typecheck    # TypeScript strict
pnpm test         # Vitest + PGlite/PostgreSQL
pnpm migrate      # 前向迁移
pnpm seed:local   # local 合成数据，生产硬拒绝
pnpm seed:staging # staging 合成数据，生产硬拒绝
```

测试若设置 `TEST_DATABASE_URL` 会使用真实 PostgreSQL；否则使用 PGlite。CI 同时运行真实 Postgres 迁移、二次迁移幂等检查和种子。

## 浏览器后台接入约定

1. 登录 `POST /v1/admin/sessions`。服务端设置 `cfls_session`（HttpOnly）和 `cfls_csrf`（可供 JS 读取），响应 `data.csrfToken` 也返回当前 token。
2. 所有管理端写请求同时发送 cookie 和 `X-CSRF-Token`。
3. 管理端响应不缓存；收到 401 清会话并回登录页，收到 403 保留表单，收到 409 保留输入并展示当前版本。
4. 客户端只依据 `error.code` 分派，不匹配 `message` 文案。
5. 401 后重新登录；CSRF 失败统一显示“会话已更新，请重试”。

## 运行边界

- 限流为单实例内存实现；多实例部署前必须换成共享 Redis 限流。
- 咨询接口只允许 `local/staging` 合成数据；`production` 无条件 404。
- 当前交付是可验证的企业级工程候选版，不宣称已正式投产、通过安全/隐私评估或完成校方审批。
- B/C 页面工程尚由各自责任人实现；A 已提供冻结版本的 OpenAPI 与可运行真实 API。

## 故障处理

| 现象 | 排查 |
| --- | --- |
| 端口占用 | 修改 `PORT`，Compose 同步映射 |
| 连库失败 | `/health/ready` 应为 503；检查 `DATABASE_URL`、Postgres healthcheck |
| 迁移失败 | 只新增前向迁移，不修改已应用文件；检查 `schema_migrations` |
| 401 | 会话过期/撤销/用户停用；重新登录 |
| 403 `CSRF_INVALID` | 重新登录并同时携带 CSRF cookie/header |
| 409 `VERSION_CONFLICT` | 重新获取详情，保留用户输入，不要覆盖服务端版本 |

## 验收证据

见 [`docs/验收证据.md`](docs/验收证据.md)。没有实际运行证据的项目明确标为未验证，不以文档或截图代替。

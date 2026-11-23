# A 企业级任务书 后端、数据、安全和平台（执行级 v3）

> **修订说明**：v3 在 v2 基础上补充：参考 DDL、错误码注册表、逐端点 API 规格、关键流程时序、横切规格（中间件/限流/会话/日志/审计）、测试用例注册表（AX 系列）、工时预算与风险登记表。文中标注"建议值"的参数（TTL、限流阈值、超时）由 A 在第 1 天确认后并入 OpenAPI 与 README；**接口与数据契约的事实源仍是 `docs/系统架构与数据契约.md` 与 `packages/contracts/openapi.yaml`，冲突时先改契约再改代码，并通知 B/C。**

## 目录

- 0 角色与目标（含工时预算）
- 1 全局工程约定
- 2 错误码注册表
- 3 参考数据模型（DDL 级）
- 4 API 端点规格（逐端点）
- 5 关键流程时序
- 6 横切规格（中间件/限流/会话/日志/审计/配置）
- A-01 单仓库与可复现环境
- A-02 数据模型、迁移和内容服务
- A-03 认证、会话、授权和审计
- A-04 测试咨询端到端
- A-05 CI、部署、恢复和接口联调
- 7 测试用例注册表（AX 系列）
- 8 风险登记表
- 9 日程与交付节点
- 10 PR 提交清单
- 11 可复制给 AI

## 0. 角色与目标

你对 API、数据库、认证/权限、审核工作流、安全基线、工程集成和交付运维负最终责任；B 实现小程序，C 实现 Web 管理端。你不负责替两端写页面，但须第一天给出可以并行的接口与示例，避免阻塞。先读 README、[工程约定](../docs/共同约定.md)、[架构/API](../docs/系统架构与数据契约.md)、[安全运维](../docs/安全部署与运维.md)、[验收用例](../docs/测试与验收用例.md)。如当前工程与文档不一致，先报告并由负责人决定，不擅自删除已有代码。

**阶段结果（逐项可勾选，全部有证据才算达成）：**

- [ ] 干净环境克隆后，按 README 一条命令启动 Postgres + API，`/health/ready` 通过
- [ ] OpenAPI v1 冻结发布，B/C 均已用其生成/引用类型并跑通至少一个真实请求
- [ ] 5 个角色（匿名/editor/reviewer/admissions/admin）对全部端点的权限矩阵自动化测试通过（AX-301 网格）
- [ ] 草稿→送审→审核→发布→下架全链路在真实测试 API 上走通，小程序与后台同步可见/不可见
- [ ] 测试咨询幂等（同 key 并发只落一条、同 key 异内容 409）、生产硬关闭均有自动化证据
- [ ] CI 全绿（含空库+有数据两种迁移场景）；回滚与备份恢复各演练一次并留记录
- [ ] 数据字典、环境变量清单、部署/回滚/备份文档、缺陷表交付

**工时预算（7 天 × 6–8h，总计 42–56h；预算超支 20% 即向负责人报告）：**

| 工作包 | 预算 | 主要产出 |
| --- | --- | --- |
| A-01 工程与环境 | 8h | 骨架、Compose、迁移种子、README |
| A-02 数据模型与内容服务 | 12h | 8 表迁移、CRUD、状态机、公开 API |
| A-03 认证权限审计 | 10h | 会话、RBAC、限流、审计、OpenAPI 定稿 |
| A-04 测试咨询 | 6h | 幂等、校验、招办读取 |
| A-05 CI 部署恢复 | 10h | CI、镜像、两场演练、性能基线 |
| 联调/缺陷/文档/缓冲 | 10h | 三次跨端联调、最终交付物 |

## 1. 全局工程约定

1. **环境三态**：`NODE_ENV ∈ {local, staging, production}`。种子、测试咨询、HTTP cookie 例外均以三态判断；生产分支逻辑不得被环境变量绕过（见 A-04 步骤 1）。
2. **标识与时间**：所有 id 为 UUID v4；时间以 UTC `timestamptz` 存储与传输（ISO 8601，含 Z），展示时区由客户端配置；排序一律 `published_at DESC, id DESC` 保证稳定。
3. **响应信封**：成功 `{ "data": …, "meta"?: {page,pageSize,total}, "requestId": "…" }`；失败 `{ "error": { "code": "…", "message": "…", "details"?: [...] }, "requestId": "…" }`。空列表为 200 + `data: []`。任何响应不返回 SQL、栈、内部配置、连接串。
4. **requestId**：入口中间件生成 UUID（或透传可信上游的同名头），写入响应体、日志与审计；B/C 拿它报障可反查单次请求全链路。
5. **请求体上限**：全局 100KB（建议值）；超限 400 `VALIDATION_FAILED`，details 注明 `body too large`。
6. **分页**：`page` 默认 1（≤0 → 400）、`pageSize` 默认 20、上限 100（>100 → 400）；`meta.total` 为精确计数。

## 2. 错误码注册表

> 事实源为 `docs/系统架构与数据契约.md` 6.1 错误码注册表（v2 起收编），本表与其同步维护：变更先改契约，再改本表与 OpenAPI。B/C 的错误界面按 code 分派，不得按 message 文案匹配。

| code | HTTP | 触发条件 | 客户端处理建议 |
| --- | --- | --- | --- |
| VALIDATION_FAILED | 400 | 字段缺失/类型/长度/枚举/未知字段/参数越界 | 表单场景逐字段回显 details；其余提示参数错误 |
| UNAUTHENTICATED | 401 | 无会话、会话过期/撤销/用户停用后调用受保护端点 | 清会话 → 跳登录 |
| AUTH_FAILED | 401 | 仅登录端点：用户不存在或密码错误（统一响应） | 提示"用户名或密码错误" |
| FORBIDDEN | 403 | 已认证但角色/对象归属不满足 | 提示无权限，保留数据 |
| SELF_REVIEW_FORBIDDEN | 403 | 审核者是内容作者（含多角色账号） | 提示"不能审核自己提交的内容" |
| NOT_FOUND | 404 | 资源不存在；匿名端对未发布内容一律 404（本仓库统一策略：不区分"无权"与"不存在"） | 提示不存在或已下架 |
| VERSION_CONFLICT | 409 | 乐观锁 version 不匹配（PATCH/状态动作） | 冲突对话框，回传服务端当前 version |
| INVALID_TRANSITION | 409 | 状态机非法跳转（如 draft 直接 publish） | 刷新详情并解释当前状态 |
| IDEMPOTENCY_CONFLICT | 409 | 同 Idempotency-Key 不同请求哈希 | 提示刷新/重新提交 |
| RATE_LIMITED | 429 | 超过端点限流 | "操作太频繁，请稍后再试" |
| INTERNAL_ERROR | 500 | 未捕获异常（响应含 requestId，不含细节） | "服务异常" + requestId |

## 3. 参考数据模型（DDL 级）

> 迁移文件是唯一事实源，本节为执行参考（PostgreSQL 16 语法）。所有约束在 PR 中逐条写理由；`citext` 需先建 extension。种子/测试数据一律 `is_test`/`is_demo` 标记。

```sql
CREATE EXTENSION IF NOT EXISTS citext;

-- 3.1 用户与角色
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username      citext NOT NULL UNIQUE,
  password_hash text    NOT NULL,                      -- Argon2id；禁止明文/可逆加密
  status        text    NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','disabled')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_roles (
  user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role     text NOT NULL CHECK (role IN ('editor','reviewer','admissions','admin')),
  PRIMARY KEY (user_id, role)                          -- 一人可多角色；自审禁令在服务端全量判断
);
CREATE INDEX idx_user_roles_role ON user_roles(role);

-- 3.2 会话（只存哈希）
CREATE TABLE sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,                     -- SHA-256(256-bit 随机 token)
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- 3.3 内容主表
CREATE TABLE contents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type         text NOT NULL CHECK (type IN
               ('school','academics','outcomes','campus','student_union','news','admissions','contact')),
  category     varchar(40) NOT NULL,
  title        varchar(120) NOT NULL
               CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  summary      varchar(300),
  body         text NOT NULL DEFAULT '',
               CHECK (summary IS NULL OR char_length(summary) <= 300),
               CHECK (char_length(body) <= 20000),
  status       text NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft','pending_review','approved','published')),
  version      integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  author_id    uuid NOT NULL REFERENCES users(id),
  reviewer_id  uuid REFERENCES users(id),
  published_at timestamptz,
  is_demo      boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
               CHECK (status <> 'published' OR published_at IS NOT NULL),
               -- type/category 合法配对（25 项映射 + 学生会）
               CHECK ((type, category) IN (
                 ('school','overview'),('school','head_message'),('school','mission'),
                 ('school','history'),('school','faculty'),('school','partnerships'),
                 ('academics','overview'),('academics','foundation'),('academics','ap'),
                 ('academics','alevel'),('academics','subjects'),('academics','calendar'),
                 ('outcomes','counseling'),('outcomes','outcomes'),
                 ('admissions','why_us'),('admissions','application'),('admissions','requirements'),
                 ('admissions','fees'),('admissions','faq'),('admissions','consultation'),
                 ('campus','clubs'),('campus','boarding'),('campus','facilities'),
                 ('news','updates'),('contact','contact'),('student_union','overview')
               ))
);
CREATE INDEX idx_contents_public ON contents(type, status, published_at DESC);
CREATE INDEX idx_contents_author ON contents(author_id, status);
CREATE INDEX idx_contents_news   ON contents(status, published_at DESC, id DESC);

-- 3.4 修订快照
CREATE TABLE content_revisions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id uuid NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  version    integer NOT NULL,
  snapshot   jsonb NOT NULL,                           -- 变更后全字段；不含执行性内容
  actor_id   uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_id, version)
);
CREATE INDEX idx_revisions_content ON content_revisions(content_id, version DESC);

-- 3.5 审计（只追加）
CREATE TABLE audit_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid REFERENCES users(id),               -- 可空：匿名/登录失败场景
  action      text NOT NULL,                           -- 见 6.5 动作注册表
  target_type text NOT NULL,
  target_id   text,
  request_id  text NOT NULL,
  result      text NOT NULL CHECK (result IN ('success','failure','denied')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_created ON audit_events(created_at DESC);
CREATE INDEX idx_audit_target  ON audit_events(target_type, target_id);
-- 追加-only：应用数据库账号回收 UPDATE/DELETE 权限（迁移内 GRANT/REVOKE）

-- 3.6 测试咨询（仅测试环境数据）
CREATE TABLE inquiries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         text NOT NULL CHECK (kind IN ('consultation','visit')),
  test_name    varchar(40)  NOT NULL CHECK (char_length(btrim(test_name)) BETWEEN 1 AND 40),
  test_contact varchar(100) NOT NULL,
  message      varchar(500),
  status       text NOT NULL DEFAULT 'new' CHECK (status IN ('new','viewed')),  -- v1 最小值；扩展须改契约
  is_test      boolean NOT NULL DEFAULT true CHECK (is_test),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_inquiries_created ON inquiries(created_at DESC);

-- 3.7 幂等键
CREATE TABLE idempotency_keys (
  scope        text NOT NULL,                          -- 如 'inquiry:staging'
  key          uuid NOT NULL,
  request_hash text NOT NULL,                          -- SHA-256(规范化请求)
  result_ref   uuid,                                   -- inquiries.id
  expires_at   timestamptz NOT NULL,                   -- 建议 24h
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, key)
);
```

## 4. API 端点规格（逐端点）

> 通用：JSON + UTF-8；除注明外均需认证；错误码见第 2 节；"审计"列仅列主要事件。

### 4.1 公开端（匿名）

**GET `/v1/public/contents`** — 已发布内容列表
- 查询：`type`（8 枚举，可选）、`category`（可选，需与 type 配对合法）、`page`、`pageSize`；非法组合 → 400
- 成功：`data: [{id,type,category,title,summary,body,publishedAt,isDemo}]`（安全字段白名单，绝不含 author/reviewer/status 等内部字段）+ `meta`
- 副作用：无审计；日志记路径模板与耗时

**GET `/v1/public/contents/{id}`** — 已发布详情
- 成功：单条安全字段；非 published / 不存在 → 404 NOT_FOUND（统一策略）
- 测试：AX-104/105

**POST `/v1/public/test-inquiries`** — 测试咨询（规格见 A-04；限流 5/min/IP）

### 4.2 认证与会话

**POST `/v1/admin/sessions`** — 登录
- 请求：`{username, password}`（长度上限 100/200，防大包）；限流：IP 5/min + 用户名 5/min
- 成功：200 `{data:{id,username,roles,environment}}` + Set-Cookie（HttpOnly; SameSite=Lax; Path=/；staging/prod 加 Secure）+ CSRF token（按第 1 天方案）
- 失败：401 AUTH_FAILED（用户不存在/密码错/停用统一响应；停用仅审计区分）；审计 auth.login.success/failure
- **密码或 token 不得出现在任何日志/审计/响应**

**GET `/v1/admin/me`** — 当前身份
- 成功：同登录 data；无有效会话 → 401

**DELETE `/v1/admin/sessions/current`** — 注销
- 成功：204 或 200；服务端置 `revoked_at`，cookie 失效；审计 auth.logout

### 4.3 内容管理

**GET `/v1/admin/contents`** — 列表（editor/reviewer/admin）
- 查询：`type`、`category`、`status`、`page`、`pageSize`；editor 仅见自己为 author 的内容，reviewer/admin 见全部
- 成功：字段含内部字段（status、version、authorId、reviewerId、publishedAt、updatedAt）

**POST `/v1/admin/contents`** — 创建草稿（editor/admin）
- 请求白名单：`{type,category,title,summary?,body?,isDemo}`；未知字段 → 400
- 服务端强制：authorId=当前用户、status=draft、version=1；body 允许空（暂存），但后续送审校验
- 成功：201 `{data:{id,version,status,...}}`；审计 content.create

**GET `/v1/admin/contents/{id}`** — 详情（有权角色，权限矩阵同列表）

**PATCH `/v1/admin/contents/{id}`** — 更新草稿（作者或 admin，仅 draft 态）
- 请求：白名单字段 + `version`；`UPDATE … WHERE id=$1 AND version=$2`，0 行 → 404（不存在）或 409 VERSION_CONFLICT（回传服务端当前 version）
- 同事务：version+1、写 revision、审计 content.update

**GET `/v1/admin/contents/{id}/revisions`** — 修订历史（editor 看自己的 / reviewer/admin），分页，按 version 倒序

**POST `/v1/admin/contents/{id}/submit|approve|reject|publish|unpublish`** — 状态动作
- 公共：请求体 `{version}`（reject 另带 `reason` 1–500）；转换合法性见 5.2 状态机；reviewer≠author 按 user_roles 全量判断
- 成功：200 返回新 status+version；审计 content.<action>
- 失败：400（送审内容不完整/reason 缺失）、403（角色/自审）、409（version/非法跳转）

### 4.4 咨询与审计（管理端）

**GET `/v1/admin/inquiries`、`GET `/v1/admin/inquiries/{id}`** — 仅 admissions/admin；分页/筛选 `kind`、`from`、`to`；审计 inquiry.read（记列表与详情两种 target）

**GET `/v1/admin/audit-events`** — 仅 admin；筛选 `action`、`from`、`to`；分页；不含任何请求正文

### 4.5 探针

**GET `/health/live`**：进程存活，无依赖检查，恒 200 最小 JSON。
**GET `/health/ready`**：检查 DB 连接（`SELECT 1` 超时 2s）；失败 503 + 最小信息（不泄露连接串/主机）。

## 5. 关键流程时序

### 5.1 登录与会话恢复

1. C 提交 username/password → 中间件：requestId → bodyLimit → 限流（IP+用户名）
2. 查 users（active）→ Argon2id verify（不存在用户也执行一次等代价哈希，防时序枚举）
3. 失败：401 AUTH_FAILED + 审计 auth.login.failure（含 IP）→ 结束
4. 成功：生成 256-bit token → INSERT sessions（hash、TTL 空闲 2h/绝对 12h 建议值）→ 审计 success
5. 响应 Set-Cookie + CSRF token；此后每个写请求校验会话四条件（存在/未过期/未撤销/用户 active）

### 5.2 内容生命周期（一次事务 = 状态+version+revision+audit，任一失败全回滚）

```text
draft --submit(作者/admin, 校验title/body)--> pending_review
pending_review --approve(非作者 reviewer/admin)--> approved
pending_review --reject(非作者, reason必填)--> draft
approved --publish(非作者 reviewer/admin, published_at=now)--> published
published --unpublish(非作者, published_at=NULL)--> draft
其余一切跳转 → 409 INVALID_TRANSITION；version 不匹配 → 409 VERSION_CONFLICT
```

### 5.3 幂等咨询提交（算法步骤）

1. 生产环境 → 直接 404（先于一切检查）；`INQUIRY_ENABLED=false` → 404
2. 校验 `Idempotency-Key` 为 UUID v4 → 否则 400
3. DTO 校验（kind/testName/testContact/message/isTest，见 A-04）→ 400 details
4. `request_hash = SHA-256(canonical_json)`：键字典序、值去空白
5. 事务：`INSERT idempotency_keys` → 唯一冲突则读旧行：
   - 哈希同且未过期 → 返回首次结果 + 头 `Idempotent-Replay: true`
   - 哈希同已过期 → 删旧行重插（新结果）
   - 哈希异 → 409 IDEMPOTENCY_CONFLICT
6. 同事务 INSERT inquiries，result_ref=inquiry.id；响应 201 `{data:{id,createdAt}}`

### 5.4 版本冲突（双编辑场景）

editor1 与 editor2 同读 v3 → editor1 PATCH 成功（version→4，revision+audit 落库）→ editor2 PATCH 携带 v3 → 0 行命中且记录存在 → 409 VERSION_CONFLICT，details 含服务端当前 version=4 → C 弹冲突框（保留输入，不覆盖）。

## 6. 横切规格

### 6.1 中间件管线（顺序固定，框架层统一挂载）

| 序 | 层 | 职责 | 失败模式 |
| --- | --- | --- | --- |
| 1 | requestId | 生成/透传，绑定 async 上下文 | — |
| 2 | bodyLimit | 100KB 上限 | 400 |
| 3 | rateLimit | 按端点维度查表执行 | 429 |
| 4 | session | cookie → 会话四条件校验 | 401（公开端跳过） |
| 5 | rbac | 端点×角色矩阵查表 | 403 + 审计 authz.denied |
| 6 | handler | 对象级校验（归属/状态/version）+ 业务 + 事务 | 按业务码 |

### 6.2 限流规格（建议值；单实例内存滑窗，多实例需 Redis——README 声明当前边界）

| 端点 | 维度 | 阈值 | 响应 |
| --- | --- | --- | --- |
| POST /v1/admin/sessions | IP、用户名 | 各 5/min | 429 |
| POST /v1/public/test-inquiries | IP | 5/min | 429 |
| 其余 /v1/* | IP | 120/min | 429 |

### 6.3 会话与 Cookie

token 256-bit 随机，仅存 SHA-256；TTL 空闲 2h、绝对 12h（配置化）；每次通过校验可滑动续期空闲 TTL；注销/停用/改密 → 撤销该用户全部会话；cookie `HttpOnly; SameSite=Lax; Path=/`，staging/production 加 `Secure`；CSRF 方案第 1 天二选一并给 C 示例：双提交 token（推荐）或 Origin 白名单校验。

### 6.4 日志 schema（pino JSON）

字段：`time, level, service, requestId, route(路径模板), status, durationMs, env`；可选 `userId`（认证后）。**脱敏清单（任何级别不得出现）**：password、cookie、token、Authorization、testName/testContact/message、DATABASE_URL、完整请求体。CI 加日志脱敏抽检（AX-601）。

### 6.5 审计动作注册表

`auth.login.success / auth.login.failure / auth.logout / authz.denied / content.create / content.update / content.submit / content.approve / content.reject / content.publish / content.unpublish / inquiry.read`。字段与追加约束见 3.5；扩展动作须先改契约。

### 6.6 配置注册表（.env.example，全部无效占位）

`NODE_ENV / PORT / DATABASE_URL / SESSION_SECRET(≥32B) / CORS_ORIGIN(精确白名单) / INQUIRY_ENABLED / SESSION_IDLE_TTL_MIN / SESSION_ABSOLUTE_TTL_MIN / RATE_LIMIT_LOGIN / RATE_LIMIT_API / INQUIRY_IDEMPOTENCY_TTL_H / LOG_LEVEL`。启动 zod 校验，缺失 → 退出并报变量名（不打印值）。

## A-01 单仓库与可复现环境 P0

**目标：**任何人克隆后 15 分钟内跑起完整后端，不依赖个人路径、真实密钥、手工修库。

**第 1 天上午敲定并广播（写入 README"技术决策"节）：**

| 决策项 | 建议默认 | 决策项 | 建议默认 |
| --- | --- | --- | --- |
| Node | 当前 LTS | 密码哈希 | Argon2id（或 bcrypt≥12） |
| 包管理 | pnpm workspace | 会话 | 服务端会话+HttpOnly cookie |
| API 框架 | NestJS 或团队最熟 TS 框架 | CSRF | 双提交 token（推荐） |
| 迁移工具 | node-pg-migrate / Knex / Drizzle | 日志 | pino |
| 测试 | vitest + supertest | lint | ESLint+Prettier 仓库级 |

**实施步骤：**

1. **仓库骨架**：`apps/{api,miniapp,admin}`、`packages/contracts`、`infra`、`docs`，各放 README 注明责任人。
2. **统一脚本**：根 `dev/build/lint/typecheck/test`；api 另有 `migrate / seed:local / seed:staging`；全部从仓库根可执行。
3. **Compose**：postgres 固定小版本；端口 `127.0.0.1:5432:5432`；healthcheck `pg_isready`；api `depends_on: service_healthy`；非 root；命名卷支持一键清空。
4. **迁移与种子**：命名 `V<时间戳>__<描述>.sql` 只前向；种子仅 local/staging 且显式命令，生产硬拒绝；种子清单：4 角色各 1 合成账号（密码脚本随机生成、仅控制台打印一次）、8 个 type 各 ≥1 篇已发布合成文章、news ≥3 条、inquiries ≥2 条。
5. **可观测性地基**：requestId、结构化日志（6.4）、统一错误映射（第 2 节）、双探针（4.5）。
6. **Git 基线**：`.gitignore`（node_modules/dist/.env*/log/备份）；分支 `feat/a-*`；第 1 天 Draft PR；建议开启默认分支保护。
7. **README**：系统要求、快速启动序列、迁移种子说明、测试账号生成、三端目录、FAQ（端口占用/连库失败/迁移失败）。

**当日交付 B/C：**OpenAPI v1 初稿（含 3 组完整示例：登录成败、建稿→PATCH→submit 含 409、咨询成功+重放+409）、mock 启动方式、种子账号获取方式、environment 字段说明。

**自测清单：**

- [ ] 干净目录克隆 → compose up → install → migrate+seed → `/health/ready` 200，一次成功
- [ ] 删数据卷后重复上一条仍成功（AX-002）
- [ ] 删任一必需环境变量：启动失败、报变量名、不打印值（AX-003）
- [ ] 仓库 grep 无真实连接串/密钥；.env 未被提交（AX-004）

**验收：**E01/E03/E06；B、C 各自在干净环境执行一次并回贴命令与输出。

## A-02 数据模型、迁移和内容服务 P0

**目标：**第 3 节 DDL 全部落地为迁移；内容 CRUD、公开查询、乐观锁与状态机按第 4/5 节实现。

**步骤：**

1. 按第 3 节建 8 表迁移；每个约束在 PR 写理由；迁移可重跑；空库+有数据双场景测试（CI 固化，AX-005）。
2. 校验层：DTO schema 白名单 + `.strict()` 拒绝未知字段；长度常量集中（title 1–120 去 whitespace、summary 0–300、body 0–20000、送审时 body 1–20000、reason 1–500）并与 OpenAPI 同步生成。
3. 公开 API 按 4.1 实现：仅 published、安全字段白名单、分页排序契约、404 统一策略。
4. 后台 CRUD 按 4.3：authorId/version/status 服务端强制；PATCH 白名单（title/summary/body/type/category/isDemo）+ 乐观锁语义（5.4）。
5. 状态机按 5.2：转换表驱动（代码中显式矩阵，不用 if 链散落）；approve 写 reviewer_id；每转换一个事务（status+version+revision+audit）。
6. 内容安全：P0 正文纯文本存储输出（保留换行）；如做结构化只允许白名单键的段落 JSON；恶意用例入库-读取-展示全链路不执行（AX-206）。
7. revisions 端点：分页、version 倒序、权限矩阵同列表。

**自动化测试：**见第 7 节 AX-101～AX-206。

**验收：**E02/E04、F02/F03/F07；迁移双场景通过；公开端对草稿 404。

## A-03 认证、会话、授权和审计 P0

**步骤：**

1. 登录按 5.1：等代价哈希防时序枚举、统一 401、双维限流、审计成败。
2. 会话按 6.3：token 生成/哈希/TTL/续期/撤销；停用账号同事务撤销全部会话；`/me` 返回 id/username/roles/environment。
3. CSRF 按 6.3 选定方案实现并给 C 可复制示例（含错误码约定：缺 token → 403，code=`CSRF_INVALID` 可并入注册表）。
4. 管线按 6.1 顺序挂载；RBAC 用"端点×角色"配置表驱动，测试直接遍历该表（AX-301 网格）；对象级校验在 handler：归属（author）、状态、version。
5. 审计按 6.5：动作枚举、追加 only（REVOKE UPDATE/DELETE）、admin 分页接口带筛选。
6. OpenAPI 定稿：全部端点含 4.x 规格的成功/失败响应、认证方式、CSRF 说明；类型生成命令交付 B/C；此后接口变更必须同 PR 更新契约并通知（CI 校验一致性，E04）。

**验收：**S01–S05、S07；四角色+匿名全端点网格自动通过；手测留 curl 脚本入库 `infra/`。

## A-04 测试咨询端到端 P0

**步骤：**

1. 硬开关：handler 首行判 `NODE_ENV==='production'` → 404（不看任何变量）；再判 `INQUIRY_ENABLED`。CI 固化"生产配置 404"用例（AX-408）。
2. 校验：kind 枚举、testName 1–40、testContact 1–100、message 0–500、`isTest===true`（否则 400）、未知字段拒绝；通过后才进幂等。
3. 幂等按 5.3 六步实现；TTL 默认 24h（`INQUIRY_IDEMPOTENCY_TTL_H`）；过期清理首周手动（文档写明），P1 定时任务。
4. 限流按 6.2；招办读取按 4.4（审计 inquiry.read，日志零正文）。
5. 联调包 `packages/contracts/examples/inquiry/`：成功/各 400/409/429/404 完整响应、重试语义、清理 SQL（仅 local）。

**验收：**S06 全矩阵 + AX-401～410；响应与契约逐字段一致（E04）。

## A-05 CI、部署、恢复和接口联调 P0

**步骤：**

1. **CI（GitHub Actions，PR+main；禁止 continue-on-error）：**
   | Job | 内容 |
   | --- | --- |
   | install | pnpm install --frozen-lockfile |
   | quality | 三端 lint+typecheck |
   | unit | vitest |
   | integration | postgres service → 空库迁移 → 种子 → 集成测试 → 二次迁移模拟升级 |
   | build | api/admin/miniapp 三端构建（miniapp 产物供人工导入） |
   微信工具无法进 CI：README 声明，以 B 手测记录为准（版本+截图），不冒充。
2. **镜像与部署**：多阶段 Dockerfile、非 root、tini、HEALTHCHECK→/health/ready；`infra/nginx.conf.example`：TLS、HSTS、最小 CSP、nosniff、body 限、超时；DB 永不公网；密钥环境注入不进镜像层；测试环境部署一次留命令记录。
3. **回滚演练**（D6，步骤留档）：记录当前 tag → 部署新版 → 注入一个已知问题 → 按文档回滚旧 tag → 健康恢复 → 记录"数据库不降级"的前向修复说明与总耗时。
4. **备份恢复演练**：`pg_dump -Fc` 合成库 → 独立临时库 `pg_restore` → 核对表数/行数/抽样内容与状态 → 记录备份耗时、恢复耗时、文件权限、操作者；绝不覆盖原库。
5. **性能基线**：autocannon/k6，场景=公开列表（type=news）与详情各 50 并发×60s、种子 200 条；记录 p50/p95/错误率/环境/工具版本；只报实测不设虚构 SLA。
6. **联调节点**：D3 内容链路（与 B/C 全流程留证）；D4 咨询链路（含一次重复提交）；D5 缺陷清理+冻结 P0。
7. **D6/D7 交付**：固定 commit 全套验证；数据字典（3 节 DDL+理由）、配置注册表、部署/回滚/备份文档、日志指标说明、缺陷表、上线门槛状态表（逐项未完成/阻塞，不虚报）。

**验收：**E03/E04/E05、O01/O02/O03；停库时 ready 立即不可用、恢复自愈（AX-505）。

## 7. 测试用例注册表（AX 系列）

> 执行规则见 `docs/测试与验收用例.md`：每条记录 commit/环境/结果/证据；全部 P0 通过才可声明阶段完成。

| ID | 前置与步骤 | 预期 | 映射 |
| --- | --- | --- | --- |
| AX-001 | 干净环境按 README 启动全套 | 一次成功，ready 200 | E01 |
| AX-002 | 删数据卷后重复搭建 | 可重复，数据一致 | E01 |
| AX-003 | 删除任一必需环境变量启动 | 退出+报变量名，无值泄漏 | E06 |
| AX-004 | 扫描仓库/日志/测试输出 | 无密钥/真实个人信息/连接串 | E06 |
| AX-005 | 空库迁移→种子→二次迁移 | schema/数据一致，无手工修库 | E02 |
| AX-101 | 公开列表空库 | 200 `data:[]` | F07 |
| AX-102 | pageSize=101 / page=0 / 非数字 | 400 VALIDATION_FAILED | F07 |
| AX-103 | type=news 列表排序 | publishedAt desc, id desc 稳定 | F07 |
| AX-104 | 详情查草稿/已下架/随机 UUID | 404 | F02/F05 |
| AX-105 | 已发布详情字段 | 仅安全字段白名单 | E04 |
| AX-106 | type/category 非法配对创建 | 400（CHECK+应用层双拦） | F07 |
| AX-201 | 创建草稿带 authorId/version/status 伪造字段 | 忽略或 400，服务端强制 | S02 |
| AX-202 | PATCH 白名单外字段 | 400 拒绝 | F07 |
| AX-203 | 非作者 editor PATCH 他人草稿 | 403 | S02 |
| AX-204 | 双编辑并发 PATCH 同 version | 后者 409，回传当前 version | F06 |
| AX-205 | 状态机全枚举非法跳转（draft→publish 等 12 组） | 409 INVALID_TRANSITION | S03 |
| AX-206 | 恶意输入（script/onerror/javascript:）存储读取展示 | 不执行、不破坏存储 | S04 |
| AX-207 | reject 缺 reason / reason 501 字 | 400 | F04 |
| AX-208 | 每次转换后查 revisions/audit_events | 同事务落库，原子 | F03 |
| AX-301 | 4 角色+匿名 × 全端点网格（配置表驱动） | 越权格全 403/401，数据未变 | S02 |
| AX-302 | reviewer/admin/双角色审核自己的稿 | 403 SELF_REVIEW_FORBIDDEN | S03 |
| AX-303 | 登录错误 10 次 | 第 6 次 429；审计有记录 | S04 |
| AX-304 | 过期/撤销/停用会话调用 | 401 | S01 |
| AX-305 | 无 CSRF token 写请求 | 403 | S05 |
| AX-306 | me 响应字段 | id/username/roles/environment，无敏感 | E04 |
| AX-307 | 审计接口非 admin | 403 | S07 |
| AX-401 | 咨询字段逐项越界（空/超长/kind 非法/未知字段） | 400，不入库 | S06 |
| AX-402 | isTest=false 或缺失 | 400 | S06 |
| AX-403 | Idempotency-Key 非 UUID | 400 | S06 |
| AX-404 | 并发 10 同 key 同内容 | 库中 1 条；其余 200+Replay 头 | S06 |
| AX-405 | 同 key 不同内容 | 409，原记录不变 | S06 |
| AX-406 | editor/reviewer 读咨询 | 403 | S06 |
| AX-407 | 日志/审计检索 testName/testContact/message | 零命中 | S06 |
| AX-408 | production 配置提交咨询 | 404 | S06 |
| AX-501 | CI 全链路 | 绿，无跳过 | E03 |
| AX-502 | 备份→独立库恢复核对 | 行数/状态一致，记录完整 | O02 |
| AX-503 | 回滚演练 | 恢复旧版，记录耗时 | O01 |
| AX-504 | 性能基线报告 | p50/p95/错误率实测值 | O03 |
| AX-505 | 停库→ready→恢复库 | 503→200 自愈，无栈泄漏 | E05 |

## 8. 风险登记表（A 侧）

| # | 风险 | 影响 | 概率 | 缓解 | 触发信号 |
| --- | --- | --- | --- | --- | --- |
| R1 | 契约第 2 天后仍反复变更 | B/C 返工、联调失败 | 中 | 第 1 天冻结 v1；变更走 PR+兼容说明 | 单日契约 diff >2 处 |
| R2 | 迁移设计缺陷中期返工 | 数据重建、进度损失 | 中 | DDL 先评审再实现；CI 双场景迁移 | 迁移文件被修改而非新增 |
| R3 | 会话/CSRF 实现安全缺陷 | 越权、会话劫持 | 低 | 用成熟库；S01–S05 全自动化；交叉评审 | 安全用例任一失败 |
| R4 | P0 时间不足 | 范围挤压、伪完成 | 高 | 工时预算超 20% 即上报；砍 P1 不砍验收 | D4 晚 P0 完成度 <70% |
| R5 | 密钥/真实数据误提交 | 泄漏事故 | 低 | .gitignore+CI 扫描（AX-004）；预提交自查 | 扫描告警 |
| R6 | 网络环境受限（依赖拉取/GitHub） | 环境不可复现 | 中 | 锁文件+国内镜像源写 README；依赖最小化 | install 失败 |

## 9. 日程与交付节点

| 日 | 必交内容 | 当日必须广播给 B/C | 预算 |
| --- | --- | --- | --- |
| 1 | 骨架、可运行 API+DB、OpenAPI v1、DDL 与状态机草图、mock | 契约冻结通知、mock 地址、种子账号获取 | 8h |
| 2 | 会话、RBAC、迁移、内容 CRUD 与公开查询 | 真实 API 地址、CSRF 示例、类型生成命令 | 8h |
| 3 | 状态机全套、revisions、审计、并发校验 | 状态机实测结果、revisions 可用性 | 8h |
| 4 | 咨询幂等、限流、日志脱敏、CI 初版 | 咨询联调包、限流参数 | 8h |
| 5 | 集成测试、容器/部署、备份恢复、P0 缺陷清理 | 冻结功能清单与已知缺陷 | 8h |
| 6 | 回滚演练、安全矩阵、性能基线、回归修复 | 压测与演练结果 | 8h |
| 7 | 干净环境复现、定 commit、全部交付文档 | 最终版本号与交付物索引 | 8h |

## 10. PR 提交清单

- [ ] 关联 Issue、工作包、环境；列接口差异、权限变化、迁移及回滚计划
- [ ] 状态机/越权/自审/并发/幂等/校验自动测试与真实输出；无秘密
- [ ] OpenAPI 同步更新；类型重新生成并通知 B/C
- [ ] 与 B/C 联调记录、CI 链接、部署/恢复证据；未验证部分明示
- [ ] 另一成员评审；交付文档、问题、负责人齐备

## 11. 可复制给 AI

> 你负责本仓库 A 后端和平台。先完整阅读 README、docs/ 下全部文档与 tasks/A-工程与集成.md（执行级 v3），检查 Git 状态、代码、开放 PR 与依赖。严格按任务书实现：第 3 节参考 DDL 建迁移、第 2 节错误码注册表、第 4 节逐端点规格、第 5 节流程时序（登录等代价哈希、状态机转换表驱动、幂等六步算法）、第 6 节横切规格（中间件顺序、限流表、会话 TTL、日志脱敏清单、审计动作注册表）。默认参数集中为常量并配置化。第 7 节 AX 用例全部自动化并在 PR 展示真实输出。保护他人更改与秘密，只用合成数据。禁止臆称安全、合规、生产就绪或已验收；阻塞如实上报。准备 PR 与评审。

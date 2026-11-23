# C 企业级任务书 Web 管理后台与内容运营（执行级 v3）

> **修订说明**：v3 在 v2 基础上补充：路由注册表（含守卫矩阵）、请求客户端规格、状态管理规格、页面级规格（登录/列表/编辑器/动作/弹窗逐项）、测试用例注册表（CX 系列）、工时预算与风险登记表。权限永远由 A 的服务端裁决；后台只做正确展示、隐藏不可用操作、翻译错误。字段/长度/错误码事实源为 `docs/系统架构与数据契约.md`（含 6.1 错误码注册表）与 OpenAPI。

## 目录

- 0 角色与交付（含工时预算）
- 1 全局工程约定
- 2 路由注册表与守卫矩阵
- 3 请求客户端规格
- 4 状态管理规格（Pinia stores）
- 5 页面级规格（登录/布局/内容列表/编辑器/动作/咨询/审计）
- 6 弹窗与确认框规格
- 7 组件规格
- C-01 工程、布局、认证
- C-02 内容列表与编辑
- C-03 审核、发布、下架与可追溯
- C-04 测试咨询管理
- C-05 内容录入与管理说明
- 8 测试用例注册表（CX 系列）
- 9 风险登记表
- 10 日程与交付节点
- 11 PR 与验收清单
- 12 可复制给 AI

## 0. 角色与交付

你负责 Web 管理后台的可用性、内容编辑与审核流程、合成咨询查看、审计界面和后台测试；A 负责 API 的鉴权和实际数据写入，B 负责小程序。先读 README、[工程约定](../docs/共同约定.md)、[架构/API](../docs/系统架构与数据契约.md)、[安全运维](../docs/安全部署与运维.md)、[测试验收](../docs/测试与验收用例.md) 和 A 的任务书第 2 节（错误码注册表）。默认 Vue 3 + TypeScript + Vite，实际以第 1 天团队约定为准。

**阶段结果（逐项可勾选，全部有证据才算达成）：**

- [ ] 登录/注销/会话过期/角色入口全部正确，401 与 403 界面可区分
- [ ] editor 与独立 reviewer 在真实测试 API 上完成"建稿→送审→审核→发布→下架"全流程（F03–F05）
- [ ] 并发 409 冲突不丢输入、不静默覆盖（F06）
- [ ] admissions/admin 可见合成咨询，editor/reviewer 页面与 API 双重被拒（S02）
- [ ] admin 审计列表与实际操作对账一致（S07）
- [ ] 非开发人员按操作手册独立完成发布流程（手册用合成截图）
- [ ] 1366/1920 双宽度、组件测试与错误 mock 测试证据齐备

**工时预算（7 天 × 6–8h，总计 42–56h；超支 20% 即向负责人报告）：**

| 工作包 | 预算 | 主要产出 |
| --- | --- | --- |
| C-01 工程/布局/认证 | 8h | 工程、client、stores、布局、登录 |
| C-02 内容列表与编辑 | 10h | 列表筛选、编辑器、409 弹窗 |
| C-03 审核发布下架 | 8h | 动作矩阵、确认框、修订、审计页 |
| C-04 咨询管理 | 4h | 列表/详情、权限清理 |
| C-05 手册/映射/测试 | 8h | 操作手册、组件测试、端到端 |
| 联调/回归/缓冲 | 8h | 三次跨端联调、D7 复测 |

## 1. 全局工程约定

1. **技术栈**：Vite + Vue 3 `<script setup>` + TS + vue-router + Pinia + vitest + @vue/test-utils；ESLint/Prettier 用仓库共享配置。目录：`src/api`、`src/stores`、`src/router`、`src/pages`、`src/components`、`src/composables`。
2. **浏览器目标**：Chrome/Edge 最近两个大版本（README 写明）；1366px 为最小适配宽度、1920px 限宽布局。
3. **环境注入**：`VITE_API_BASE_URL` 精确可信地址；不硬编码账号密码令牌；顶栏常显当前用户名、角色标签、环境标识"测试环境·合成数据"。
4. **类型来源**：`packages/contracts` 生成的 TS 类型；契约变更重新生成并同步。
5. **安全纪律**：会话 cookie 由服务端管理（HttpOnly，JS 不可读）；Pinia 只存非敏感用户资料（id/username/roles/environment）；不在 localStorage 存任何令牌。

## 2. 路由注册表与守卫矩阵

| 路径 | name | 可见角色 | 说明 |
| --- | --- | --- | --- |
| /login | login | 未登录 | 已登录访问 → 重定向 /contents |
| /contents | contents | editor, reviewer, admin | 内容列表 |
| /contents/new | contentNew | editor, admin | 新建草稿 |
| /contents/:id | contentEdit | editor(仅自己)/admin | 编辑器（reviewer 不进编辑） |
| /contents/:id/history | contentHistory | editor(仅自己)/reviewer/admin | 修订历史 |
| /inquiries | inquiries | admissions, admin | 测试咨询 |
| /audit | audit | admin | 审计列表 |
| /403 | forbidden | 登录用户 | 无权限页 |
| /404 | notFound | — | 未知路由 |

守卫行为（`router.beforeEach`，**展示级拦截，服务端是最终裁决**）：

1. `sessionStore.status === 'unknown'` → 先等 `restore()` 完成再放行
2. 未认证访问受保护路由 → 重定向 `/login?redirect=<原路径>`
3. 已认证但角色不在 meta 列表 → 渲染 /403
4. `/contents/:id` 的 editor 归属校验（仅自己）依赖 API 数据，守卫只拦"角色"，归属冲突交给服务端 403 + 页面解释

## 3. 请求客户端规格（`src/api/client.ts`，全项目唯一出口）

```ts
// 统一响应解析：{data, meta?, requestId} → 直接返回 data；错误 → 抛 ApiError
interface ApiError { code: string; httpStatus: number; details?: FieldError[]; requestId?: string }
// 写方法自动携带 X-CSRF-Token（token 来源与刷新按 A 第 1 天方案；CSRF 失效 → 强制重新登录流程）
// withCredentials: true；超时 15s；无自动重试（写防重复；GET 网络错误可手动重试按钮）
```

**状态码统一分派表（所有页面共用，禁止各自 try/catch 出不同文案）：**

| 错误 | 全局处理 | 页面可覆盖 |
| --- | --- | --- |
| 401 UNAUTHENTICATED | 清 session store → redirect /login（登录页内不循环跳转） | — |
| 401 AUTH_FAILED（仅登录页） | 登录页内提示"用户名或密码错误" | 登录页 |
| 403 FORBIDDEN | 提示无权限，保留数据 | 详情页可展示"归属受限"说明 |
| 403 SELF_REVIEW_FORBIDDEN | 提示"不能审核自己提交的内容" | — |
| 409 VERSION_CONFLICT | 触发冲突对话框（第 6 节） | — |
| 409 INVALID_TRANSITION | 刷新详情 + 解释当前状态 | — |
| 409 IDEMPOTENCY_CONFLICT | 提示刷新重新提交 | — |
| 400 VALIDATION_FAILED | 按字段回显 details | 表单页 |
| 429 RATE_LIMITED | "操作过于频繁，请稍后再试" | — |
| ≥500 | "服务异常"+requestId 小字 | — |

## 4. 状态管理规格（Pinia stores）

| store | state | actions | 清理时机 |
| --- | --- | --- | --- |
| sessionStore | `{user?: {id,username,roles,environment}, status: 'unknown'\|'authenticated'\|'guest'}` | login(), restore(), logout() | 401/注销/切换账号 |
| dictStore | `types[8]`、`categories[25+1]`（与 25 项映射同步的常量） | 初始化一次 | 不清理（常量） |
| uiStore | 全局 toast/确认框状态、当前环境标识 | — | — |

规则：任何页面退出/切换账号时，本页缓存的数据随组件销毁；咨询相关数据不进 store 持久层；列表筛选参数可进 URL query（便于分享与回退），**咨询详情内容不得进 URL**。

## 5. 页面级规格

### 5.1 登录页（/login）

- 字段：用户名、密码（密码框带可见性切换）；提交中禁用按钮+loading
- 失败：401 AUTH_FAILED →"用户名或密码错误"（不区分是哪种）；429 → 稍后再试；≥500 → requestId
- 成功：`sessionStore.login()` → redirect 参数回跳（无参数 → /contents）
- 页面加载时如已有有效会话 → 直接跳 /contents

### 5.2 主布局

- 侧栏入口按角色矩阵渲染（editor/reviewer/admin 见内容；admissions/admin 见咨询；仅 admin 见审计；无内容权限的角色不显示内容入口）
- 顶栏：面包屑、用户名、角色标签、环境角标、退出按钮
- 内容区：1366px 无横向滚动；1920px 内容区最大限宽 1440px 居中

### 5.3 内容列表（/contents）

| 项 | 规格 |
| --- | --- |
| 筛选 | type 下拉（8 项中文）、category 级联下拉（25 项映射+学生会，随 type 过滤）、status 下拉（4 态中文）、更新时间区间；**API 未支持的筛选不放 UI**，登记契约变更请求 |
| 列 | 标题（截断+悬浮全称）、栏目（type/category 中文）、状态（StatusTag）、version、作者、更新时间、publishedAt、操作 |
| 分页 | page/pageSize 默认 20，显示 total |
| 行为 | 空/加载/错误三态；筛选变化重置到第 1 页；操作列按第 5.5 矩阵渲染 |
| editor 视角 | 列表默认过滤"我创建的"（依赖 API 行为；若 API 返回他人内容，前端不自行过滤，登记契约缺口） |

### 5.4 编辑器（/contents/new、/contents/:id）

| 字段 | 控件 | 必填 | 客户端校验 | 服务端错误码 |
| --- | --- | --- | --- | --- |
| type | 下拉 | 是 | — | VALIDATION_FAILED |
| category | 级联下拉 | 是 | 依 type | 同 |
| title | input + 计数 | 是 | trim 后 1–120 | 同 |
| summary | textarea + 计数 | 否 | ≤300 | 同 |
| body | textarea + 计数 | 送审必填 | ≤20000；草稿可空 | 送审时 400 |
| isDemo | switch，默认 true | — | — | — |

- 正文 P0 多行文本（保留换行预览），不引入富文本、不渲染 HTML
- 保存流程：新建 → POST（201 得 id+version）→ 之后 PATCH 带 version；保存中按钮禁用；成功后以服务端响应刷新本地 version；400 details 逐字段回显且**保留全部输入**
- 路由离开守卫：有未保存修改时确认框"放弃修改？"（离开/留下）
- 预览区：标注"未发布预览"，不生成任何公开链接
- 脏数据保护：同一 tab 内被路由跳走再回来，输入按离开守卫处理，不做静默保留

### 5.5 状态动作矩阵（列表与详情操作列的唯一依据；隐藏≠授权，服务端 403 仍按第 3 节解释）

| 当前状态 | 动作 | 可见角色 | 请求 | 成功后 |
| --- | --- | --- | --- | --- |
| draft 草稿 | 送审 | 作者、admin | POST submit {version} | 状态→待审核 |
| pending_review 待审核 | 通过 | reviewer、admin 且非作者 | POST approve {version} | 状态→已通过；显示审核人 |
| pending_review 待审核 | 驳回 | reviewer、admin 且非作者 | POST reject {version, reason} | 状态→草稿；作者可见驳回原因 |
| approved 已通过 | 发布 | reviewer、admin 且非作者 | POST publish {version} | 状态→已发布；显示 publishedAt |
| published 已发布 | 下架 | reviewer、admin | POST unpublish {version} | 状态→草稿 |

自审场景（作者同时是 reviewer/admin）：按钮不渲染；直接调用收到 SELF_REVIEW_FORBIDDEN 时按第 3 节文案解释。

### 5.6 修订历史（/contents/:id/history）

- API 可用（A 已交付 revisions）：表格列 version、操作者、时间、快照摘要；version 倒序分页
- API 未交付：显示"接口待提供"，登记契约缺口；**不编造历史**

### 5.7 审计列表（/audit，仅 admin）

- 列：时间、操作者（actor）、动作（action 中文映射表）、目标（type+id）、结果（success/failure/denied 中文+颜色）、requestId
- 筛选：动作下拉、时间区间；分页；数据与操作对账（S07）
- 只读，无编辑入口

### 5.8 测试咨询（/inquiries、详情抽屉）

- 页头固定角标"仅测试合成数据"
- 列表列：类型（咨询/参观）、testName、testContact、提交时间、状态（new/viewed 中文）
- 详情抽屉：全部字段含 message；只读——状态修改超出 v1 契约，**不放伪按钮**（若要做，先与 A 改契约）
- editor/reviewer 访问 → 守卫渲染 /403；API 层仍 403
- 不导出、不外发、正文不进日志/URL/错误监控；截屏只用虚构值

### 5.9 错误页（/403、/404）

- 403：说明"当前账号无此权限"，显示当前角色与环境标识；提供"返回列表"
- 404：未知路由兜底
- 两页均不可见任何已加载数据（切换账号后清空由 store 清理保证）

## 6. 弹窗与确认框规格

| 弹窗 | 触发 | 内容 | 按钮 | 行为要点 |
| --- | --- | --- | --- | --- |
| 冲突对话框（409 VERSION_CONFLICT） | 保存/动作返回 409 | "内容已被他人修改"；本地版本 vN、服务端最新 vM | 复制我的修改 / 加载最新版本 / 稍后处理 | **绝不静默覆盖**；关闭后本地输入仍在；"加载最新"须二次确认 |
| 驳回对话框 | 点击驳回 | reason textarea，必填，1–500 计数 | 提交（空/超长禁用）/ 取消 | 提交后状态回草稿；失败保留 reason |
| 发布确认框 | 点击发布 | 标题+版本+"发布后将在小程序与公开 API 可见" | 确认/取消 | 成功展示 publishedAt+id（可复制，供与 B 对账） |
| 下架确认框 | 点击下架 | 标题+"下架后公开端立即不可见" | 确认/取消 | 成功刷新状态 |
| 离开确认 | 编辑中切换路由 | "有未保存的修改" | 离开/留下 | 离开不保存 |

## 7. 组件规格（`src/components/`）

| 组件 | Props | 说明 |
| --- | --- | --- |
| StatusTag | status | draft→草稿（灰）/ pending_review→待审核（琥珀）/ approved→已通过（蓝）/ published→已发布（绿）；均带文字不只靠颜色 |
| ConfirmDialog | title/description/confirmText/danger? | Esc 关闭、确认键可达、危险操作红色 |
| FieldError | error | 红字字段级错误 |
| PageHeader | title/breadcrumb | 环境角标常显 |
| EmptyState / ErrorState | — | 列表页三态复用 |
| DataTableWrap | columns/rows/loading | 统一表格滚动与 1366px 不溢出 |

键盘可达性：主要操作 Tab 顺序合理；Enter 提交登录；Esc 关闭弹窗；弹窗内焦点圈定（focus trap）；表单 label 显式关联 input（`<label for>`）。

## C-01 工程、布局、认证 P0

按第 1/2/3/4/5.1/5.2/7 节实施；D1 用 A 的 mock 完成骨架与登录流程，D2 切真实 API。**验收：**登录成功/失败/过期/退出四态正确；401 与 403 界面可区分；四角色看到对应入口；刷新后 restore() 恢复会话（CX-001～104）。

## C-02 内容列表与编辑 P0

按第 5.3/5.4/6 节实施。**验收：**F02（建稿后台可见、匿名端不可见）、F06（并发 409 三按钮弹窗、不丢输入）、F07（脚本输入不在预览/列表执行）；"列表→编辑→保存→再打开"一致（CX-201～206）。

## C-03 审核、发布、下架与可追溯 P0

按第 5.5/5.6/5.7/6 节实施。**验收：**F03/F04/F05、S03 界面侧；审计与操作对账一致（CX-301～305、501）。

## C-04 测试咨询管理 P0

按第 5.8 节实施。**验收：**B 提交后 admissions/admin 可见；editor/reviewer 双重被拒；切换账号无残留；无导出/外发/日志泄漏（CX-401～403）。

## C-05 内容录入与管理说明 P0/P1

1. 与 B 共建 25 项映射（你主笔后台列：type/category、录入状态、负责人）；每天核对两端一致；先录合成示例并保持 isDemo=true。
2. `docs/后台操作手册.md` 章节固定：登录与退出 / 界面与环境标识 / 栏目对照表（type×category×栏目号） / 写草稿与保存 / 预览 / 送审 / 查看驳回原因并修改再送审 / 审核与发布（审核员） / 下架 / 常见问题与求助 / 账号与权限说明；全配合成数据截图。
3. 测试：组件测试（状态×角色按钮矩阵表格驱动、表单校验、冲突对话框）、API mock 错误测试（401/403/409/429/500 各≥1 例）、端到端（Playwright 或录屏：登录→建稿→送审→换号审核发布→下架）；1366/1920 双宽度检查表单、长文、表格滚动。
4. 第 5 天交叉评审 B 的页面与映射；请一位非开发同学按手册试走全流程。

## 8. 测试用例注册表（CX 系列）

| ID | 前置与步骤 | 预期 | 映射 |
| --- | --- | --- | --- |
| CX-001 | 干净构建，种子账号登录 | 成功进入列表 | E01 |
| CX-002 | 登录后刷新页面 | restore() 恢复会话与角色 | S01 |
| CX-101 | 错误密码 | 统一提示，不泄露原因 | S04 |
| CX-102 | 会话过期后操作 | 401 → 跳登录，redirect 回跳 | S01 |
| CX-103 | editor 直输 /audit | /403 页 + API 403 | S02 |
| CX-104 | 四角色侧栏矩阵 | 入口与角色一致 | S02 |
| CX-201 | 筛选 type→category 级联 | 数据源正确、重置分页 | F01 |
| CX-202 | 新建草稿伪造 authorId/status 字段 | 服务端忽略/拒绝，前端如实展示 | S02 |
| CX-203 | 逐字段越界提交 | 400 details 字段级回显，输入保留 | F07 |
| CX-204 | 保存后重新打开 | 数据一致，version 正确 | F02 |
| CX-205 | 双账号并发保存同版本 | 后者 409 → 冲突对话框三按钮，输入保留 | F06 |
| CX-206 | 标题含 `<script>alert(1)</script>` | 预览/列表不执行，显示原文 | F07 |
| CX-207 | 编辑中切路由 | 离开确认框出现 | — |
| CX-301 | editor 建稿→送审；换 reviewer 审核发布 | 全程状态/审计正确；小程序可见 | F03 |
| CX-302 | reviewer 驳回（缺 reason 禁用）；作者修改再送审 | 驳回原因可查，状态正确 | F04 |
| CX-303 | 作者即 reviewer：按钮隐藏；直接调 API | SELF_REVIEW_FORBIDDEN 文案正确 | S03 |
| CX-304 | 下架后查公开端 | 立即不可见；审计有记录 | F05 |
| CX-305 | 发布成功 | 显示 publishedAt+id，可复制 | F03 |
| CX-306 | 手工强制跳状态（直接 POST publish 草稿） | INVALID_TRANSITION 解释正确 | S03 |
| CX-401 | editor/reviewer 访问 /inquiries | /403 页；API 403 | S02 |
| CX-402 | admissions 登出再登 admin/editor | 无上一账号咨询数据残留 | S02 |
| CX-403 | 咨询操作全程检查 URL/日志 | 无正文数据 | S06 |
| CX-501 | admin 对照审计列表与实际操作 | 每条操作有审计记录，字段齐全 | S07 |
| CX-502 | 审计筛选+分页 | 生效 | S07 |
| CX-601 | 非开发同学按手册走建稿→发布 | 独立完成，卡点记录并修订手册 | F01 |
| CX-602 | 1366/1920 主页面 | 无横向滚动、限宽正常 | F08 |
| CX-603 | 组件测试：状态×角色按钮矩阵 | 表格驱动全通过 | S03 |
| CX-604 | mock 错误测试 401/403/409/429/500 | 界面行为与第 3 节表一致 | — |

## 9. 风险登记表（C 侧）

| # | 风险 | 影响 | 概率 | 缓解 | 触发信号 |
| --- | --- | --- | --- | --- | --- |
| R1 | CSRF/会话方案与 A 实现不一致 | 登录链路返工 | 中 | D1 锁定方案+示例代码；CX-001/102 先行 | 登录 403 CSRF |
| R2 | 409 冲突交互复杂度 | F06 失败 | 中 | D3 用例先行（CX-205），弹窗组件先做 | 409 用例失败 |
| R3 | 前端权限矩阵与服务端漂移 | 越权误判 | 中 | 矩阵源于同一份契约文档；CX-104/603 网格验证 | 403 文案不符 |
| R4 | API 筛选能力不足 | 列表功能缩水 | 中 | 缺口登记机制；不做伪筛选 UI | 契约变更请求积压 |
| R5 | 手册时间不足 | 交付物缺失 | 中 | 手册 D5 起草、D6 非开发试走（CX-601） | D6 手册未成稿 |
| R6 | 时间不足 | P1 挤占 P0 | 高 | 预算超 20% 上报；砍 P1 不砍验收 | D4 晚 P0 <70% |

## 10. 日程与交付节点

| 日 | 必交内容 | 当日自验 | 预算 |
| --- | --- | --- | --- |
| 1 | 后台工程、路由/布局、client+stores、mock 登录 | CX-101/104 部分通过 | 8h 累计 |
| 2 | 登录/会话接真实 API、列表、草稿创建编辑、校验 | CX-202/204 通过 | 18h |
| 3 | 送审/审核/驳回/发布/下架、冲突对话框；与 A/B 内容联调 | CX-205/301 自测 | 26h |
| 4 | 咨询列表详情、审计、角色提示；咨询跨端联调 | CX-401/402 通过 | 30h |
| 5 | 栏目映射、手册初稿、自动化测试；交叉评审 B | CX-603 通过 | 38h |
| 6 | 安全/越权/并发/桌面回归、手册试走、修缺陷 | CX 全表跑完 | 46h |
| 7 | 固定 commit 复测，交付手册、截图、测试报告、录屏 | 负责人验收 | 50h |

## 11. PR 与验收清单

- [ ] 每个工作包提交独立或小批 PR，写路由、角色、API、测试命令与实际结果、截图、已知问题；A 或 B 评审
- [ ] editor 与独立 reviewer 在真实测试 API 上完成工作流；非法操作和并发冲突有服务端拒绝及前端解释
- [ ] admissions/admin 才可查看合成咨询；无真实个人信息、长期密钥和后台测试密码进入仓库
- [ ] 25 项后台内容映射与用户端一致；内容/审核/审计文档完整；异常和两种桌面尺寸有测试证据

## 12. 可复制给 AI

> 负责 C 管理后台。先完整阅读 README、docs/ 全部文档、tasks/A-工程与集成.md 第 2 节（错误码注册表）与本任务书（执行级 v3），检查仓库状态与既有代码。按规格实现：第 2 节路由注册表与守卫矩阵、第 3 节请求客户端（统一错误分派表、CSRF 按 A 方案）、第 4 节 stores、第 5 节逐页规格（含字段表与状态动作矩阵）、第 6 节弹窗规格（冲突对话框绝不静默覆盖）、第 7 节组件。任何授权由服务端执行，前端只展示、隐藏、解释。使用合成数据；CX 用例逐条执行留证据；禁止把 mock 说成真实后端或声称生产就绪。逐项提交 PR、验证证据、未完成与风险。

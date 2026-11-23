# B 企业级任务书 微信小程序用户端（执行级 v3）

> **修订说明**：v3 在 v2 基础上补充：设计 token 规格、路由与页面注册表、API 客户端错误分类规格、统一组件接口、页面级规格（含状态矩阵）、幂等 key 状态机、测试用例注册表（BX 系列）、工时预算与风险登记表。接口字段/长度/错误码事实源为 `docs/系统架构与数据契约.md`（含 6.1 错误码注册表）与 A 发布的 OpenAPI；tasks/A 第 2 节为同步副本。本文与契约冲突时先改契约。

## 目录

- 0 角色与交付（含工时预算）
- 1 全局工程约定
- 2 设计 token 规格
- 3 路由与页面注册表
- 4 API 客户端规格（错误分类 + 重试策略）
- 5 统一组件规格
- 6 页面状态矩阵
- 7 幂等 key 生命周期
- 8 页面级规格（首页/列表/详情/咨询/联系）
- B-01 工程、组件、导航
- B-02 栏目映射与内容页面
- B-03 首页、内容与新闻
- B-04 测试咨询流程
- B-05 质量、性能与交付
- 9 测试用例注册表（BX 系列）
- 10 风险登记表
- 11 日程与交付节点
- 12 提交与验收
- 13 可复制给 AI

## 0. 角色与交付

你负责小程序的工程、用户体验、全部公开栏目和 API 接入，不负责修改后台鉴权或绕过服务端权限。先读 README、[工程约定](../docs/共同约定.md)、[架构/API](../docs/系统架构与数据契约.md)、[安全运维](../docs/安全部署与运维.md)、[测试验收](../docs/测试与验收用例.md) 和 A 的任务书第 2 节（错误码注册表）。默认 uni-app + Vue 3 + TypeScript，实际以 A 第一天确认的工具链为准。

**阶段结果（逐项可勾选，全部有证据才算达成）：**

- [ ] 微信开发者工具导入即运行，注册表内全部页面可达，无死链/白屏
- [ ] 25 项栏目 + 学生会在 `docs/栏目映射.md` 全部有路径与状态，负责人逐项点通（F01）
- [ ] 全部内容来自真实测试 API 的 published 数据；断网/空数据/404/5xx 均按第 6 节矩阵呈现
- [ ] 咨询表单幂等重试与契约一致（同 key 重试仅一条记录），客户端零输入痕迹（S06）
- [ ] 单测覆盖 client 错误分类、幂等 key 状态机、表单校验
- [ ] 375/390px 适配记录、包体与首屏数据、手测报告齐备；真机未测项明确登记

**工时预算（7 天 × 6–8h，总计 42–56h；超支 20% 即向负责人报告）：**

| 工作包 | 预算 | 主要产出 |
| --- | --- | --- |
| B-01 工程/组件/导航 | 10h | 工程、tokens、client、组件库、路由 |
| B-02 栏目映射与页面 | 10h | 25 项映射、列表/详情、占位体系 |
| B-03 首页/新闻 | 6h | 首页区块、新闻列表详情 |
| B-04 测试咨询 | 6h | 表单、幂等 key、错误回显 |
| B-05 质量/性能/交付 | 8h | 单测、矩阵、包体、文档 |
| 联调/回归/缓冲 | 8h | 三次跨端联调、D7 回归 |

## 1. 全局工程约定

1. **技术栈**：uni-app（vite 版）+ Vue 3 `<script setup>` + TypeScript；pinia 可选（本端状态简单，优先 composable）；不做 SSR/H5 生产目标——H5 仅开发期调试，验收必须微信工具/真机。
2. **构建产物**：`dist/dev/mp-weixin`（开发）、`dist/build/mp-weixin`（生产）；README 写导入步骤：微信开发者工具 → 导入目录 → 测试 AppID → 勾选"不校验合法域名"（仅本地）。
3. **环境注入**：`VITE_API_BASE_URL`（local/staging 地址，不写死生产）；编译常量 `VITE_INQUIRY_ENABLED`（生产构建必须为 false，咨询入口整块不渲染而非置灰）；页面常显角标"测试环境·合成数据"（PageContainer 强制渲染）。
4. **类型来源**：`packages/contracts` 生成的 TS 类型；接口路径/字段名禁止手抄字符串，统一从类型/常量模块导入；契约变更后重新生成并在 PR 里同步。
5. **时间与图片**：UTC ISO 8601 → 本地展示"YYYY-MM-DD HH:mm"，缺失显示"—"；仅使用授权占位图（清单在 `docs/栏目映射.md` 素材列登记），不打包未授权照片/校徽。

## 2. 设计 token 规格（`src/styles/tokens.ts` 常量，全项目唯一引用点）

| 类别 | token | 值（rpx） | 用途 |
| --- | --- | --- | --- |
| 字号 | font-title | 34 | 页面/卡片标题 |
| | font-body | 28 | 正文 |
| | font-caption | 24 | 辅助信息、requestId 小字 |
| 间距 | space-1/2/3/4 | 8/16/24/32 | 统一栅格，禁止任意值 |
| 行高 | leading-body | 1.6 | 正文可读性 |
| 颜色 | text-primary | #1F2329 | 主文本（对比度≥4.5:1） |
| | text-secondary | #646A73 | 辅助文本 |
| | bg-page | #F5F6F7 | 页面底色 |
| | brand | #1F5EFF | 主色（可按校方替换） |
| | state-error / state-success | #C54949 / #34C724 | 错误/成功 |
| 控件 | tap-min-height | 88 | 可点击最小高度（≈44px） |
| 圆角/描边 | radius-md, border-hairline | 16, 1px hairline | 卡片与分割 |

无障碍基线：文本对比度 ≥4.5:1；按压反馈（hover-class）全部可交互控件；每个图标按钮配文字或 aria-label；不依赖颜色单独传达状态（标签带文字）。

## 3. 路由与页面注册表（pages.json 唯一事实源；新增页面必须更新本表 + 栏目映射）

| 路径 | tab | 数据源 | 空态 | 跳转规则 |
| --- | --- | --- | --- | --- |
| pages/home/index | 首页 | 6 个区块独立请求 | 分区块空态 | 各区块 → 对应列表/详情 |
| pages/catalog/index | 栏目 | 静态分组结构 | — | 25 项分组入口 → 通用列表/详情 |
| pages/news/list | 新闻 | type=news | 暂无内容 | → news/detail |
| pages/news/detail | — | GET /public/contents/{id} | 404 态 | 返回保留列表滚动位置 |
| pages/content/list | — | type+category 参数化 | 待学校确认/暂无内容 | → content/detail |
| pages/content/detail | — | GET /public/contents/{id} | 404 态 | 返回保留来源 |
| pages/inquiry/index | — | POST /public/test-inquiries | — | 提交后结果态；生产不注册入口 |
| pages/contact/index | — | type=contact | 待学校确认 | 占位页 |

返回栈：详情页支持分享/直达进入时，返回按钮回首页；tab 页间跳转用 switchTab 不入栈；失效路径（未知 id）统一走 404 态。

## 4. API 客户端规格（`src/api/client.ts`，全项目唯一请求出口）

```ts
// 统一入口
request<T>(path: string, options: RequestOptions): Promise<T>
interface RequestOptions {
  method?: 'GET' | 'POST'
  query?: Record<string, string | number>
  body?: unknown
  timeoutMs?: number          // 默认 10_000
  idempotencyKey?: string     // 仅咨询提交使用
  autoRetry?: boolean         // 默认仅 GET=true
}
```

**错误分类**（类型化联合，页面只按类型分支，禁止按 message 文案匹配）：

| 类型 | 触发 | 界面行为（由 ErrorState/调用页执行） |
| --- | --- | --- |
| NetworkError | 无网络/DNS 失败 | ErrorState"网络不可用"+重试 |
| TimeoutError | >10s | 同上 |
| ApiError(404) | NOT_FOUND | "内容不存在或已下架"+返回 |
| ApiError(429) | RATE_LIMITED | "操作太频繁，请稍后再试" |
| ApiError(≥500) | INTERNAL_ERROR | "服务暂不可用"+requestId 小字 |
| ApiError(400) | VALIDATION_FAILED | 表单场景逐字段回显 details |
| ParseError | 响应不合法（开发期契约不一致） | 按 5xx 处理并 console.error 结构化对象（不含用户输入） |

**重试策略**：GET 网络失败自动重试 1 次（间隔 500ms，仍失败抛 NetworkError）；POST 一律不自动重试（幂等由第 7 节 key 生命周期保证）； requestId 从响应信封提取并存入错误对象供上报。

## 5. 统一组件规格（`src/components/`；props 必填项未传时开发期 throw）

| 组件 | Props | 事件 | 职责要点 |
| --- | --- | --- | --- |
| PageContainer | title: string; back?: boolean | — | 统一标题栏 + 环境角标"测试环境·合成数据"（常显，不可关） |
| ArticleCard | article: ContentSummary | tap | 标题两行截断、摘要一行、日期缺失"—"；点击 emit(id) |
| EmptyState | kind: 'no-content' \| 'pending-school' | — | 两种文案："暂无内容" / "待学校确认"（含说明子文案） |
| ErrorState | error: ClientError | retry | 按第 4 节类型映射文案；重试按钮 emit('retry') |
| LoadingSkeleton | variant: 'list' \| 'detail' | — | 10s 兜底：超时由调用方转 ErrorState |
| SafeImage | src?: string; ratio?: string | — | 失败/缺失显示授权占位图，永不裂图 |
| FormField | label; error?: string; counter?; required? | — | label 常显、字段级错误红字、计数器 |
| AppButton | text; loading?; disabled?; type: 'primary' \| 'plain' | tap | loading/disabled 防重复提交 |

## 6. 页面状态矩阵（每个页面实现必须逐格核对）

| 页面 | 加载中 | 空数据 | 404 | 网络失败 | 5xx |
| --- | --- | --- | --- | --- | --- |
| 首页 | 分区块骨架 | 分区块 EmptyState（互不阻塞） | — | 分区块 ErrorState+重试 | 分区块 |
| 通用列表 | 骨架 + 触底加载/没有更多 | EmptyState（按栏目 kind） | — | ErrorState 保留已加载项 | ErrorState |
| 列表分页加载中再失败 | 顶部横幅"加载更多失败，点击重试"，已有数据可用 | — | — | 同左 | 同左 |
| 通用/新闻详情 | detail 骨架 | — | "不存在或已下架"+返回 | ErrorState+重试 | ErrorState+requestId |
| 咨询表单 | — | — | — | 保持输入+明确可重试 | 同左 |
| 联系 | 骨架 | 待学校确认 | — | ErrorState | ErrorState |

规则：禁止无限 loading（10s 兜底）；禁止任何"失败却显示成功"的状态；错误态必须可重试且重试不清空用户输入（咨询页尤其如此）。

## 7. 幂等 key 生命周期（抽成 `src/composables/useIdempotentSubmit.ts`，必须单测）

```text
状态机：IDLE → ACTIVE(key已生成) → IN_FLIGHT → { SUCCESS | FAILED }
转换：
  开始一次新提交        IDLE/ACTIVE/FAILED → ACTIVE   生成 UUID v4
  提交发出              ACTIVE → IN_FLIGHT            按钮 loading/disabled
  服务端成功(201/200)   IN_FLIGHT → SUCCESS           key 作废、表单清空、显示测试成功态
  网络失败/超时/5xx     IN_FLIGHT → FAILED            保留原 key 与全部输入，显示可重试
  FAILED 重试           FAILED → IN_FLIGHT            复用同一 key 重发
  用户修改任一字段      ACTIVE/FAILED → ACTIVE        作废旧 key，下次提交用新 key（防同 key 异内容 409）
  离开页面              任意 → 销毁                    key 与输入一并释放，不落 storage
成功响应头 Idempotent-Replay: true 时提示"已重复提交，以下为首次结果"。
```

## 8. 页面级规格

### 8.1 首页（pages/home/index）

| 区块 | 数据请求 | 交互 | 空态 |
| --- | --- | --- | --- |
| 学校介绍 | type=school&category=overview 最新 1 条 | → 详情 | 待学校确认 |
| 课程入口 | type=academics 最新 1 条 + 固定入口 | → 课程列表 | 待学校确认 |
| 升学 | type=outcomes 最新 1 条 | → 详情/列表 | 待学校确认 |
| 校园生活 | type=campus 最新 1 条 | → 列表 | 待学校确认 |
| 学生会 | type=student_union 最新 1 条 | → 列表 | 待学校确认 |
| 最新新闻 | type=news 最新 3 条 | → news/detail | 暂无内容 |
| 招生入口 | 固定入口 + type=admissions 摘要 | → 招生列表；咨询入口按开关渲染 | — |

每个区块独立请求、独立加载/空/错；任何区块失败不阻塞其他区块；不硬编码与详情页冲突的文案。

### 8.2 通用列表页（pages/content/list，参数化复用）

- 请求：`GET /v1/public/contents?type={type}&category={category}&page={n}&pageSize=20`
- 触底加载 onReachBottom → page+1；加载中横幅；"没有更多了"终止；下拉刷新回第 1 页
- 列表项：ArticleCard；点击携带 id 进详情
- 空态按栏目 kind（news 用 no-content；其余栏目无正式资料用 pending-school）

### 8.3 通用/新闻详情页

- 请求：`GET /v1/public/contents/{id}`；渲染：标题、日期、正文（保留换行的安全文本，不用 rich-text 渲染任意 HTML）、SafeImage
- 404 →"不存在或已下架"+返回；长文完整滚动；标题超长两行截断不遮挡
- 下架联动：不做客户端缓存，刷新列表与详情自然不可见（F05）

### 8.4 测试咨询页（pages/inquiry/index）

| 字段 | 控件 | 校验（客户端，文案与服务端同义） | 服务端对应 |
| --- | --- | --- | --- |
| kind | 单选：咨询 consultation / 参观 visit | 必选 | VALIDATION_FAILED |
| testName | input | trim 后 1–40，即时计数 | 同 |
| testContact | input | 1–100 | 同 |
| message | textarea | 可选，0–500，即时计数 | 同 |

- 顶部固定醒目声明："测试环境：仅可填写虚构信息，非正式报名渠道"
- 提交流程按第 7 节状态机；`VITE_INQUIRY_ENABLED=false`（生产构建）时入口不渲染
- 成功态：明确"测试提交成功（合成数据）"+ 可选 requestId 小字；不缓存可恢复
- 隐私纪律：console 不打印表单值；不写 storage；离开清空（AX-407 的客户端配合面）

### 8.5 联系页

- 无已确认电话/地址：显示"待学校确认"区块，拨号/导航按钮不渲染（或禁用态且不可点击），不虚构客服/预约/费用
- 有 published 联系内容（type=contact）时按内容渲染，仍带测试角标

## B-01 工程、组件、导航 P0

按第 1/2/3/4/5 节规格实施：D1 完成工程初始化 + tokens + client（含错误分类单测通过）+ 全部 7 个组件（props 生效、开发期校验）+ 路由注册表骨架 + 微信工具导入验证。**当日验收：**首页与任意两页可导航；断网显示 ErrorState 可重试；空数据不白屏；375/390px 导航可操作（E01 部分、F08 部分）。

## B-02 栏目映射与内容页面 P0

按第 3 节与映射分组实施 25 项 + 学生会：

| 分组 | 页面形态 | 请求参数 | 约束 |
| --- | --- | --- | --- |
| 1–6 学校 | 区块/列表+详情 | type=school, category=overview|head_message|mission|history|faculty|partnerships | 缺→待学校确认 |
| 7–12 学术 | 列表+详情 | type=academics, category=overview|foundation|ap|alevel|subjects|calendar | 校历无资料只占位；筛选 P1 不放假按钮 |
| 13–14 升学 | 结构化详情 | type=outcomes | 未确认不展示真实录取率/学生信息 |
| 15–20 招生 | 区块+详情 | type=admissions | 费用待确认即占位；咨询按 B-04 |
| 21–23 校园 | 分类入口+列表 | type=campus | 未公开资料不伪造 |
| 24 新闻 / 25 联系 | 列表详情 / 占位 | type=news / contact | 活动 P1 |
| 学生会 | 列表+详情 | type=student_union, category=overview | 简介与动态多篇文章，入口不遗漏 |

`docs/栏目映射.md` 字段：编号、栏目、用户端路径/锚点、后台 type/category、是否已发布、内容状态（正式资料/合成示例/待学校确认）、素材提供人、缺口、验收结果；**每天晚更新**，负责人按表逐项点（F01）。

**验收：**F01/F07；只读 published；猜 id 见草稿不可能（依赖服务端 404）。

## B-03 首页、内容与新闻 P0

按 8.1–8.3 实施。**验收：**F03（新闻 A/B 标题正文匹配同一条记录）、F05（下架后列表与详情刷新均不可见）、F07（空/缺图/超长/无效 id 不崩不错配）；断网可恢复。

## B-04 测试咨询流程 P0

按 8.4 + 第 7 节实施。**验收：**S06 客户端侧 + F07：空填/超长/正常合成输入/快速双击/断网重试逐项留记录（BX-401～409）；后端同 key 仅一条（与 A 联测）；生产构建无入口；客户端日志无输入值。

## B-05 质量、性能与交付 P0

1. **单测**（vitest）：client 错误分类与重试、幂等 key 状态机全转换、表单校验规则、时间格式化缺失值。
2. **手工矩阵**：第 6 节逐格 × 375/390px × 系统字体最大档；记录设备、工具版本、截图；真机可用则补充，不可用登记。
3. **性能**：记录主包大小（微信上限以平台文档为准；目标 ≤1.5MB）、首页请求次数（≤7）、测试环境首屏可见时间与测量方法；图片压缩、无冗余资源。
4. **交付**：栏目映射、截图与短视频、构建导入步骤、环境切换说明、排错 FAQ、遗留清单；D7 最终 commit 全量回归。

## 9. 测试用例注册表（BX 系列）

| ID | 前置与步骤 | 预期 | 映射 |
| --- | --- | --- | --- |
| BX-001 | DevTools 导入 dist，首启 | 编译零错误，首页渲染 | E01 |
| BX-002 | 遍历路由注册表全部页面 | 无死链/白屏/控制台未捕获错误 | F01 |
| BX-101 | 断网请求 | NetworkError → ErrorState+重试 | F07 |
| BX-102 | DevTools 限速 >10s | TimeoutError → 同上 | F07 |
| BX-103 | 无效 id 进详情 | 404 文案+可返回 | F07 |
| BX-104 | 触发 429（A 限流配合） | 对应文案 | F07 |
| BX-105 | 触发 5xx | 文案+requestId 小字 | F07 |
| BX-201 | 375px 首页/列表/详情/表单 | 无横向溢出/遮挡，导航可操作 | F08 |
| BX-202 | 390px + 系统字体最大档 | 长标题截断不遮挡，按钮可达 | F08 |
| BX-203 | 断网→恢复→重试 | 数据恢复，无重复堆积 | F07 |
| BX-204 | 空数据页面 | 正确空态非白屏 | F07 |
| BX-301 | 首页 7 区块 | 独立加载/空/错，互不阻塞 | F07 |
| BX-302 | 新闻列表 >20 条 | 触底加载、没有更多、下拉刷新 | F03 |
| BX-303 | 新闻 A/B 对比 | 详情标题正文与列表同源 | F03 |
| BX-304 | 后台下架后刷新 | 列表与详情均不可见 | F05 |
| BX-305 | 猜草稿 id | 404，无法浏览草稿 | F01 |
| BX-401 | 咨询逐字段空/超长 | 字段级错误，不入提交 | S06 |
| BX-402 | 全空提交 | 阻止并提示 | S06 |
| BX-403 | 合法合成输入 | 201 成功态 | S06 |
| BX-404 | 提交中快速双击 | 仅一次请求（按钮禁用） | S06 |
| BX-405 | 断网失败→重试 | 复用同 key，后端仍 1 条 | S06 |
| BX-406 | 失败后修改字段再提交 | 新 key，无 409 | S06 |
| BX-407 | 生产构建（开关关） | 入口不渲染 | S06 |
| BX-408 | 全流程后检查 console/storage | 零表单值 | S06 |
| BX-501 | 联系页无资料 | 待学校确认，按钮不可点 | F01 |
| BX-601 | 记录包体/首屏请求/加载时间 | 有数值与方法说明 | O03 |
| BX-602 | 映射表逐项点击 | 25 项+学生会全部可达或有占位 | F01 |

## 10. 风险登记表（B 侧）

| # | 风险 | 影响 | 概率 | 缓解 | 触发信号 |
| --- | --- | --- | --- | --- | --- |
| R1 | 微信工具链/AppID/真机不可用 | 验收证据缺失 | 中 | D1 核验；登记阻塞走替代证据 | 工具导入失败 |
| R2 | 契约变更晚于实现 | 页面返工 | 中 | 类型生成+变更通知订阅；mock/真实切换点收敛在 client | 契约 diff 通知 |
| R3 | 幂等语义实现偏差 | 重复数据/409 误现 | 中 | key 状态机单测全覆盖（BX-405/406） | 状态机用例失败 |
| R4 | 包体超限 | 构建失败 | 低 | 占位图优先、分包预留、D5 度量 | 主包 >1.5MB |
| R5 | 依赖 A 的进度 | 联调延期 | 中 | mock 优先开发，D3 才切真实 | A 的 D2 未交付 |
| R6 | 真实素材误入仓库 | 合规风险 | 低 | 素材登记清单+打包前审计 | 素材清单缺来源 |

## 11. 日程与交付节点

| 日 | 必交内容 | 当日自验 | 预算 |
| --- | --- | --- | --- |
| 1 | 工具链、导入验证、tokens/client/组件/路由骨架、映射初稿 | BX-001/002 部分通过 | 10h 累计 |
| 2 | 通用列表/详情、学校与学术内容接 API、异常空态 | BX-10x 通过 | 20h |
| 3 | 升学、校园、学生会、新闻列表详情；参与发布联调 | BX-303 自测 | 28h |
| 4 | 咨询表单 + 幂等状态机；联系页 | BX-40x 通过 | 34h |
| 5 | 25 项映射补齐、适配与无障碍基础、单测补全；评审 C | 映射全绿或标缺口 | 42h |
| 6 | 设备/异常/安全回归、性能基线、缺陷修复 | BX 全表跑完 | 48h |
| 7 | 最终 commit 构建、全路径回归、验收截图与演示素材 | 负责人按映射表点击 | 52h |

## 12. 提交与验收

- [ ] 每个 PR 写清页面、路由、接口与影响，关联 Issue；列实际微信工具版本、命令、截图和未测项，由 A 或 C 评审
- [ ] 25 项与学生会有可操作映射，用户端只展示已发布内容，新闻详情、返回与下架正确
- [ ] 咨询只用于非生产合成数据，重复与失败处理符合 API 契约，不泄露输入
- [ ] 在最终 commit 上完成关键页面的加载/空态/错误/适配测试并记录证据

## 13. 可复制给 AI

> 负责 B 微信小程序。先读取 README、docs/ 全部文档、tasks/A-工程与集成.md 第 2 节（错误码注册表）与本任务书（执行级 v3），检查现有代码与工作区。按规格实现：`src/styles/tokens.ts`（第 2 节值）、`src/api/client.ts`（第 4 节类型化错误分类与重试策略）、第 5 节 7 个组件、第 3 节路由注册表、第 6 节状态矩阵逐格实现、第 8 节各页面规格、`useIdempotentSubmit`（第 7 节状态机，必须单测）。所有内容来自 published 数据，缺资料诚实占位；不虚构学校事实；不执行任意 HTML；不打包未授权素材。在微信开发者工具实际验证并记录版本；BX 用例逐条执行留证据；真机未测明确登记。不要破坏他人的未提交修改；通过 PR、截图和问题清单交付。

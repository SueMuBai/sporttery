# 彩果长期账单 App 全量重构方案

> 文档状态：第一阶段历史方案（已执行完毕，不再作为当前需求来源）
> 编制日期：2026-07-18
> 目标平台：Android App、桌面浏览器开发环境
> 当前方案：以 [`refactor/INTERACTION_AND_CLEANUP_PLAN.md`](refactor/INTERACTION_AND_CLEANUP_PLAN.md) 为准。用户已确认不兼容旧数据，当前 App 使用全新数据库。

本文只保留第一阶段架构决策和历史背景。当前执行状态与逐项证据见 [`docs/refactor/PROGRESS.md`](refactor/PROGRESS.md)，旧版冻结基线仅供追溯，不能作为当前迁移要求。

## 1. 重构结论

本项目建议进行全量重构，不再继续在 `web/index.html` 上叠加覆盖样式。

当前按钮文本不居中、边框丢失、字号和间距不统一，并不是 Android 打包本身造成的，也不是某个现成组件框架的缺陷。项目当前实际上没有前端组件框架，主要问题是：

- CSS、HTML、JavaScript 全部集中在约 187 KB 的单个 `web/index.html` 中。
- `.toolbar`、`.panel`、`.calendar-day` 等选择器被多次重复定义和覆盖。
- 全局 `button`、页面按钮、主题覆盖、像素修正版同时生效，没有统一的组件契约。
- 大量 `onclick`、内联 `style`、`prompt/confirm/alert`，交互行为难以统一。
- 设计令牌分散在多套 JSON、CSS 和旧主题资源中，没有单一可信来源。
- Android 当前通过 Chaquopy 启动 Python HTTP 服务，再由 Capacitor WebView 打开本机网页，链路复杂且难以维护。

最终技术栈确定为：

| 层级 | 新方案 |
| --- | --- |
| UI | Vue 3 + TypeScript + Vant 4 |
| 构建 | Vite |
| 状态 | Pinia |
| 路由 | Vue Router |
| App 容器 | Capacitor 7 |
| 网络 | CapacitorHttp；浏览器开发环境使用 Vite Proxy |
| Android 数据库 | `@capacitor-community/sqlite` |
| 浏览器数据层 | IndexedDB 适配器，仅用于开发和预览 |
| 单元测试 | Vitest |
| 组件测试 | Vue Test Utils |
| 端到端测试 | Playwright |
| 代码质量 | ESLint + Prettier + Stylelint |

不引入 Tailwind。当前项目最需要的是稳定、可追踪的组件样式，而不是继续叠加原子类。Vant 负责成熟交互，项目 CSS 只负责品牌主题和业务布局。

## 2. 重构范围

### 2.1 必须保留的业务能力

- 获取并增量保存最新比赛。
- 获取历史交锋，支持配置历史条数、并发数、超时和重试。
- 获取并增量保存赛果；已有赛果赔率变化时更新为最新值。
- 五种玩法：
  - 胜平负 / 让球胜平负。
  - 比分。
  - 总进球。
  - 半全场。
  - 混合过关。
- 同一场比赛只能选择一种玩法；对应玩法内部允许多选。
- 多场、多过关方式、多倍投注。
- 注数、投注金额、理论奖金上下限计算。
- 当前已完成场次、猜对数量、已结算组合、当前预计收益。
- 保存、导入、修改、改名、删除方案。
- 标签创建、修改、删除、排序和方案标签关联。
- 账单统计、日期筛选、排序、详情、回款编辑、盈利亏损展示。
- 设置页系统设置、标签管理、方案管理、导出和关于页面。
- App 重启后直接读取本地数据，不要求再次请求。

### 2.2 明确淘汰的旧实现

- 单文件 `web/index.html` 中的全部业务 JavaScript 和叠加 CSS。
- 浏览器原生 `prompt()`、`confirm()`、`alert()`。
- HTML 内联 `onclick` 和动态拼接事件。
- 依赖 PNG 背景表达边框、圆角或选中态。
- Android 内 Python `ThreadingHTTPServer`。
- Chaquopy Python 运行时和 `127.0.0.1:8765` 本地服务。
- 多份互相冲突的主题变量。

旧代码在迁移完成前只作为业务规则参考，不继续修补 UI。

## 3. 目标目录结构

```text
sporttery/
├─ src/
│  ├─ app/
│  │  ├─ router.ts
│  │  ├─ bootstrap.ts
│  │  └─ lifecycle.ts
│  ├─ assets/
│  │  ├─ icons/
│  │  ├─ illustrations/
│  │  └─ theme/
│  ├─ components/
│  │  ├─ base/
│  │  │  ├─ AppButton.vue
│  │  │  ├─ AppIconButton.vue
│  │  │  ├─ AppCard.vue
│  │  │  ├─ AppChip.vue
│  │  │  ├─ AppHeader.vue
│  │  │  ├─ AppState.vue
│  │  │  └─ AppBottomNav.vue
│  │  ├─ ticket/
│  │  ├─ ledger/
│  │  ├─ plan/
│  │  └─ settings/
│  ├─ features/
│  │  ├─ matches/
│  │  ├─ results/
│  │  ├─ betting/
│  │  ├─ plans/
│  │  ├─ ledger/
│  │  ├─ tags/
│  │  └─ settings/
│  ├─ stores/
│  ├─ services/
│  │  ├─ api/
│  │  ├─ database/
│  │  ├─ migration/
│  │  └─ export/
│  ├─ styles/
│  │  ├─ tokens.css
│  │  ├─ reset.css
│  │  ├─ typography.css
│  │  ├─ components.css
│  │  └─ safe-area.css
│  ├─ types/
│  ├─ utils/
│  ├─ views/
│  ├─ App.vue
│  └─ main.ts
├─ tests/
│  ├─ unit/
│  ├─ component/
│  └─ e2e/
├─ docs/
├─ android/
├─ vite.config.ts
├─ tsconfig.json
└─ package.json
```

业务规则不能直接写在 Vue 页面中。页面只负责组合组件，注数、结算、赔率映射、迁移等规则必须位于 `features` 或 `services`。

## 4. UI 组件规范

### 4.1 统一按钮契约

所有按钮必须通过 `AppButton`、`AppIconButton` 或明确封装后的 Vant 组件输出，禁止页面自由设置行高和 padding。

```css
.app-button {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 16px;
  border: 0;
  line-height: 1;
  text-align: center;
  vertical-align: middle;
}

.app-button__label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1.2;
}
```

必须支持以下状态：

- default。
- pressed。
- selected。
- disabled。
- loading。
- icon only。
- leading icon + text。
- text only。
- danger。

按钮验收不能只凭肉眼，需要在 Playwright 中比较按钮盒子中心和文字盒子中心，垂直误差不得超过 1 px。

### 4.2 单一主题令牌

`src/styles/tokens.css` 是唯一运行时主题来源。现有各设计 JSON 仅作为迁移参考。

```css
:root {
  --color-page: #f6faff;
  --color-surface: #ffffff;
  --color-primary: #5797f5;
  --color-primary-soft: #eaf4ff;
  --color-accent: #ff7d7d;
  --color-accent-soft: #fff0f2;
  --color-text: #1d2530;
  --color-text-secondary: #6f7b8b;
  --color-text-placeholder: #a5afbd;
  --color-border: #dce6f2;
  --color-border-strong: #c8d8ea;
  --color-divider: #e8eef6;
  --radius-control: 12px;
  --radius-card: 16px;
  --control-height: 44px;
  --touch-target: 44px;
}
```

普通描边统一使用 1 px inset 描边；禁止 0.5 px；禁止依赖图片表达动态边界。

### 4.3 响应式基线

必须同时验收：

- 360 × 800。
- 390 × 844。
- 412 × 915。

布局不使用整页 `scale()` 或 `zoom`。顶部和底部使用 `env(safe-area-inset-*)`。赔率按钮通过 Grid 自适应，不用固定像素硬挤。

## 5. 数据与数据库重构

### 5.1 新数据层

定义统一 `DatabaseAdapter`，页面和 Pinia 不允许直接调用 SQLite。

```ts
interface DatabaseAdapter {
  initialize(): Promise<void>
  transaction<T>(action: () => Promise<T>): Promise<T>
  getSettings(): Promise<AppSettings>
  saveMatches(matches: MatchSnapshot[]): Promise<void>
  saveResults(results: MatchResult[]): Promise<void>
  listPlans(filter?: PlanFilter): Promise<SavedPlan[]>
  savePlan(plan: SavedPlan): Promise<void>
  deletePlan(id: string): Promise<void>
  listLedger(range: DateRange): Promise<LedgerOrder[]>
  updateLedgerReturn(id: string, value: number): Promise<void>
}
```

实现：

- `CapacitorSqliteAdapter`：Android 正式环境。
- `IndexedDbAdapter`：浏览器开发和 Playwright。
- `MemoryAdapter`：单元测试。

### 5.2 新数据库版本

沿用并规范化现有核心表：

- `schema_migrations`。
- `settings`。
- `tags`。
- `plans`。
- `plan_selections`。
- `plan_tags`。
- `match_snapshots`。
- `match_results`。
- `ledger_orders`。
- `ledger_transactions`。

新增建议：

- `sync_jobs`：记录比赛/赛果同步批次、状态、数量和错误。
- `odds_history`：保留赔率变化历史，当前赔率取最新记录。
- `app_events`：记录数据迁移和关键本地操作，便于排错。

所有金额在新代码中使用“分”为单位的整数，显示时再转换为元，避免浮点误差。赔率保留为十进制定点字符串或整数万分位，不直接累积 JavaScript 浮点数。

### 5.3 旧数据迁移

现有 Android 数据位于应用 `filesDir/caiguo.db`。新 SQLite 插件使用不同数据库目录，因此必须提供一次性原生迁移桥接：

1. 启动时检查新库 `schema_migrations`。
2. 检查旧 `filesDir/caiguo.db` 是否存在。
3. 复制旧库到临时位置并以只读方式打开。
4. 按表迁移，使用事务和唯一键避免重复。
5. 比较每张表迁移前后数量，并抽样校验方案、投注项和账单金额。
6. 写入迁移完成标记和迁移报告。
7. 旧数据库至少保留两个 App 版本，不立即删除。
8. 迁移失败时回滚新库并继续保留旧版本 App 可用数据。

迁移验收：

- 方案数量、标签数量、账单数量一致。
- 每个方案选择项数量一致。
- 总投入、总回款、总盈亏一致到 0.01 元。
- 已完成/进行中状态一致。
- 最近比赛和赛果数量一致。

## 6. 网络和同步设计

### 6.1 数据源

保留现有体彩数据源，但统一封装在 `SportteryGateway`：

- 比赛列表接口。
- 历史交锋接口。
- 比赛结果接口。
- 比分、总进球、半全场、混合过关页面或接口适配器。

组件不得直接拼接 URL。

### 6.2 增量同步规则

同步过程拆为：

1. 拉取比赛目录。
2. 基于 `matchId + 更新时间` 判定新增或变化。
3. 限流获取需要更新的历史交锋。
4. 拉取赛果并以 `matchId` upsert。
5. 更新最新官方结果和赔率，同时追加赔率历史。
6. 重新计算受影响方案和账单。
7. 提交事务。
8. 向 UI 返回结构化同步报告。

同步报告至少包含：新增比赛、更新比赛、新增赛果、更新赛果、失败数量、受影响方案、耗时。

刷新按钮状态：idle、loading、partial-success、success、error。连续点击需要防抖和请求合并。

## 7. 业务计算模块

建立纯 TypeScript 计算模块，并为每种玩法编写测试：

- `selectionKey()`：选择项唯一键。
- `validateSingleMarketPerMatch()`：一场只允许一种玩法。
- `calculateBetCount()`：组合注数。
- `calculateStake()`：投注金额。
- `calculatePrizeRange()`：理论奖金上下限。
- `resolveOfficialOutcome()`：根据赛果解析实际结果。
- `evaluatePlan()`：已完成、猜对、猜错、待定。
- `calculateCurrentReturn()`：当前已结算组合收入。
- `calculateLedgerProfit()`：账单盈亏。

重点测试边界：

- 2 关到 N 关多选组合。
- 同场多个选项不能在同一组合重复出现。
- 多个过关方式同时选择。
- 比分“胜其他/平其他/负其他”。
- 半全场解析。
- 让球为正数、负数和零。
- 未完赛、部分完赛、全部完赛。
- 赔率变化后历史方案赔率是否冻结、当前比赛赔率是否更新。
- 理论奖金下限不能简单等于最高或最低赔率乘积，必须按所有有效组合求最小可能中奖总额。

## 8. 页面重构规格

### 8.1 App Shell

- 顶部品牌区高度、标题和副标题统一。
- 右上角只放当前页主操作。
- 底部固定为“账单 / 选票 / 设置”。
- 页面切换保留各页滚动位置和草稿状态。
- Android 返回键优先关闭 Popup/Sheet，其次返回二级页，最后退出 App。

### 8.2 选票页

组件拆分：

- `TicketHeaderActions`。
- `MarketTabs`。
- `SyncStatusCard`。
- `MatchSearchField`。
- `MatchCard`。
- `HadMarketGrid`。
- `ScoreMarketGrid`。
- `TotalGoalsGrid`。
- `HalfFullGrid`。
- `MixedMarketGrid`。
- `BetSummaryBar`。
- `BetBottomSheet`。

交互要求：

- 顶部刷新一次完成比赛和赛果同步。
- 玩法切换不丢失其他比赛已选内容。
- 切换同一场玩法时提示会清除该场旧玩法选择。
- 比分按主胜、平、客胜三组排列。
- 比分、进球、半全场移动端统一每行 6 个按钮；极窄屏可降为 5 个但不得横向溢出。
- 胜平负与让球胜平负标题同一行，各自按钮在下一行。
- 比赛历史中的同一支球队始终使用同一颜色，不以主客位置决定颜色。
- 底部投注 Sheet 支持展开/收起、过关多选、倍数、金额、奖金范围、保存和查看方案。
- 保存方案使用正式 Sheet：名称、已有标签多选、是否标记已购，禁止 `prompt()`。

### 8.3 方案管理

页面路由：

- 方案列表。
- 方案详情。
- 组合明细。
- 标签筛选和标签管理。

必须支持：加载并编辑、改名、标签修改、删除、状态筛选、过关筛选、排序、冲突处理。

所有危险操作使用 Vant Dialog 或 Bottom Sheet。保存成功、失败和冲突使用统一 Toast/Banner。

### 8.4 账单页

默认页面直接显示：

- 页面标题和右上角日期筛选按钮。
- 统计周期行。
- 快捷日期选择。
- 汇总卡片。
- 账单列表。

点击日期后直接展开当前页 Bottom Sheet 日期面板，不再打开二级日历弹窗。日期面板支持起止日期、年月层级选择和快捷范围。

账单详情显示方案快照；回款金额仅在方案整体完成后允许直接编辑。保存时进行非负数、两位小数和并发更新校验。

### 8.5 设置页

一级页分组：

- 数据配置：系统设置、数据更新。
- 内容管理：标签管理、方案管理。
- 数据导出：Markdown、JSON。
- 其他：关于彩果。

二级页统一使用 AppBar、返回按钮、保存状态和未保存离开确认。系统设置使用 Stepper/Field 组件；标签支持颜色、排序和删除冲突提示。

## 9. 交互状态必须补齐

每个异步页面都必须有：

- 首次加载骨架屏。
- 空状态。
- 加载失败状态。
- 重试入口。
- 局部刷新状态。
- 成功反馈。
- 部分成功反馈。
- 离线状态。

表单必须有：

- 默认。
- 聚焦。
- 已填写。
- 校验错误。
- 禁用。
- 保存中。
- 保存成功。
- 保存失败。
- 未保存离开确认。

## 10. 需要其他 AI 补充的设计交付物

现有资源已经覆盖大量业务图标，暂时不需要重复生成底部导航和常用 `ic_*`。真正缺失的是“完整状态和交互稿”，而不只是单个图标。

请让其他 AI 按以下清单生成，格式优先 Figma/可编辑 SVG，其次为 390 × 844 PNG 效果图，并同时提供 360、412 宽度标注。

### 10.1 全局组件稿

1. Button 全状态：主按钮、次按钮、文字按钮、危险按钮、图标按钮；default/pressed/disabled/loading。
2. Chip 全状态：默认、选中、禁用、数量徽标、超长文字。
3. TextField 全状态：默认、focus、error、disabled、带左右图标。
4. Toast：成功、失败、警告、普通提示。
5. Banner：同步成功、部分成功、失败、离线。
6. Bottom Sheet：短内容、长内容、键盘弹起、拖拽关闭。
7. Dialog：确认、危险确认、三按钮冲突选择。
8. Loading、Skeleton、Empty、Error、Offline 组件。
9. AppBar：一级页、二级页、标题过长、左右都有操作。
10. Android 状态栏、导航栏和刘海安全区标注。

### 10.2 选票页效果图

1. 五种玩法各一张完整默认态。
2. 各玩法选中态，至少包含同场多选。
3. 同场切换玩法的冲突提示。
4. 搜索无结果。
5. 无比赛、无赔率、赔率停售、赔率变更提示。
6. 首次加载、刷新中、刷新成功、部分失败、全部失败。
7. 比赛卡展开和收起。
8. 历史交锋无数据与加载失败。
9. 投注栏收起、半展开、全展开。
10. 保存方案 Sheet：名称、标签多选、已购开关、校验错误。
11. 理论奖金说明弹层。
12. 360/390/412 三档赔率网格标注。

### 10.3 方案管理效果图

1. 空方案。
2. 进行中、已完成、已盈利、已亏损、无赛果五种卡片。
3. 排序菜单、筛选菜单。
4. 更多菜单。
5. 方案详情和组合明细。
6. 加载到选票时无冲突、部分冲突、全部冲突。
7. 改名、标签选择、删除确认。
8. 标签拖动开始、占位、落位、失败回滚。

### 10.4 账单页效果图

1. 默认当月页面。
2. 日期筛选 Sheet 展开态；日、月、年三个层级。
3. 起始日期已选、选择区间中、完整区间三种状态。
4. 快捷范围选中态。
5. 空账单、加载失败、离线数据。
6. 时间排序菜单展开态。
7. 进行中和已完成账单详情。
8. 回款编辑默认、focus、非法金额、保存中、成功、失败。
9. 超长方案名、多标签、大金额和负数金额适配。

### 10.5 设置页效果图

1. 一级设置完整效果图。
2. 系统设置默认、修改后未保存、保存中、保存成功、保存失败。
3. 标签列表、空标签、新增、编辑、删除冲突、拖动排序。
4. 数据更新执行中和结果报告。
5. 导出成功、失败、权限不足。
6. 关于彩果完整页面。

### 10.6 建议新增的插画资源

如果希望空状态不只是图标，可生成以下透明背景 SVG/PNG：

- `ill_empty_matches`。
- `ill_empty_plans`。
- `ill_empty_ledger`。
- `ill_network_error`。
- `ill_sync_success`。

插画只表达内容，不包含文字、按钮、边框和背景色；文字和交互控件由代码绘制。

## 11. 分阶段执行计划

### 阶段 0：冻结基线与数据备份

任务：

- 标记当前稳定 commit 和成功 APK。
- 备份旧 SQLite、JSON/JSONL 数据和 schema。
- 记录当前 3 档尺寸截图和核心业务输出。
- 建立功能对照表。

验收：旧版本可随时重新构建；数据备份可读取。

### 阶段 1：工程骨架与设计系统

任务：

- 建立 Vue + TypeScript + Vite + Pinia + Vant。
- 配置路由、Lint、格式化、测试。
- 建立 tokens、App Shell、Button、IconButton、Card、Chip、State 组件。
- 完成底部导航和安全区。

验收：按钮中心误差不超过 1 px；三档尺寸无溢出；Android 空壳可构建。

### 阶段 2：数据库和旧数据迁移

任务：

- 接入 Capacitor SQLite。
- 建立 schema v4 和 Repository。
- 实现旧 `caiguo.db` 迁移桥。
- 实现浏览器 IndexedDB 适配器。

验收：迁移前后数量和金额一致；重复执行不产生重复数据。

### 阶段 3：网络与计算内核

任务：

- 实现比赛、历史和赛果网关。
- 实现增量同步和同步报告。
- 迁移投注、奖金、结算计算。
- 补齐单元测试。

验收：使用当前保存方案对比旧版输出，注数、金额、奖金和结算一致。

### 阶段 4：选票页

任务：

- 迁移五种玩法和比赛历史。
- 实现单场单玩法约束。
- 实现投注 Sheet 和方案保存。

验收：完整跑通“刷新 → 选择 → 过关 → 保存方案”。

### 阶段 5：方案管理

任务：

- 列表、筛选、排序、详情、组合明细。
- 导入编辑、改名、标签和删除。
- 冲突处理和标签排序。

验收：现有方案全部可查看、编辑和结算，数据不丢失。

### 阶段 6：账单页

任务：

- 默认当月统计、日期 Sheet、排序和汇总。
- 详情、方案快照和回款编辑。

验收：总投入、总回款、总盈亏与数据库一致。

### 阶段 7：设置和导出

任务：

- 系统设置、标签、方案入口、更新报告、导出、关于。
- 未保存状态和表单校验。

验收：设置重启后保留；导出文件可重新解析。

### 阶段 8：移除旧运行时

任务：

- 移除 Chaquopy、Python 本地 HTTP 服务和旧 Web 文件。
- 调整 Capacitor 配置和 Android MainActivity。
- 更新 GitHub Actions。

验收：APK 不依赖 Python；冷启动、离线启动、升级迁移正常。

### 阶段 9：全面验收和发布

任务：

- 单元、组件、E2E、真机构建测试。
- 性能、无障碍、弱网、异常恢复测试。
- 生成迁移报告和用户升级说明。

验收：所有阻断级问题归零后再合并主分支和发布 APK。

## 12. 测试矩阵

| 范围 | 必测项 |
| --- | --- |
| UI | 360/390/412；文本缩放 100%/115%；深色系统栏；安全区 |
| 按钮 | 文字居中、图文居中、按下、禁用、Loading、长文字 |
| 数据 | 新安装、旧库迁移、重复迁移、迁移中断、空库 |
| 网络 | 正常、超时、部分失败、断网、恢复网络、重复点击刷新 |
| 投注 | 五玩法、同场冲突、多选、多过关、多倍、极大注数 |
| 结算 | 未完赛、部分完赛、全完赛、赔率变化、官方结果修正 |
| 账单 | 空、当月、跨月、跨年、回款编辑、金额边界 |
| Android | 冷启动、后台恢复、返回键、键盘、升级安装、权限 |

## 13. 性能和质量门槛

- 首屏本地数据可见时间目标小于 800 ms。
- 100 场比赛列表滚动不明显掉帧，必要时使用虚拟列表。
- 同步过程不阻塞 UI。
- TypeScript 严格模式无错误。
- ESLint、Stylelint、单元测试和构建全部通过才允许提交。
- 控制台错误为 0。
- 可点击区域最低 44 × 44 px。
- 所有图标必须有可访问名称；纯装饰图标隐藏于辅助技术。

## 14. Git 和发布策略

- 每个阶段独立 commit，不将所有重构压成一个巨型提交。
- 阶段完成后才触发一次 GitHub Actions 测试构建。
- 未完成阶段不替换稳定 APK。
- 保留旧稳定 tag，例如 `legacy-stable-1.0.1`。
- 新架构首个版本建议提升为 `2.0.0`。
- 用户明确说“提交构建”后才推送和触发 APK 构建。

## 15. 风险与回滚

| 风险 | 控制方式 |
| --- | --- |
| 旧 SQLite 迁移失败 | 原库只读备份、事务迁移、数量和金额校验 |
| 官方接口 CORS | Android 使用 CapacitorHttp；浏览器使用 Vite Proxy |
| 新旧计算结果不一致 | 固定旧方案样本做双轨对比测试 |
| Vant 默认样式与主题冲突 | 只通过 CSS 变量和封装组件覆盖，不在页面散写 |
| 列表性能下降 | 分页、按需计算、虚拟列表 |
| Android 升级后数据路径变化 | 原生迁移桥显式读取旧 filesDir |
| 重构周期内旧版不可用 | 保留稳定 tag、APK 和旧源码直到阶段 9 |

## 16. 执行顺序建议

下一步只执行“阶段 0 + 阶段 1”，不要直接同时迁移全部业务页面：

1. 固化当前功能与数据基线。
2. 建立新工程和通用组件。
3. 先用一个静态选票卡片验证按钮、边框、字体、图标和三档尺寸。
4. 用户确认基础视觉与交互后，再进入数据库迁移。

这样仍然是全量重构，但每一步都有可见成果、验收标准和回滚点，不会再次形成一份难以维护的新单体代码。

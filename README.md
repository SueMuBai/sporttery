# 彩果 · 体彩长期账单

“彩果”是一个用于管理体彩选票、官方赛果和长期投入回报的移动端应用。

当前版本已重构为 Vue 3 + TypeScript + Vant + Capacitor，不再运行 Python 本地网页服务。

## 主要能力

- 账单：日期筛选、投入/回款/盈亏汇总、进行中收益、完赛后回款修正。
- 选票：比赛、历史交锋、五种玩法、多选过关、奖金范围和方案保存。
- 方案：导入编辑、筛选、改名、标签、详情、组合和删除。
- 设置：同步参数、标签管理、数据更新、JSON/Markdown 导出。
- 赛果：增量同步官方结果，自动计算完成场次、猜对数量和当前收益。

## 技术栈

- Vue 3、TypeScript、Vite、Pinia、Vue Router、Vant 4。
- Android：Capacitor 7、Capacitor Community SQLite。
- 浏览器开发环境：IndexedDB。
- 测试：Vitest、Vue Test Utils、Playwright。

## 本地开发

需要 Node.js 22 和 npm：

```bash
npm install
npm run dev
```

浏览器访问 Vite 输出的本地地址，通常为 `http://localhost:5173`。

常用检查：

```bash
npm run typecheck
npm test
npm run lint
npm run build
```

## Android

- 应用名：`彩果`
- 包名：`com.suemubai.sporttery`
- 最低 Android：API 24

构建 Web 资源并同步 Android 工程：

```bash
npm run android:sync
```

新 App 直接加载打包后的 Vite 资源，不依赖 Chaquopy、Python 或 localhost HTTP 服务。

当前重构版使用独立的 `caiguo_app_v2` 数据库，不读取旧 Python 版本或前期重构测试包的数据。

## GitHub Actions

Windows 下生成正式签名 Key：

```cmd
scripts\generate_android_key.cmd
```

在 GitHub Actions secrets 中配置：

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

进入 GitHub Actions，手动运行 `Build signed Android APK`，填写版本名称和 Android version code。工作流会校验版本参数与全部签名 Secret，执行测试、Lint、Web 构建和 Capacitor 同步，并在构建后使用 Android `apksigner` 验证签名。

成功构建会保留 30 天，并同时提供：

- `app-release.apk`
- `app-release.apk.sha256`
- `build-info.txt`（提交 SHA、版本号、Workflow Run 地址及 APK 内嵌 Web 入口校验值）

只有用户明确要求“提交构建”时才应推送并触发该工作流。

## 旧数据备份

旧版数据库和 JSON 文件不再参与应用运行，且已从源码跟踪中移除。

完整架构与阶段记录见：

- `docs/APP_REFACTOR_PLAN.md`
- `docs/refactor/PROGRESS.md`
- `docs/refactor/BASELINE.md`
- `docs/refactor/ANDROID_ACCEPTANCE.md`
- `docs/refactor/ACCEPTANCE_MATRIX.md`

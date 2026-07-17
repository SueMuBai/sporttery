# 彩果 · 体彩长期账单

“彩果”用于管理体彩选票、官方赛果和长期投入回报。桌面版使用 Python 本地服务，Android 版使用 Capacitor WebView 并在 App 内运行相同的 Python/SQLite 服务。

## 功能

- 账单：按日期查看投注金额与净盈亏，进行中订单显示临时回款，可修正实际购买金额。
- 选票：比赛、历史交锋、胜平负、让球、比分、总进球、半全场、混合过关和方案管理。
- 设置：标签、历史场数、并发数、超时、重试次数和默认倍数。
- 赛果：同步体彩官方结果，自动结算方案和账单。

首次启动会将 `sporttery_history.json`、`sporttery_plans.json`、`sporttery_results.jsonl` 和 `sporttery_tags.json` 自动迁移到 `sporttery.db`。原文件保留为迁移备份，后续运行数据只写入 SQLite。

## 桌面版

需要 Python 3.9+，无第三方 Python 依赖：

```bash
python3 sporttery_web.py
```

浏览器访问 `http://127.0.0.1:8000`。不自动打开浏览器：

```bash
python3 sporttery_web.py --no-browser
```

命令行历史汇总仍可使用：

```bash
python3 sporttery_history.py --limits 10 --workers 4
```

## Android

- 应用名：`彩果`
- 包名：`com.suemubai.sporttery`

安装依赖并同步 Android 工程：

```bash
npm install
npm run android:sync
```

Windows 下生成正式签名 Key：

```cmd
scripts\generate_android_key.cmd
```

在 GitHub Actions secrets 中配置：

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

进入 GitHub Actions，手动运行 `Build signed Android APK`，然后下载 signed APK artifact 和 SHA-256 校验文件。

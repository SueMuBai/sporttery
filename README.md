# 体彩足球历史交锋汇总脚本

脚本先获取当前可投注足球比赛，再根据每场的 `matchId` 查询历史交锋，生成 Markdown 汇总和 JSON 数据。

## 使用

需要 Python 3.9+，无第三方依赖：

```bash
python3 sporttery_history.py
```

常用参数：

```bash
python3 sporttery_history.py --limits 10 --workers 4 \
  --output sporttery_history.md --json-output sporttery_history.json
```

查看全部参数：

```bash
python3 sporttery_history.py --help
```

输出中的胜、平、负和进失球均以当前比赛的主队为视角重新计算，不依赖接口内容易产生歧义的统计字段。

## Web 操作界面

启动本地界面：

```bash
python3 sporttery_web.py
```

浏览器会自动打开 `http://127.0.0.1:8000`。可在页面设置历史条数和并发数、执行查询、搜索比赛、展开交锋明细，以及下载 Markdown/JSON。

如不希望自动打开浏览器：

```bash
python3 sporttery_web.py --no-browser
```

# 重构阶段 0：旧版基线

记录时间：2026-07-18
基线提交：`450cf731aa7d13836fd162286881ef87b5c85813`
基线分支：`main`
最近稳定构建：GitHub Actions Run `29633400186`，版本 `1.0.1`

## 1. 工作区边界

- `sporttery_results.jsonl` 是用户运行数据，重构过程不得覆盖、清空或纳入源码提交。
- `img/` 是设计参考目录，已由 `.gitignore` 排除。
- 新架构完成数据迁移验收前，旧 Python、SQLite schema 和旧 Web 页面不得删除。
- 未收到“提交构建”指令时，不触发 GitHub APK 构建。

## 2. 旧实现规模

| 文件 | 行数 | 字节数 |
| --- | ---: | ---: |
| `web/index.html` | 474 | 187133 |
| `sporttery_web.py` | 487 | 23158 |
| `sporttery_db.py` | 410 | 19281 |

旧页面把 HTML、CSS、模板和业务 JavaScript 压缩在一个文件中。关键选择器在不同主题和页面覆盖层中多次出现，按钮和文字基线没有稳定来源。

## 3. 旧数据快照

以下只记录数量，不复制用户数据内容：

| 数据 | 数量 |
| --- | ---: |
| 当前比赛 | 10 |
| 历史请求错误 | 0 |
| 保存方案 | 8 |
| 标签 | 2 |
| 本地赛果追加记录 | 11 |

旧迁移源文件：

- `sporttery_history.json`：约 67 KB。
- `sporttery_plans.json`：约 9.6 KB。
- `sporttery_results.jsonl`：约 3.0 KB，持续变化。
- `sporttery_tags.json`：约 23 B。

## 4. 旧 API 能力清单

- `GET /api/latest`
- `GET|POST /api/plans`
- `POST /api/plans/delete`
- `POST /api/query`
- `GET /api/results`
- `POST /api/results/sync`
- `GET /api/ledger`
- `POST /api/ledger/update`
- `GET|POST /api/settings`
- `GET|POST /api/tags`
- `GET /api/tag-details`
- `POST /api/tags/delete`
- `POST /api/tags/rename`
- `POST /api/tags/reorder`
- `POST /api/save`
- `GET /download/json`
- `GET /download/markdown`

这些接口只作为新业务服务的能力对照，不要求保留 URL 或旧响应结构。

## 5. 资源基线

`web/assets/vote` 当前包含：

| 类型 | 数量 |
| --- | ---: |
| SVG | 137 |
| PNG | 273 |
| JSON | 13 |
| Markdown 标注文档 | 12 |
| CSS | 1 |
| XML | 1 |

新架构优先复用 SVG 功能图标；卡片边框、按钮背景、圆角和选中态改由 CSS/组件绘制。

## 6. 工具链基线

- Node.js：`v22.17.1`
- npm：`10.9.2`
- Python：`3.12.3`
- 当前 WSL 环境未发现 Java；Android 正式构建继续由 GitHub Actions 的 Java 21 环境负责。

## 7. 旧版自动测试基线

2026-07-18 执行：

```text
python3 -m unittest discover -s tests -v
Ran 3 tests in 0.383s
OK
```

通过的行为：

- 已删除方案的账单比赛仍在赛果同步范围。
- 赛果可结算账单，手工回款不会被自动结果覆盖。
- 标签颜色、改名和排序能够持久化。

这些测试将在新架构阶段 2、3 转换为 TypeScript 测试并继续保留。

## 8. 视觉问题基线

问题截图位于本地忽略目录 `img/issue/`：

- `文本不居中.jpg`
- `账单.jpg`
- `选票.jpg`
- `设置.jpg`

已确认的阻断问题：

- 按钮文字与按钮视觉中心不一致。
- 同类按钮高度、行高、padding 不一致。
- 边框在主题覆盖后消失或对比度过低。
- 图标、标题、卡片和可点击区域缺少统一组件约束。
- 不同页面仍残留旧绿色和晴空汽水蓝色两套视觉语言。

## 9. 阶段 0 验收结论

- [x] 记录稳定提交和构建信息。
- [x] 记录用户运行数据边界。
- [x] 记录旧数据数量，不复制敏感内容。
- [x] 记录旧 API、资源和工具链清单。
- [x] 执行旧版单元测试并记录结果。
- [x] 记录视觉问题截图位置。

阶段 0 已完成。旧数据迁移校验将在阶段 2 使用同一数量基线继续验证。

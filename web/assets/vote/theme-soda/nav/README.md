# 晴空汽水底部导航切图

## 文件

- `账单`：`ic_nav_bill_default` / `ic_nav_bill_selected`
- `选票`：`ic_nav_ticket_default` / `ic_nav_ticket_selected`
- `设置`：`ic_nav_settings_default` / `ic_nav_settings_selected`
- `bg_nav_selected_halo`：可选的选中态浅蓝背景；如果页面效果图不需要胶囊底，可不使用。

## 使用说明

- 图标基准尺寸28dp，最小点击区域48×48dp。
- 默认态使用灰蓝 `#9AA5B9`，选中态使用汽水蓝 `#5797F5`。
- 文字标签由客户端原生渲染，不包含在切图中。
- SVG为主源；PNG提供@1x/@2x/@3x。
- 切换状态建议使用150–180ms颜色/透明度动画，不缩放图标。

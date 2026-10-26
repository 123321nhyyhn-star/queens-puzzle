# 外观插件

入口仍是 `index.js`：在本目录写一个插件，import 后加入 `PLUGINS`。
同一类别的新选项会自动出现在外观面板，偏好由 `KIND` 的 key 存盘，未知 id 回退到第一项。

- 原有类别：`surfaces`、`marks`、`pieces`、`lifes`。
- 动作类别：`deals`（开局）、`reveals`（通关）、`confettis`（礼炮）。
- 每个选项提供 `id`、`name`、`desc`、`svg`（展柜预览）。
- 动作选项可提供 `play(ctx)`、`preload()`；开局还可提供 `capture(ctx)` 留下旧画面。
- 插件的 `stylesheet` 指向它自己在本目录下的 CSS，由运行器只加载一次。

```text
looks/
  index.js                登记、分类、默认项
  effects.js              通用动作接口：选择、取消、资源与时序
  transitions.js          斜向 / 逐行 / 涟漪翻格，皇冠猫咪 / 星空小兔拼图
  celebration.js          爱心 / 星芒 / 安静礼炮
  original-effects.js     交回作者原有动画的选项
  effects/tiles.js         翻格插件的画面工具
  effects/tiles.css        翻格插件的样式
  effects/celebration.css  礼炮插件的样式
  assets/                 插件自己的图片与生成提示词
```

`play(ctx)` 可同步返回，也可返回 `Promise<boolean>`。`false` 表示取消；图片加载失败时应返回 `true`，让游戏继续结算。
`ctx` 提供棋盘 DOM、格子、边长、区域快照、特效容器、`reducedMotion`、`signal`，以及开局的 `previous`。
`animate: false` 用于恢复已通关存档或切换已通关的图片，只显示静态画面，不重放星光装饰。插件必须在 `signal` 取消时清理定时器和节点。
完成后还要留在棋盘上的画面，用 `ctx.retain(cleanup)` 登记收尾；换盘前会保留它作为正面快照，装盘时再清理。
动画不修改游戏状态、撤销栈、存档内容、战绩或每日挑战规则。
切换外观只取消对应类别的动作。礼炮与拼图可以自由搭配；已通关时切换礼炮只更新偏好，不重建图片或重播庆祝。翻图期间切换礼炮会在图片完成后播放最终所选的样式一次。

基座只接通装盘前 / 后、恢复存档、胜利后和礼炮这几个调用点；具体变换、颜色、图片、粒子都在插件内。
`core/state.js`、`game/board.js`、`styles/base/board-states.css` 和样式入口恢复为作者加入每日挑战时的原版内容。
翻格的空隙、空白面及底板均使用 `--bg-body`，跟着页面背景色变化。

浏览器检查：`node tools/check-look-effects.mjs [url]`（Playwright；可通过 `NODE_PATH` 指向已有安装）。
切换回归：`node tools/check-look-switching.mjs [url]`，覆盖通关后切换、静态恢复及翻图期间连续切换。

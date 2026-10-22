# 皇后 Queens

打开即玩的皇后推理小游戏：每行、每列、每个色块各放一只皇后，皇后之间不能相邻。
支持 4×4–16×16，每盘唯一解，带难度评估、逐步提示、撤销、分享码与续玩。
设置里还有「挑战」：限时、禁用提示、禁用撤销。

## 快速开始

```bash
# 方式一：双击（Windows）
启动局域网游戏.bat

# 方式二：任意系统
python serve.py          # 默认 8080，被占用会自动往后找
npm start                # 同上，只是包了一层
```

> **不要直接双击 index.html。** 应用已拆成 ES 模块，`file://` 协议下浏览器会拦掉模块加载。
> 编辑器里用 Live Server 之类的静态服务也可以，只要走 http。

## 挑战

设置面板里「换一局」上面那一组，目前有三项。**跟棋盘大小、目标难度同一个规矩：
只写 `pending`，点「换一局」才落地**——中途改完不换局就等于没改，
开了限时又反悔也不用担心这局被倒计时追着跑（面板标题会变成「挑战 · 待换一局生效」）。

| 选项 | 作用 |
| --- | --- |
| 限时 | 3 / 5 / 10 / 20 分钟挡位，本局第一次操作后开始倒计时；超时判负，结果层第一按钮是「重试这一局」（同一盘棋重开，限时不换） |
| 禁用提示 | 「提示」按钮灰掉，键盘 `H` 也被拦住 |
| 禁用撤销 | 「撤销」按钮灰掉，`Z` / `Ctrl+Z` 也撤不动（「清空」不受影响） |

几个刻意的取舍：

- 挑战的落地时机就是 `btnShuffle`：`commitChallenge()` 把 `pending.*` 写进 `settings.*`，
  紧接着 `newGame()` → `applyBoard()` 再把 `settings.timeLimit` 落到 `state.limit`（起算点归零）。
- 剩余时间 = `限时 - (已用 - state.limitFrom)`。正常开局的 `limitFrom` 是 0，
  这个偏移量只是给「同一盘重试 / 特殊情况下补开限时」留的余地。
- **切后台不扣时间**：倒计时跟着 `elapsed` 走，`elapsed` 只在页面前台时增长，跟普通计时一致。
- 超时后 `state.status = 'lost'`：棋盘只读、按钮全灰、结果层不能 Esc 掉，
  必须选「重试这一局」或「换一局新的」。
- 限时与起算点写进对局存档，刷新之后倒计时接着走，不会白捡时间。

## 目录结构

```
.
├─ index.html              纯结构 + 资源引入（约 290 行，不再放样式和脚本）
├─ serve.py                局域网静态服务器（零依赖）
├─ 启动局域网游戏.bat / start-lan.sh
├─ src/
│  ├─ styles/              按加载顺序编号的样式片段
│  └─ js/
│     ├─ main.js           入口：启动流程 + 尺寸监听 + 调试探针
│     ├─ events.js         事件接线：所有 DOM 事件都绑在这里
│     ├─ engine/           出题 / 难度 / 提示三套引擎（经典脚本，双端通用）
│     ├─ core/             基础设施
│     ├─ game/             棋局逻辑
│     ├─ ui/               界面
│     └─ app/              流程编排
├─ docs/                   难度调研、提示可行性与文案库
└─ tools/                  回归测试、截图、调参脚本
```

### 分层与依赖方向

```
core  ←  game  ←  ui  ←  app
（基础设施）（棋局逻辑）（界面）（流程编排）
```

- **只能向下依赖**：`core` 不引用 `game / ui / app`，`game` 只引用 `core`，`ui` 引用 `core / game`。
- `events.js` 与 `main.js` 在最上层，可以引用任何模块。
- 有几处刻意保留的互相依赖，别硬拆（拆了反而更绕）：
  `ui/layout ↔ ui/guide`（重排要重画圈画层，引导翻页要重排）、
  `ui/settings ↔ ui/share`（面板里要刷新分享码，载入分享码要关面板）、
  `ui/guide → app/actions`（点「照做」要落子，落子又要收起面板）、
  `ui/share → app/puzzle`（载入分享码其实就是换一盘棋）。
  ESM 允许循环引用，**前提是只在函数体内用对方**——不要在模块顶层求值时读对方的值。

### 各目录里有什么

| 文件 | 职责 |
| --- | --- |
| `core/config.js` | 尺寸范围、存储键、难度档位、限时挡位（`LIMIT_OPTIONS`）、默认设置、皇后 SVG |
| `core/state.js` | 全局状态：`state`（局面）/ `settings`（设置）/ `pending`（面板里未生效的意向）/ `guide`（引导进度）/ `view`（视图层可变引用） |
| `core/dom.js` | 所有 DOM 元素引用，**只在这里取一次** |
| `core/utils.js` | `clamp`、读屏播报、时间格式化、脉冲动画、`svgEl` |
| `core/palette.js` | 18 色淡彩池 + 按邻接图做 Lab 色差分配 |
| `core/audio.js` | WebAudio 实时合成音效 + 震动 |
| `core/storage.js` | 设置与当前这局的存档（写盘 160ms 防抖），含限时与倒计时起点 |
| `core/clock.js` | 计时（只在有动作后起表）+ 限时剩余时间 `limitRemaining()` / 顶栏胶囊 `paintClock()` |
| `game/rules.js` | 自动打叉、被逼定位、冲突对、色块计数、填错的色块 |
| `game/geometry.js` | 格子边长、色块轮廓 path |
| `game/board.js` | 棋盘 DOM 构建 + 色块长按高亮 |
| `game/share-code.js` | 分享码编解码（纯函数，可单测） |
| `game/vibe.js` | 本局难度评估（转调 `engine/difficulty.js`） |
| `ui/render.js` | 把 state 画到 DOM：格子状态、描边、连线、红框防抖；工具栏按钮的可用状态 |
| `ui/layout.js` | 棋盘尺寸计算（浮层开关不许挪动棋盘） |
| `ui/guide.js` | 提示引导面板 + 棋盘圈画层 |
| `ui/hint.js` | 顶部提示行文案 |
| `ui/settings.js` | 设置面板（尺寸/难度/挑战只写 `pending`，点「换一局」才落地） |
| `ui/difficulty.js` | 难度标签与难度说明弹层 |
| `ui/share.js` | 分享面板：复制 / 粘贴载入 / `#QNS1-...` 链接开局 |
| `ui/win.js` | 胜利判定、礼花、结果层（解开 / 时间到共用一张卡）、`checkTimeout()` |
| `app/actions.js` | 玩家动作：点格语义、落子、清空 |
| `app/history.js` | 撤销 / 重做（整盘快照，最多 60 步；挑战里禁用时直接拦下） |
| `app/puzzle.js` | 出题与换盘：选尺寸 → 调引擎 → 生成遮罩 → 装上棋盘；`retryGame()` 原盘重开 |

### 样式

`src/styles/` 里的文件**按编号顺序加载**（`index.html` 里逐个 `<link>`），
`01-tokens.css` 放设计令牌，`16-responsive.css` 必须最后。新增片段时按顺序插号即可。

## 常见改动去哪儿改

| 想做的事 | 改哪里 |
| --- | --- |
| 改配色 / 圆角 / 阴影 | `src/styles/01-tokens.css` |
| 改色块底色池 | `src/js/core/palette.js`（用 `node tools/gen-palette.mjs` 生成候选） |
| 改顶栏 / 棋盘 / 面板外观 | 对应编号的 CSS 片段 |
| 加一个设置开关 | `core/config.js` 的 `DEFAULT_SETTINGS`、`index.html` 里加一行 `.switch-row`、`ui/settings.js` 的 `syncSheet` 与 `sheet` 的 click 分支 |
| 改限时挡位 | `core/config.js` 的 `LIMIT_OPTIONS`（面板按钮是按它生成的） |
| 加一项挑战 | 照「限时 / 禁用提示 / 禁用撤销」三件套：`DEFAULT_SETTINGS` + `pending`（`core/state.js`）+ `index.html` 的 `.challenge` 块 + `ui/settings.js` 的 `syncSheet`/`commitChallenge` + 动作入口里 `settings.xxx` 一拦 |
| 改超时判负的时机 | `core/clock.js` 的 `limitExpired`、`ui/win.js` 的 `checkTimeout`（由 `main.js` 的 250ms 心跳调用） |
| 改出题规则 | `src/js/engine/engine.js`（改动后跑 `node tools/test-engine.mjs`） |
| 改提示措辞 / 推理等级 | `src/js/engine/hint.js`（`node tools/test-hint.mjs`） |
| 改难度评分 | `src/js/engine/difficulty.js` + `game/vibe.js` |
| 加键位 / 手势 | `src/js/events.js` |

不要在两个模块里各建一份状态：新状态加进 `core/state.js`，需要可变引用就挂到 `view` 上。

## 测试

先起服务（`python serve.py --no-open`），再跑：

```bash
npm test                 # 全量端到端回归（tools/e2e.mjs，100+ 项）
node tools/test-engine.mjs   # 出题引擎（唯一解、连通性）
node tools/test-hint.mjs     # 提示引擎
node tools/check-challenge.mjs   # 挑战：限时 / 禁用提示 / 禁用撤销（60 项）
```

`tools/` 里还有一批针对性检查（难度标签与模型一致性、拖动涂抹、引导面板布局等），
以及 `shots/` 目录下的大量截图脚本，需要时按文件名挑。

所有这些脚本依赖 `window.__QUEENS_DEBUG__`（见 `main.js` 末尾）暴露的只读探针，
调 UI 时别把它删了。

## 后续打包

现在没有构建工具，浏览器原生跑 ESM。将来要打包时：

1. 以 `index.html` 为入口，Vite / Rollup 能直接吃掉这套原生模块，无需改代码；
2. `src/js/engine/` 三个文件是「经典脚本 + CJS 双模」，浏览器里挂在 `window.Queens*`、
   Node 里用 `require`（`tools/` 大量依赖）。要转成纯 ESM 时，记得同步改 `tools/` 的 `require`；
3. `index.html` 里的 16 个 `<link>` 会被打包器自动合并，不用手工合并 CSS。

## 约定

- 键盘：`X` 标叉、`Q`/`Enter` 放皇后、`Z` 撤销、`Shift+Z` 重做、`H` 提示、`N` 新局、`Esc` 关浮层。
  挑战里禁用撤销 / 提示时，`Z` 与 `H` 只会换一句「挑战模式：这局不能…」。
- 存档键：`queens.settings.v1` / `queens.game.v1`（改结构要升版本号）。
- 对局存档里的 `limit` / `limitFrom` 是挑战的限时与倒计时起点，老存档没有也照样读。
- 分享码格式：`QNS1-<边长>-<色块>-<解>-<校验>`，见 `game/share-code.js`。

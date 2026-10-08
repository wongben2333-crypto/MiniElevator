# 08 · 交接与进度（Handoff）

> 面向"下一个会话/下一个我"。读完本文即可无缝接手。
> 最后更新：2026-10-09。

---

## 1. 一句话状态

**可玩 MVP + M3 完成，M4 移动端触控已完成**：Canvas 2D + TypeScript + Vite + Vitest，运行期 0 依赖；`npm.cmd test` **180 项通过 / 27 文件**，`typecheck`、`build`、`build:demo` 均通过；本轮新增移动端竖屏布局 + 高清渲染、底部控制栏（暂停 / 1× / 2×）、可点按升级卡、功能层中文命名、线路按可达停靠范围截断、电梯上限 5 部、一天 120s、按楼层加权的出生分布与每层具体目的地 `Passenger.destFloor`。

**评审门禁已关闭**（独立复核）：
- BLOCKER-2「假一天测试」→ **PASS**：`integration_shipped.test.ts` 使用真实出厂配置（现为 120s/天）。
- BLOCKER-1「终点滞留」→ 原修复**只覆盖简单情形**：持续同向需求下，远端终点的反向队列仍会饿死（且受停靠时长奇偶影响）。已**彻底**修复（LOOK 扫楼 + 目的区到达送达），并补回归测试 `tests/dispatch_starvation.test.ts`。
- 附带修复：`dropOrphanedRiders` 把乘客丢在自身目的区时会留下 `plan=[]` 的永久滞留者——现已在到达目的区时判定送达。

## 2. 环境与命令（重要）

- 平台：Windows / PowerShell 5.1。**`npm.ps1` 被执行策略禁用 → 一律用 `npm.cmd`**（或 `npx.cmd`）。
- 目录：`E:\MiniElevator`（git 仓库，分支 `master`，**无 remote**）。

| 命令 | 作用 |
|---|---|
| `npm.cmd install` | 安装开发依赖（首次） |
| `npm.cmd run dev` | Vite 开发服务器（默认 5173） |
| `npm.cmd test` | Vitest 全量测试 |
| `npm.cmd test -- <filter>` | 只跑匹配文件 |
| `npm.cmd run typecheck` | `tsc --noEmit` |
| `npm.cmd run build` | 生产构建到 `dist/` |
| `npm.cmd run build:demo` | 构建并生成单文件试玩版 `demo/vertical-rush.html`（双击即玩） |
| `npm.cmd run preview` | 本地预览 `dist/` 生产构建 |

> 移动端 QA 视口：Playwright **390×844 / DPR 3 触屏**、桌面居中列、横屏三档；`npx.cmd` 同样在 Windows PowerShell 下使用。

## 3. 已实现范围（M0–M3 完成，M4 部分完成）

| 模块 | 文件 | 职责 |
|---|---|---|
| 类型契约 | `src/types.ts` | World / Elevator / Passenger（含可选 `destFloor`）/ Command / SimConfig … |
| 随机 | `src/rng.ts` | mulberry32（确定性）+ 加权抽样 `pickWeighted`（一次抽样一次 `next()`） |
| 配置 | `src/config.ts` | 平衡参数、楼层命名 `BUILDING`、`MAX_ELEVATORS`、出生权重 `spawnOriginWeight`/`spawnDestWeight`、评分目标 `SCORE_TARGETS` |
| 查询 | `src/queries.ts` | 只读访问：`pendingBoard`/`pendingAlight`/`floorsMatching` |
| **寻路** | `src/route.ts` | `(floor,elevator)` 图；BFS（最少换乘→最少站）与带权 A*；`findPlan` 按 `cfg.routeMode`；`planPassenger` 精确层→回退目的区 |
| **调度** | `src/dispatch.ts` | LOOK 扫楼、5 种策略、`includeCurrent`；当前方向有任意请求即不调头（防远端终点饥馑） |
| 几何 | `src/view.ts` | 剖面坐标映射 + 命中测试 + 停靠插入索引（纯函数）；布局/命中区：`stopExtent`、`portraitLayout`、`controlBarLayout`、`upgradeOptionRects` |
| 系统 | `src/systems/daycycle.ts` | 时段（晨/午/晚/夜）+ 日界升级 + 楼层加建（每日顶部 +1 层至 20F） |
| 系统 | `src/systems/spawn.ts` | 按楼层加权出生（功能层到达/出发更多）+ 具体目的地 `destFloor`，无路线则跳过生成 |
| 系统 | `src/systems/movement.ts` | IDLE→MOVING→DWELL 状态机、插值用 `posPrev` |
| 系统 | `src/systems/boarding.ts` | 先下后上、容量/团体、终点幂等调头方向 |
| 系统 | `src/systems/pressure.ts` | 楼层压力、耐心衰减、过载失败 |
| 编排 | `src/sim.ts` | `createWorld`/`step`（固定顺序）/`applyCommand`（改线重规划、下客孤立乘客） |
| **评分** | `src/score.ts` | 生存星级（1★/天，封顶 3★）+ 0..100 综合分（纯逻辑） |
| **回放** | `src/replay.ts` | seed + 命令流：`ReplayLog` 序列化/校验 + `runReplay` 确定性重建（纯逻辑，内部 API） |
| 渲染 | `src/render.ts` | Canvas 剖面：楼层/乘客/电梯/压力条/换乘连线；颜色线按 `stopExtent` 截断到实可达停靠范围 |
| HUD | `src/hud.ts` | 统计、评级/综合分、过载浮层（命名瓶颈层）、升级浮层、**底部控制栏**、可点按升级卡、电梯到顶提示 |
| 输入 | `src/input.ts` | 触屏/鼠标统一：点按「电梯×楼层」切换停靠、点轿厢选中/切策略、**点按升级卡**、空格暂停、`1/2` 选升级 |
| 主循环 | `src/main.ts` | 固定步长（60Hz，追帧上限 5）+ 接线；按 `devicePixelRatio` 高清渲染、`ResizeObserver`/`orientationchange` 重算；`window.__verticalRush` QA 桥 |
| 测试 | `tests/*.test.ts` | 27 文件 / 180 用例（新增见 §4） |

**架构铁律**：`src/*.ts` 除 `render/input/hud/main` 外**不得引用 DOM**（`tests/no_dom_import.test.ts` 强制守卫，自动覆盖 `score.ts`/`replay.ts`）。

## 4. 测试与验证现状

- 测试文件 **27 个 / 180 用例**：`rng`(+`rng_weighted`) / `queries` / `route(BFS+A*)` / `dispatch`(+终点饥馑回归) / `view`(命中 + toggleStop + `view_layout` 布局) / `config_names`(楼层中文名 + 电梯上限) / `spawn_distribution` + `dest_floor_fallback` / `sim_elevator_cap` / 5 个系统(含movement 加/减速与 boarding 门时) / sim 编排 / **出厂配置三日存活 + 无孤立等待者** / `score` / `replay` / sim 加建楼层 / 2 日集成 / DOM 纯净守卫 / 确定性。
- 本轮新增测试文件：`tests/view_layout.test.ts`、`tests/rng_weighted.test.ts`、`tests/config_names.test.ts`、`tests/spawn_distribution.test.ts`、`tests/dest_floor_fallback.test.ts`、`tests/sim_elevator_cap.test.ts`。
- 手动 QA（Playwright，真实页面）已验证：
  - 送达、换乘（`transfers > 0`）；
  - 点按格子切换停靠：电梯 0 停靠 `[-1,1,2,3,4,5]` → 点 4F 后 `[-1,1,2,3,5]`；
  - 到达第 2 天、升级浮层、`1/2` 选择生效、**升级卡点按可跨天**；
  - 过载失败浮层正确命名瓶颈楼层；
  - 评分/星级：实时面板 `评级 ★★★`、过载浮层 `评价 ★★★ · 综合分 71 · 存活 3 天 · 送达 220 人`。
  - **移动端竖屏**（390×844 / DPR 3 触屏）：布局与底部栏正常；点按「电梯×楼层」精确切换停靠；`1×` ≈64 tick/s、`2×` ≈120 tick/s；**第 10 天无滞留乘客**；0 控制台错误。
  - 桌面居中列与横屏（「请竖屏使用」提示）同样核验通过。

## 5. 关键设计决策（勿推翻）

- 运行期 **0 依赖**；Vite/Vitest/TS 仅 devDependency。
- 固定步长 60Hz，tick 为整数；`sim.step` 独占 tick 递增；系统不得递增 tick。
- 确定性：单一 seed → `mulberry32`；回放见 `src/replay.ts`，可用于调平衡。
- 寻路从 **`passenger.atFloor`** 起算（支持换乘中途重规划）。
- 调度：LOOK 扫楼——当前方向只要还有**任意**请求（不分上下）就继续前进，仅在严格前方无请求且本层有反向排队时调头；停靠方向在每次停靠**幂等**决定，不逐 tick 翻转。
- 评分：星级 = 生存天数（1★/天，封顶 3★）；综合分 0..100（`src/score.ts`）。
- 加建：每日日界顶部 +1 层（封顶 20F，`growthFloor` 确定性分区 office/retail/residential），**不自动接入电梯**，需玩家改线。
- 运动：电梯有加速度与到站减速（`accel`），开门时长随上下客人数（`dwellTime` + 人数×`boardTimePerPerson`）。
- **外观**：极简扁平、**浅色纸张主题**，对齐 Mini Metro（见 [01 §9](01-game-design.md)）；**不做音效/音频**。
- **移动端竖屏优先**：`index.html` 居中手机列 `min(100vw,460px) × 100dvh`，`viewport-fit=cover` + safe-area + `touch-action:none`；`main.ts` 按 `devicePixelRatio` 放大后备缓冲并 `setTransform`，render/hud 内部统一用**逻辑（CSS）像素**，不做 DPR 相关的坐标换算；横屏只提示「请竖屏使用」，不做旋转布局。
- **移动端无键盘**：日终升级必须可**点按卡片**（`upgradeOptionRects`），键盘 `1`/`2` 保留为桌面快捷键；底部控制栏提供暂停/继续与 `1×`/`2×`。
- **2× 只加速模拟**：变速通过多跑固定步长实现，渲染仍按真实帧率插值，保持平滑。
- **电梯上限**：`MAX_ELEVATORS = 5`；到顶后日终升级只提供「容量 +4」，浮层提示「电梯已达上限（5 部）」。
- **出生分布**：按楼层加权（`ZONE_SPAWN_WEIGHTS` / `SPECIAL_SPAWN_WEIGHTS`），功能层到达/出发更多，但整体更随机；每名乘客带**具体目的地** `Passenger.destFloor`，`planPassenger` 先寻精确层、不可达回退到目的区、再不可达则**跳过生成**（不产生滞留乘客）。
- `view.ts` 现导出 `stopExtent`/`portraitLayout`/`controlBarLayout`/`upgradeOptionRects`，布局常量集中在此，勿散落到 render/hud。
- 乘客路径核心算法已获评审认可，勿过度改动。

## 6. 当前平衡参数（`src/config.ts`）

- 电梯：低区 `[-1,1,2,3,4,5]`、高区 `[1,5,6,7,8,9,10]`；容量 10、速度 1.6 层/秒；**上限 `MAX_ELEVATORS = 5` 部**。
- 楼层命名：功能层中文名（B1 停车场、1F 大堂、5F 空中大堂、9F 餐厅、10F 屋顶酒吧）；普通办公/住宅/加建层保持 `NF`。
- 出生率（人/秒）：晨 0.30 / 午 0.15 / 晚 0.30 / 夜 0.06；日增长 +15%/天。
- 出生权重（zone: 出发/到达）：office 1.0/1.0、residential 1.1/1.1、retail 1.1/1.4、lobby 2.0/2.0、special 1.5/1.8；功能层：skyLobby 2.2/2.2、restaurant 1.8/2.2、skybar 1.8/2.2、parking 1.3/1.3、lobby 2.0/2.0。
- 压力阈值 600 tick（10s）；**一天 `dayLengthTicks` 7200 tick（120s）**。
- 运动：最大速度 2 层/秒，加速度 4 层/秒²；开门时长 = 1.2s + 0.4s × 上下客人数。
- 乘客耐心 60s；`passengerCap` 300。
- 评分目标 `SCORE_TARGETS`：delivered 200 / wait 12s / energyPer 5.5 / transferRate 0.15。

## 7. 已知问题 / 未决项

| 级别 | 项 | 状态 |
|---|---|---|
| 评审门禁 | BLOCKER-1 终点滞留 | ✅ 已**彻底**修复（LOOK 扫楼 + 目的区到达送达），回归 `tests/dispatch_starvation.test.ts` |
| 评审门禁 | BLOCKER-2 假一天测试 | ✅ **PASS**：`integration_shipped.test.ts` 用真实出厂日长（现120s）跑 7 seed × 3 日 |
| 缺陷 | `dropOrphanedRiders` 停在自身目的区 → `plan=[]` 永久滞留 | ✅ 已修（到达目的区即送达；剔除悬空 load id；清 `onElev`） |
| NOTE | `ZONE` 策略当前等价 `SCAN` | 未实现差异化（非阻塞） |
| NOTE | `backtrackPenalty` / `transferThreshold` 定义但未使用 | 文档如此，代码未接（非阻塞） |
| NOTE | 满载同层停靠会有 IDLE↔DWELL 空转 | 良性，非死锁 |
| NOTE | `addElevator` 不去重 `stops`；停靠表若乱序则空间序判定有偏差 | 低危，未处理 |
| M3 | 评分/星级、存档/回放 | ✅ 完成（`src/score.ts` + HUD；`src/replay.ts` 内部 API） |
| M3 | 楼层加建 + 租户入驻 | ✅ 完成（每日 +1 层至 20F；不自动延伸停靠，玩家自行接入） |
| M4 | 视觉/UI 极简化 | 🟡 首轮完成（圆角/留白/低对比结构线；持续打磨） |
| M4 | 时段光照 | ✅ 完成（背景色温随时段暖→冷） |
| M4 | 移动端触控 | ✅ 完成（竖屏布局 + DPR 高清渲染 + 底部控制栏 + 可点按升级卡 + 横屏提示） |
| M4 | 突发事件、多地图、进阶升级 | 未做 |
| NOTE | 横屏仅提示、不做旋转布局 | 有意为之（竖屏优先） |
| 方向 | 音效/音频 | ❌ 明确不做 |

## 8. 下一步建议（按优先级）

1. **M4**：突发事件系统（停电/检修/演练/VIP）、多建筑地图、跨楼连廊/双层轿厢等进阶升级。（不做音效。）
2. **视觉/UI 极简化**：首轮已完成（`render.ts`/`hud.ts`），可持续打磨。
3. **可选**：实现 `ZONE` 差异化、接入 `backtrackPenalty`（防止换乘抖动）、无头 KPI 跑分脚本、`addElevator` 去重 `stops`。

## 9. 提交风格（沿用）

中文简体、陈述式短句；每个原子提交附：

```
Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)
Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>
```

（用 `git commit -m "<标题>" -m "<footer>" -m "<co-author>"`；PowerShell 下中文用 `-F` 文件更稳。）

## 10. 新会话启动提示词

见下方"启动提示词"章节，直接复制到新会话即可。

---

## 启动提示词

```
我在 E:\MiniElevator 开发一款受 Mini Metro 启发的「电梯调度」游戏（工作名《垂直都市 / Vertical Rush》）。
上一会话已完成可玩 MVP + M3 与 M4 移动端触控，请先读文档再接续：

【必读】
- README.md、docs/01-game-design.md ~ docs/08-handoff.md（尤其 08 交接、06 路线图、03 寻路、04 调度、05 数据模型、02 架构）

【当前状态】
- 已完成 M0–M3，M4 的**移动端触控已完成**（升级二选一、评分/星级、seed+命令流回放、每日加建楼层、竖屏布局、底部控制栏）；Canvas2D + TypeScript + Vite + Vitest；运行期 0 依赖。
- `npm.cmd test` → 180 通过（27 文件）；`npm.cmd run typecheck`、`npm.cmd run build`、`npm.cmd run build:demo` 均通过。
- 架构铁律：src/{sim,route,dispatch,view,systems,config,queries,rng,types,score,replay}.ts 不得引用 DOM（有守卫测试）。
- 固定步长 60Hz；确定性随机；寻路从 passenger.atFloor 起算；调度为 LOOK 扫楼（当前方向有任意请求即不调头）。
- 移动端：竖屏 `min(100vw,460px) × 100dvh` + DPR 高清渲染；移动端无键盘 → 升级必须可点按卡片；`2×` 只加速模拟。
- 平衡：`dayLengthTicks` 7200（120s）；电梯上限 `MAX_ELEVATORS=5`；出生按楼层加权，乘客带 `Passenger.destFloor`（不可达回退目的区，再不可达跳过生成）。
- 评审门禁已关闭（BLOCKER-1 已彻底修复 + 回归测试；BLOCKER-2 PASS）。

【产品方向】
- 外观/UI：极简扁平，对齐 Mini Metro（见 docs/01-game-design.md §9）。
- 明确不做音效 / 音频。

【环境注意】
- Windows PowerShell：npm.ps1 被禁用，一律用 `npm.cmd` / `npx.cmd`。
- 仓库无 remote。

【本次任务】（择一或按序，先问我确认）
1. M4：突发事件系统、多建筑地图、跨楼连廊/双层轿厢等进阶升级。
2. 视觉/UI 极简化打磨（首轮已完成）。
3. 可选：ZONE 策略差异化、接入 backtrackPenalty、添加无头 KPI 跑分脚本。

【工作方式】
- 轻量优先、不过度设计；Logic 改动走 TDD（先失败测试再实现）。
- 每个原子提交用中文陈述式信息 + Sisyphus 署名 footer（见 docs/08-handoff.md §9）。
- 完工前用 `npm.cmd test` + `typecheck` + `build` 验证；UI 改动用 Playwright 截图核验。
```

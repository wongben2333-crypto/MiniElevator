# 08 · 交接与进度（Handoff）

> 面向"下一个会话/下一个我"。读完本文即可无缝接手。
> 最后更新：2026-10-06。

---

## 1. 一句话状态

**MVP 已完成并可玩**：Canvas 2D + TypeScript + Vite + Vitest，运行期 0 依赖；`npm.cmd test` **103 项通过 / 18 文件**，`typecheck`、`build` 均通过；Playwright 手动 QA 已验证核心交互与失败/升级流程。

**评审门禁已关闭**（本轮独立复核）：
- BLOCKER-2「假一天测试」→ **PASS**：新增的 `integration_shipped.test.ts` 使用真实出厂配置（180s/天），非加速日。
- BLOCKER-1「终点滞留」→ 原修复**只覆盖简单情形**：在持续同向需求下，远端终点的反向队列仍会饿死（且受停靠时长奇偶影响）。已于本轮彻底修复（LOOK 扫楼 + 目的区到达送达），并补回归测试。
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

## 3. 已实现范围（M0–M2 + M3 部分）

| 模块 | 文件 | 职责 |
|---|---|---|
| 类型契约 | `src/types.ts` | World / Elevator / Passenger / Command / SimConfig … |
| 随机 | `src/rng.ts` | mulberry32（确定性） |
| 配置 | `src/config.ts` | 平衡参数、楼层、电梯规格、出生率 |
| 查询 | `src/queries.ts` | 只读访问：`pendingBoard`/`pendingAlight`/`floorsMatching` |
| **寻路** | `src/route.ts` | `(floor,elevator)` 图；BFS（最少换乘→最少站）与带权 A*；`findPlan` 按 `cfg.routeMode` |
| **调度** | `src/dispatch.ts` | LOOK/SCAN、5 种策略、`includeCurrent`、无路时可回退到"任意有请求的层"防滞留 |
| 几何 | `src/view.ts` | 剖面坐标映射 + 命中测试 + 停靠插入索引（纯函数） |
| 系统 | `src/systems/daycycle.ts` | 时段（晨/午/晚/夜）+ 日界升级 |
| 系统 | `src/systems/spawn.ts` | 按阶段出生率生成乘客并预分配路线 |
| 系统 | `src/systems/movement.ts` | IDLE→MOVING→DWELL 状态机、插值用 `posPrev` |
| 系统 | `src/systems/boarding.ts` | 先下后上、容量/团体、终点调头方向解析 |
| 系统 | `src/systems/pressure.ts` | 楼层压力、耐心衰减、过载失败 |
| 编排 | `src/sim.ts` | `createWorld`/`step`（固定顺序）/`applyCommand`（改线重规划、下客孤立乘客） |
| 渲染 | `src/render.ts` | Canvas 剖面：楼层/乘客/电梯/压力条/换乘连线 |
| HUD | `src/hud.ts` | 统计、过载浮层（命名瓶颈层）、升级浮层 |
| 输入 | `src/input.ts` | 选中电梯、拖拽改停靠表、切策略、空格暂停、`1/2` 选升级 |
| 主循环 | `src/main.ts` | 固定步长（60Hz，追帧上限 5）+ 接线；`window.__verticalRush` QA 桥 |

**架构铁律**：`sim/route/dispatch/view/systems` **不得引用 DOM**（`tests/no_dom_import.test.ts` 强制守卫，`src/render/input/hud/main` 除外）。

## 4. 测试与验证现状

- 测试文件 18 个，103 用例：rng / queries / route(BFS+A*) / dispatch / view / 5 个系统 / sim 编排 / **出厂配置三日存活 + 无孤立等待者** / **dispatch 终点饥馑回归** / 2 日集成 / DOM 纯净守卫 / 确定性。
- 手动 QA（Playwright，真实页面）已验证：
  - 送达、换乘（`transfers > 0`）；
  - 拖拽改线：电梯 0 停靠 `[-1,1,2,3,4,5]` → `[-1,1,2,3,4,5,7,8,9,10]`；
  - 到达第 2 天、升级浮层、`1/2` 选择生效；
  - 过载失败浮层正确命名瓶颈楼层；
  - 修复后（seed 3）：第 2 天，`delivered=72`，10F 最大等待=1，无 game over（修复前同日 `delivered=24` 且过载）。

## 5. 关键设计决策（勿推翻）

- 运行期 **0 依赖**；Vite/Vitest/TS 仅 devDependency。
- 固定步长 60Hz，tick 为整数；`sim.step` 独占 tick 递增；系统不得递增 tick。
- 确定性：单一 seed → `mulberry32`；可用于回放/调平衡。
- 寻路从 **`passenger.atFloor`** 起算（支持换乘中途重规划）。
- 调度：LOOK 扫楼——当前方向只要还有**任意**请求（不分上下）就继续前进，仅在严格前方无请求且本层有反向排队时调头；停靠方向在每次停靠**幂等**决定，不逐 tick 翻转（避免过早调头让远端终点队列饿死、也避免方向抖动）。
- 乘客路径核心算法已获评审认可，勿过度改动。

## 6. 当前平衡参数（`src/config.ts`）

- 电梯：低区 `[-1,1,2,3,4,5]`、高区 `[1,5,6,7,8,9,10]`；容量 10、速度 1.6 层/秒。
- 出生率（人/秒）：晨 0.30 / 午 0.15 / 晚 0.30 / 夜 0.06；日增长 +15%/天。
- 压力阈值 600 tick（10s）；一天 10800 tick（180s）。

## 7. 已知问题 / 未决项

| 级别 | 项 | 状态 |
|---|---|---|
| 评审门禁 | BLOCKER-1 终点滞留 | ✅ 已**彻底**修复：原修复（`e86aad4`）只覆盖简单情形——持续同向需求下远端终点的反向队列仍会饿死，且受停靠时长奇偶影响。本轮改为 LOOK 扫楼 + 目的区到达送达，并加回归测试 `tests/dispatch_starvation.test.ts` |
| 评审门禁 | BLOCKER-2 假一天测试 | ✅ **PASS**：`integration_shipped.test.ts` 用真实出厂配置（180s/天）跑 7 seed × 3 日，并断言无孤立等待者 |
| 缺陷 | `dropOrphanedRiders` 把乘客停在自身目的区 → `plan=[]` 永久滞留 | ✅ 已修（到达目的区即送达；剔除悬空 load id；清 `onElev`） |
| NOTE | `ZONE` 策略当前等价 `SCAN` | 未实现差异化（非阻塞） |
| NOTE | `backtrackPenalty` / `transferThreshold` 定义但未使用 | 文档如此，代码未接（非阻塞） |
| NOTE | 满载同层停靠会有 IDLE↔DWELL 空转 | 良性，非死锁 |
| NOTE | `addElevator` 不去重 `stops`；停靠表若乱序则空间序判定有偏差 | 低危，未处理 |
| M3 | 评分/星级、存档/回放 | 未做 |
| M4 | 突发事件、音效、多地图、移动端 | 未做 |

## 8. 下一步建议（按优先级）

1. **关闭评审门禁**：重跑回传复核（reviewer 会话 `ses_ef30bc3ffeU9x0cKTWABDU4W`，可用 `task_id` 续）或新起一个 ultrabrain 评审。
2. **M3**：评分与星级、`seed + 命令流` 存档/回放（架构已就绪，`Command` 已定义）。
3. **M4**：突发事件系统（停电/检修/演练/VIP）、WebAudio 音效、多建筑地图、移动端触控。
4. **可选**：实现 `ZONE` 差异化、接入 `backtrackPenalty`（防止换乘抖动）、无头 KPI 跑分脚本。

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
上一会话已完成可玩 MVP，请先读文档再接续：

【必读】
- README.md、docs/01-game-design.md ~ docs/08-handoff.md（尤其 08 交接、06 路线图、03 寻路、04 调度、05 数据模型、02 架构）

【当前状态】
- 已完成 M0–M2 + M3 部分（升级二选一：新增电梯/容量）；Canvas2D + TypeScript + Vite + Vitest；运行期 0 依赖。
- `npm.cmd test` → 99 项通过（17 文件）；`npm.cmd run typecheck`、`npm.cmd run build` 均通过。
- 架构铁律：src/{sim,route,dispatch,view,systems,config,queries,rng,types}.ts 不得引用 DOM（有守卫测试）。
- 固定步长 60Hz；确定性随机；寻路从 passenger.atFloor 起算；登梯同向优先、无同向工作时调头。
- 评审曾提 2 个 BLOCKER，已修复并提交（e86aad4/9cc75a0/28b02e0），但回传复核会话被中断，尚未正式关闭。

【环境注意】
- Windows PowerShell：npm.ps1 被禁用，一律用 `npm.cmd` / `npx.cmd`。
- 仓库无 remote。

【本次任务】（择一或按序，先问我确认）
1. 关闭评审门禁：重跑/接手 reviewer 会话 ses_ef30bc3ffeU9x0cKTWABDU4W 复核两个 BLOCKER；或新起 ultrabrain 评审。
2. M3：实现评分/星级与 `seed + 命令流` 存档/回放。
3. M4：突发事件系统、WebAudio 音效、多建筑地图、移动端触控。
4. 可选：实现 ZONE 策略差异化、接入 backtrackPenalty、添加无头 KPI 跑分脚本。

【工作方式】
- 轻量优先、不过度设计；Logic 改动走 TDD（先失败测试再实现）。
- 每个原子提交用中文陈述式信息 + Sisyphus 署名 footer（见 docs/08-handoff.md §9）。
- 完工前用 `npm.cmd test` + `typecheck` + `build` 验证；UI 改动用 Playwright 截图核验。
```

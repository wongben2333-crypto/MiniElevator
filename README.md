# 垂直都市 · Vertical Rush

> 一款受 **Mini Metro** 启发的电梯调度游戏：用"画线路"的方式设计一栋摩天大楼的垂直交通系统，看它在早晚高峰里活起来。
>
> **地铁的皮，电梯的骨，调度的魂。**

---

## 项目状态

| 项 | 状态 |
|---|---|
| 阶段 | **可玩 MVP + M3 完成**（M0–M3） |
| 测试 | `npm.cmd test` 117 通过 / 21 文件；typecheck、build 通过 |
| 定位 | 个人实验项目，**轻量优先** |
| 技术基调 | Canvas 2D + TypeScript + Vite + Vitest，**运行期 0 依赖** |
| 参考 | Mini Metro（Dinosaur Polo Club）的乘客寻路与"观察型系统"设计 |

## 试玩 / 运行

**试玩版（单文件，双击即玩）**：`npm.cmd run build:demo` → 生成 `demo/vertical-rush.html`，直接用浏览器打开即可（已内联全部 JS/CSS，无需服务器）。

**开发运行**：`npm.cmd install` → `npm.cmd run dev`（默认 http://localhost:5173）。也可 `npm.cmd run build` + `npm.cmd run preview`。

**操作**：拖拽楼层 = 编辑所选电梯的停靠表；点击轿厢 = 选中 / 再点切换策略；空格 = 暂停；`1` / `2` = 选择每日升级。

> Windows 下一律用 `npm.cmd` / `npx.cmd`（`npm.ps1` 被执行策略禁用）。可用 `?seed=3` 指定随机种子。当前状态见 [08 · 交接与进度](docs/08-handoff.md)。

## 设计原则（不可违背）

1. **轻量**：不引游戏引擎，不引 ECS 框架，不引状态库。MVP 甚至可单文件零构建。
2. **确定性**：固定步长模拟 + 种子随机，逻辑可在 node 无头运行，便于调平衡。
3. **模拟与渲染分离**：`sim/` 与 `route/` 不 import 任何 DOM/Canvas 代码。
4. **观察 > 微操**：玩家设计"拓扑 + 策略"，系统自动运转，干预最小化。
5. **不为未来过度设计**：见 [路线图 · 不做清单](docs/06-roadmap.md#不做清单)。
6. **极简外观**：扁平、留白、颜色/形状承载信息，向 Mini Metro 看齐（见 [01 §9](docs/01-game-design.md)）；**不做音效**。

## 文档导航

| 文档 | 内容 |
|---|---|
| [01 · 游戏设计（GDD）](docs/01-game-design.md) | 定位、对应关系、核心循环、系统拆解、难度、美术/UI（极简）、风险 |
| [02 · 技术选型与架构](docs/02-architecture.md) | 技术栈、依赖、分层、主循环、目录结构、性能 |
| [03 · 乘客寻路算法](docs/03-pathfinding.md) | 图模型 (楼层,电梯)、边权公式、A*、重算时机 |
| [04 · 电梯调度](docs/04-dispatch.md) | 轿厢状态机、SCAN/LOOK、调度策略、空驶优化 |
| [05 · 数据模型](docs/05-data-model.md) | TypeScript 数据结构与接口定义 |
| [06 · 路线图](docs/06-roadmap.md) | M0–M4 里程碑、MVP 范围、验收标准、不做清单 |
| [07 · 参考与来源](docs/07-references.md) | 研究来源与我方借鉴点 |
| [08 · 交接与进度](docs/08-handoff.md) | 当前状态、命令、未决项、下一步、新会话启动提示词 |

## 下一步

见 [08 · 交接与进度](docs/08-handoff.md) §8。优先级：M4（突发事件 / 多地图 / 移动端；**M3 已完成**、**极简化与光照已完成**；**不做音效**）。

## 命名

工作名 **《垂直都市 / Vertical Rush》**，最终名待定。

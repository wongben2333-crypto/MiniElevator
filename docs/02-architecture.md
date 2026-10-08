# 02 · 技术选型与架构

> 上层入口见 [README](../README.md)。本文目标：**在够用的前提下把依赖和层数降到最少**。

---

## 1. 选型结论

> **Canvas 2D（原生）+ TypeScript（可选，仅类型）+ Vite（仅 devDependency）。运行期 0 依赖。**

| 方案 | 2D 性能 | 迭代速度 | Web 优先 | 依赖重量 | 结论 |
|---|---|---|---|---|---|
| **Canvas 2D + TS + Vite** | 中（实体少，足够） | 高（HMR） | 极佳 | **极轻** | ✅ **首选** |
| TS 单文件零构建 | 中 | 最高（双击即跑） | 极佳 | **无** | ✅ **M0 起步可选** |
| PixiJS | 高 | 高 | 好 | 中 | 后期若要大量特效再换 |
| Phaser 3 | 高 | 中 | 好 | 重 | 框架约束多，不选 |
| Godot 4 | 高 | 中 | 中 | 重 | 若要主机/原生再考虑 |

**理由**：本作实体量小（几十~几百个乘客点），Canvas 2D 轻松 60fps；真正的价值在**确定性模拟 + 无头跑分调平衡**，而非渲染吞吐。引擎/框架只会增加心智与依赖负担。

## 2. 依赖清单

| 类型 | 依赖 | 说明 |
|---|---|---|
| 运行期 | **无** | RNG 自己写（mulberry32，~15 行）；绘制用 Canvas 2D。**不做音效/音频** |
| 开发期 | `vite` | dev server + HMR + 静态构建 |
| 开发期（可选） | `typescript` | 仅类型检查 |
| 开发期（可选） | `vitest` | 单测（可先用 node 脚本替代） |

## 3. 分层架构

```
            ┌─────────────────────────── main.ts ──────────────────────────┐
            │  固定步长驱动器 (accumulator + 插值 alpha) + 输入 + 启动循环    │
            └───────┬───────────────────────────────────────┬──────────────┘
                    │ step(fixedDt)                          │ render(alpha)
                    ▼                                        ▼
        ┌───────────────────────┐               ┌──────────────────────────┐
        │  sim.ts (纯逻辑)       │   只读状态     │  render.ts (Canvas 2D)    │
        │  World + step()        │ ────────────▶ │  画楼层/电梯/乘客/压力条   │
        │  无 DOM | 可 node 运行  │               └──────────────────────────┘
        └──────┬────────────────┘                          ▲
               │ 查询/调用                                    │
               ▼                                             │
        ┌───────────────┐   命令   ┌──────────────┐   读世界  │
        │ route.ts (A*)  │ ◀──── │  输入/编辑器   │ ─────────┘
        │ 图构建 + 寻路   │       │  点按停靠表    │
        └───────────────┘        └──────────────┘
```

**铁律**：`sim.ts` 与 `route.ts` **不 import 任何 DOM / Canvas 代码**。这是确定性、可测试、可无头跑分的前提。

## 4. 主循环（固定步长 + 插值）

```ts
const SIM_HZ = 60;
const STEP = 1 / SIM_HZ;
const MAX_CATCHUP = 5;          // 追帧上限，防卡顿雪崩

let acc = 0;
let prevTime = performance.now();

function frame(now: number) {
  let dt = (now - prevTime) / 1000;
  prevTime = now;
  acc += Math.min(dt, 0.25);    // 单帧最大 0.25s，防止切后台后爆炸

  let steps = 0;
  while (acc >= STEP && steps < MAX_CATCHUP) {
    world.prev.copyFrom(world.curr);  // 保存上一 tick 用于插值
    sim.step(world, STEP);            // 纯逻辑，确定性
    acc -= STEP;
    steps++;
  }
  const alpha = acc / STEP;
  render.draw(ctx, world, alpha);     // 用 alpha 在 prev↔curr 间插值
  requestAnimationFrame(frame);
}
```

要点：
- **逻辑只用整数 tick 计时**（`world.tick`），避免浮点累积导致回放不一致。
- 位置等连续量可存 `prev/curr` 两份，渲染时 `lerp`。

## 5. 确定性设计

| 机制 | 做法 |
|---|---|
| 随机 | 单一 `seed` → `mulberry32`；所有生成/事件/故障走它 |
| 时间 | `tick` 为整数；系统按 tick 调度事件 |
| 输入 | 记录为**命令流** `{tick, type, payload}`（可后置） |
| 回放 | 同 seed + 同命令流 ⇒ 完全一致状态（用于复现 bug / 调平衡） |

> MVP 可先不做存档/回放，但**架构上不要堵死**：`step()` 不接受 `Date.now()`、`Math.random()`、`performance.now()`。

## 6. 目录结构

```
index.html
src/
  main.ts     // 启动 + 固定步长循环 + 输入接线
  sim.ts      // World 定义 + step() 各系统（纯逻辑）
  route.ts    // 服务图构建 + A* 寻路
  dispatch.ts // 调度策略（见 04）
  render.ts   // Canvas2D 绘制
  input.ts    // 点按「电梯×楼层」切换停靠、点轿厢切策略
  config.ts   // 楼层/电梯/需求/平衡参数（TS 对象）
  rng.ts      // mulberry32
tests/        // （可选）vitest 或 node 跑分脚本
scripts/      // build-demo.mjs：把 dist 的 JS 内联为单文件试玩版（demo/，构建产物）
```

> M0 可合并为 `index.html` + `game.js` 单文件；结构稳定后再拆分。

## 7. 渲染层（render.ts）

- 单一 `<canvas>`，逻辑坐标 = 世界坐标（楼层为 y 轴单位）。
- **风格**：极简扁平、浅色纸张底、细结构线、高饱和信息色，对齐 Mini Metro（见 [01 §9](01-game-design.md)）。
- 每帧重绘（实体少，无需脏矩形优化）。
- 绘制顺序：背景城市视差 → 楼层带 → 乘客 → 电梯轿厢 → 换乘连线 → 楼层压力条/FX。
- 相机：整体剖面视图 +（后期）聚焦某梯/某层的缩放。
- 颜色语义：电梯颜色 = 线路；乘客颜色 = 目的区；红色脉动 = 拥挤预警。

## 8. 输入层（input.ts）

- 停靠表编辑：在楼层带按下 → 拖到另一层 → 生成/调整该电梯停靠序列；实时预览，松手提交校验（去重、相邻）。
- 策略切换：点选轿厢弹出策略。
- 空格：暂停进入规划模式。
- 命中测试：Canvas 坐标 → 世界坐标 → 最近楼层/轿厢。

## 9. 配置与数据（config.ts）

- 普通 TS 对象，**不建 JSON 配置系统**（个人实验，改代码即可）。
- 集中放：楼层定义、电梯初始参数、需求曲线、事件时间表、平衡系数。
- 平衡全改这里 + 无头跑分，不改逻辑。

## 10. 测试与无头跑分

- `sim.ts` 纯逻辑 ⇒ 可直接 `node` import，用脚本跑 1000 局。
- 输出 KPI：平均等待、最大等待、送达数、换乘次数、能耗、失败楼层。
- 有 `vitest` 时，对每个 system 写少量单测；没有也能靠跑分脚本。

## 11. 性能注意事项

- 不在 `step()` 内做分配（对象池复用乘客/粒子）。
- 寻路惰性重算，绝不每帧全量 Dijkstra（见 03）。
- 实体数设上限（例如同屏乘客 ≤ 300）。
- 渲染是唯一允许"每帧"的开销。

## 12. 明确不做

PixiJS / Phaser / Godot · ECS 框架 · JSON 配置系统 · 事件总线框架 · 后端/网络/多人 · 3D/剧情 · 音效/音频。（多地图与存档回放已分别列入 M4/M3，不再是架构禁忌。）

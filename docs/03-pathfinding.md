# 03 · 乘客寻路算法

> 本作**唯一的"硬"算法**。设计原则：忠实借鉴 Mini Metro 的语义，但把工程量砍到个人实验体量。
> 关联：[04 · 调度](04-dispatch.md)（等车估算依赖轿厢状态）、[05 · 数据模型](05-data-model.md)（`Plan` / `Leg`）。

---

## 1. 背景：Mini Metro 的真实做法（研究结论）

来自 Dinosaur Polo Club 开发者本人回帖与 2017 官方公告：

| 事实 | 我方是否采用 |
|---|---|
| 网络存为**有向图**，用 **A\*** 搜索路线 | ✅ 采用 |
| 边成本 = **乘车时间 + 等接驳车时间**（跑极简模拟预测列车位置） | ✅ 采用（等车用几何估算替代） |
| **换乘成本被刻意夸大**，偏好直达 | ✅ 采用（`TRANSFER_PENALTY`） |
| **强烈惩罚回到已去过的站** | ✅ 采用（`BACKTRACK_PENALTY`） |
| **容量只在前 2 次迭代考虑** | ❌ 跳过（原版自己都说预测无意义） |
| 图节点是 **(车站, 线路) 对** | ✅ 采用（本作 `(floor, elevator)`） |
| 2017：随预测时长递增的**紧凑换乘阈值** | ❌ 先不做，出现"换乘抖动"再加 |

> 结论：**不需要 RAPTOR / TBTR / CSA / 时间依赖图**。那些是学术级公交路由（论文针对 2 万+ 站网络），对本作是过度设计。

## 2. 图模型：节点 = (楼层, 电梯)

电梯 = "线路"。MVP 中 1 轿厢 = 1 条线；未来同路线多轿厢可共用同一"线路"节点（等车估算改为"该线路下一班"）。

```ts
type PNode =
  | { kind: 'floor'; floor: FloorId }                       // 在某层等待，可登梯
  | { kind: 'elev';  floor: FloorId; elev: ElevatorId };    // 正乘坐电梯 elev，停靠到 floor
```

节点规模 = 层数 × (1 + 停靠该层的电梯数)，通常几十个。单次 A* 微秒级。

**起点**：`{kind:'floor', floor: from}`
**终点集合**：所有满足"目的区/类型"匹配的楼层（Mini Metro 是"目的形状"，本作是"目的区/类型"）。取其中 A* 代价最小者。

## 3. 边与权重

```ts
// 1) 登梯边: floor(F) -> elev(F, E)   仅当 E 停靠 F
w_board = estWait(E, F) + (firstBoarding ? 0 : TRANSFER_PENALTY)

// 2) 乘梯边: elev(F, E) -> elev(F', E)   F' 是 E 停靠表中与 F 相邻的一站
w_ride  = FLOOR_TRAVEL_TIME * |F' - F| / E.speed + DWELL_TIME

// 3) 下梯边: elev(F, E) -> floor(F)
w_alight = ALIGHT_TIME   // 可设 0

// 4) 回头惩罚: 目标已访问过该楼层时额外加权（借鉴"惩罚回到已去过站"）
w_total += visited.contains(targetFloor) ? BACKTRACK_PENALTY : 0
```

### 参数表（集中放 config.ts，便于跑分调参）

| 参数 | 含义 | 建议初值 |
|---|---|---|
| `TRANSFER_PENALTY` | 换乘的额外代价（秒） | 8–15（越大越偏好直达） |
| `BACKTRACK_PENALTY` | 回到已访问楼层的代价（秒） | 5–10 |
| `DWELL_TIME` | 每站停靠耗时（秒） | 2–4 |
| `FLOOR_TRAVEL_TIME` | 单层运行基准（秒/层，再除以速度） | 0.5 |
| `ALIGHT_TIME` | 下梯耗时 | 0 |

> 这些系数就是"人味"的来源。原版反复调它们，我们先用一组保守初值，再靠无头跑分微调。

## 4. 等车估算 `estWait(E, F)`

原版跑一个"极简列车位置模拟"；我们用几何估算（个人实验够用）：

```
设 E 当前层 pos、方向 dir、停靠表 stops、速度 speed
沿 dir 走到 F 的停靠站序列 sub = stops 从 pos 到 F 的在dir方向上的子序列
estWait(E, F) ≈ Σ(|相邻站距离|) * FLOOR_TRAVEL_TIME / speed
               + (sub.length) * DWELL_TIME
若 F 不在 dir 方向可达（需反向），再 + 一次全程往返的抖动估计
```

- 若 E 空闲（无任务），`estWait ≈ |pos - F| * unit / speed`。
- 可选：按电梯当前载客率略微上浮等待（不做容量硬约束，只做软惩罚）。

## 5. A\* 搜索

```ts
function findPlan(world, passenger): Leg[] | null {
  const start = node('floor', passenger.from);
  const goals = world.floorsMatching(passenger.destZone); // 目的层集合
  const open = MinHeap();            // 按 f = g + h 排序
  const g = new Map<PNode, number>();
  const came = new Map<PNode, PNode>();
  g.set(start, 0); open.push(start, h(start, goals));

  while (!open.empty()) {
    const u = open.pop();
    if (u.kind === 'floor' && goals.has(u.floor)) return reconstruct(came, u);
    for (const {v, w} of edges(u, world)) {
      const ng = g.get(u)! + w;
      if (ng < (g.get(v) ?? Infinity)) {
        g.set(v, ng); came.set(v, u);
        open.push(v, ng + h(v, goals));
      }
    }
  }
  return null;  // 当前网络无路：乘客原地等待，网络变化后再算
}

// 可采纳启发式：垂直层距 / 最大速度
function h(n, goals) {
  const f = n.kind === 'floor' ? n.floor : n.floor;
  return Math.min(...[...goals].map(g => Math.abs(g - f))) * FLOOR_TRAVEL_TIME / MAX_SPEED;
}
```

**输出**：`Leg[]`，每段 `Leg = { elevator, boardFloor, alightFloor, rideDir }`。乘客按 `Leg` 前进；到 `alightFloor` 后进入下一段（即换乘）。

## 6. 重算时机（关键：别每帧跑）

| 触发 | 说明 |
|---|---|
| 乘客生成时 | 算一次计划 |
| 网络拓扑改变 | 玩家编辑线路 / 增梯 / 改策略后，对**受影响**乘客重算 |
| 无计划的等待者 | 每次拓扑变化时，尝试为"WAIT 且无计划"的乘客再算一次 |
| （可选）定时 | 每 N 秒对等待者重算，处理拥堵漂移 |

**不做**：每帧全量重算；每乘客每帧重算。

## 7. 换乘处理

- 换乘本质就是"当前 `Leg` 结束在 `alightFloor`，下一个 `Leg` 从同层开始"。
- 该楼层必须被两条线路共同停靠，才会在图里形成"下梯 → 登梯"的连接。
- 下车后状态置 `TRANSFER`，等下一段所乘电梯到站后登梯（复用 `WAIT` 逻辑）。

## 8. MVP 再退一步（可选落地路径）

若想更快跑通整个游戏循环：先用 **BFS 按"换乘数 → 站数"排序**（即 `python_mini_metro` 的简化做法）：
- 不估时间、不做 A* 权重，只找"最少换乘、其次最少站"的路。
- 待游戏循环稳定后，再升级为本文的带权 A*。

这是推荐的实际落地顺序：**先 BFS 通链路，再换 A\* 调手感。**

## 9. 不做清单

- ❌ RAPTOR / TBTR / CSA / 时间依赖图 / 多层 Dijkstra
- ❌ 容量预测（原版只算前 2 跳）
- ❌ 每帧 Dijkstra
- ❌ 紧凑换乘阈值调参（出现换乘抖动再说）

## 10. 参考

见 [07 · 参考与来源](07-references.md)。

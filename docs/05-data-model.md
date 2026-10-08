# 05 · 数据模型（TypeScript 接口定义）

> 本文是 `sim.ts` / `route.ts` 的类型契约草案。**目标：小、平、可无头运行。**
> 关联：[03 · 寻路](03-pathfinding.md)、[04 · 调度](04-dispatch.md)。

---

## 1. 基础类型

```ts
export type Tick = number;                 // 整数时间步
export type FloorId = number;              // 1F=1, B1=-1 …
export type ElevatorId = number;
export type PassengerId = number;
export type Zone = 'office' | 'residential' | 'hospital' | 'retail' | 'lobby' | 'special';

export type Vec = { x: number; y: number }; // 渲染坐标（由 floor 映射）
```

## 2. 楼层

```ts
export interface Floor {
  id: FloorId;
  name: string;                 // "1F"/"空中大堂"
  zone: Zone;                   // 乘客"目的区"匹配依据
  special?: 'lobby' | 'skyLobby' | 'restaurant' | 'parking' | 'skybar' | 'er';
  waiting: PassengerId[];       // 本层等待的乘客
  pressure: number;             // 拥挤压力 0..1（失败判定）
  capacity: number;             // 压力条满格对应的人数阈值
}
```

## 3. 电梯（= 线路）

```ts
export type Policy = 'SCAN' | 'ZONE' | 'UP_PEAK' | 'DOWN_PEAK' | 'ALL_CALL';

export interface Elevator {
  id: ElevatorId;
  color: string;                // 线路颜色
  stops: FloorId[];             // 有序停靠表（可跳层=直达）
  capacity: number;
  speed: number;                // 层/秒
  load: PassengerId[];          // 轿厢内乘客
  policy: Policy;

  // 运行时状态
  pos: number;                  // 浮点楼层位置
  posPrev: number;              // 上一 tick 位置（渲染插值用）
  dir: 1 | -1 | 0;              // 上/下/静止
  state: 'IDLE' | 'MOVING' | 'DWELL';
  targetStopIndex: number;      // 当前目标在 stops 中的下标
  dwellUntilTick: Tick;         // DWELL 结束时刻
}
```

> 井道资源上限（`config.ts`）：`export const MAX_ELEVATORS = 5;`。达到上限后日终升级不再提供「新增电梯」，仅剩「容量 +4」。

## 4. 乘客

```ts
export type PassengerState = 'WAIT' | 'RIDE' | 'TRANSFER' | 'DONE';

export interface Passenger {
  id: PassengerId;
  from: FloorId;
  destZone: Zone;               // Mini Metro 的"形状" → 本作"目的区/类型"
  destFloor?: FloorId;          // 具体目的地（徽标上显示的楼层数字）；缺省时按 destZone 任一层
  dir: 1 | -1;                  // 目的地相对起点的方向（用于调度判定）
  group: number;                // 1..4 小团体人数（占容量）
  patience: number;             // 剩余耐心（tick 或秒）
  state: PassengerState;
  atFloor: FloorId;             // 当前所在层（WAIT/TRANSFER）
  onElev?: ElevatorId;          // 当前所乘电梯（RIDE）
  plan: Leg[];                  // 剩余行程
  legIndex: number;             // 当前执行到第几段
}

export interface Leg {
  elevator: ElevatorId;
  boardFloor: FloorId;
  alightFloor: FloorId;
  rideDir: 1 | -1;
}
```

## 5. 世界

```ts
export interface World {
  tick: Tick;
  seed: number;
  floors: Floor[];
  elevators: Elevator[];
  passengers: Map<PassengerId, Passenger>;
  phase: 'morning' | 'midday' | 'evening' | 'night';
  /** 全局失败/评分统计 */
  stats: {
    delivered: number;
    totalWaitTicks: number;
    maxWaitTicks: number;
    transfers: number;
    energy: number;             // 可简化为"总运行层数"
  };
  /** 调度/降级：某层压力满格持续的 tick 数，用于判定失败 */
  overPressureTicks: Map<FloorId, Tick>;
}
```

## 6. 寻路图（route.ts 内部类型，非持久化）

```ts
export type PNode =
  | { kind: 'floor'; floor: FloorId }
  | { kind: 'elev'; floor: FloorId; elev: ElevatorId };
```

## 7. 命令（输入 → 模拟，可选）

MVP 可直接调用 `sim` 函数；若要确定性回放，改成命令流：

```ts
export type Command =
  | { t: 'setStops'; tick: Tick; elev: ElevatorId; stops: FloorId[] }
  | { t: 'setPolicy'; tick: Tick; elev: ElevatorId; policy: Policy }
  | { t: 'addElevator'; tick: Tick; spec: ElevatorSpec }
  | { t: 'pause'; tick: Tick; paused: boolean };
```

## 8. 配置（config.ts）

```ts
export interface SimConfig {
  simHz: number;                // 60
  floorTravelBase: number;      // 秒/层（再/速度）
  accel: number;                // 加/减速度（层/秒²）
  dwellTime: number;            // 基准开门秒数
  boardTimePerPerson: number;   // 每人上下客耗时（秒）
  transferPenalty: number;      // 换乘额外代价（秒）
  backtrackPenalty: number;     // 回头惩罚（秒）
  alightTime: number;
  patience: number;             // 初始耐心（秒）
  pressureThresholdTicks: number;
  transferThreshold: number;    // 可选：紧凑换乘阈值（先不用）
  dayLengthTicks: number;       // 一天多长：7200 = 120s @60Hz
}
```

## 9. 事件（可选，供渲染订阅）

```ts
export type SimEvent =
  | { t: 'arrive'; elev: ElevatorId; floor: FloorId }
  | { t: 'deliver'; passenger: PassengerId }
  | { t: 'floorAtRisk'; floor: FloorId }
  | { t: 'gameOver'; floor: FloorId };
```

## 10. 约定

- **所有时间以 tick 计**，秒值在边界处换算（`tick = sec * simHz`）。
- `sim.ts` 不持有 Canvas 坐标；`Vec` 仅存在于 `render.ts`。
- `Map` 用于乘客/电梯查找；遍历热路径可改数组 + 索引，MVP 保持 `Map` 即可。
- 序列化：MVP 不做；未来"seed + 命令流"即可完整重建 `World`。

## 11. 布局几何与需求权重（纯层）

`view.ts` 与 `config.ts` 都是**纯模块**：不含 DOM，可被单测直接调用（见 [02 · 分层架构](02-architecture.md) 的铁律）。

### 布局几何（`view.ts`）

```ts
export interface Rect { x: number; y: number; w: number; h: number }
export type ControlButtonId = 'pause' | 'speed1' | 'speed2';
export interface ControlBarLayout { bar: Rect; buttons: { id: ControlButtonId; rect: Rect }[] }

/** 停靠表的最低/最高层；空表返回 null，单站时 lo === hi。 */
export function stopExtent(stops: readonly FloorId[]): { lo: FloorId; hi: FloorId } | null;

/** 竖屏剖面布局：上/下边距 + 井道首 x + 井道间距。elevatorCount <= 0 也不产生 NaN。 */
export function portraitLayout(
  width: number,
  height: number,
  elevatorCount: number,
): { marginTop: number; marginBottom: number; shaftFirstX: number; shaftGapX: number };

/** 底部控制栏：整条 bar + 从左到右的按钮（pause / speed1 / speed2），每键 >= 44x44。 */
export function controlBarLayout(width: number, height: number): ControlBarLayout;

/** 日终升级卡片：count 张竖排居中的可点按矩形，count <= 0 返回 []。 */
export function upgradeOptionRects(width: number, height: number, count: number): Rect[];

/** 关键布局常量 */
export const PORTRAIT_LEFT_GUTTER: number;    // 左侧楼层标号栏宽度
export const PRESSURE_BAR_MAX: number;         // 压力条列最大宽度
export const PRESSURE_BAR_RIGHT_INSET: number; // 压力条距右边距离
export const CONTROL_BAR_H: number;            // 底部控制栏高度
```

所有矩形都在**逻辑（CSS）像素**下计算：DPR 缩放由 `ctx.setTransform` 统一处理，布局层不需要知道 `devicePixelRatio`（见 [02 §4](02-architecture.md)）。

### 需求权重（`config.ts`）

```ts
/** 某层被选为乘客出发层的相对权重 */
export function spawnOriginWeight(floor: Floor): number;
/** 某层被选为乘客到达层的相对权重 */
export function spawnDestWeight(floor: Floor): number;
```

取表规则是"有 `special` 用覆盖表、否则用 zone 基底表"：`ZONE_SPAWN_WEIGHTS` 给各 zone 基底权重，`SPECIAL_SPAWN_WEIGHTS` 覆盖它——功能层（空中大堂 / 餐厅 / 屋顶酒吧 / 停车场 / 大堂）整体高于普通办公层，让特色层同时是换乘枢纽与客流源。

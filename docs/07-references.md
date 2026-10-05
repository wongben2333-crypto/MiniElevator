# 07 · 参考与来源

> 记录本设计所依据的一手资料，以及"我们从中借鉴了什么、又刻意不抄什么"。
> 关联：[03 · 寻路](03-pathfinding.md)。

---

## 1. Mini Metro 寻路（一手来源）

### 开发者本人回帖：*How do passengers choose which station they go to?*
- 链接：https://steamcommunity.com/app/287980/discussions/0/627456486607812743/
- 要点（Peter / Robert Curry 原话）：
  - 网络存为**有向图**，用 **A\*** 搜索。
  - 边成本 = 乘车时间 + 等接驳车时间（跑"极简模拟"预测列车位置）。
  - **换乘成本被刻意夸大**以偏好直达。
  - **强烈惩罚回到已去过的站**。
  - **容量只在前 2 次迭代考虑**，之后忽略。
  - 拥挤站会被避开（后于 2017 移除该 hack）。
- **我方借鉴**：有向图 + A* + 等车成本 + 换乘/回头惩罚。
- **我方不抄**：容量预测；拥挤规避 hack。

### Dinosaur Polo Club 官方公告：*Passenger AI improvements!（2017-08-15）*
- 链接：https://dinopoloclub.com/2017/08/15/passenger-ai-improvements/
- 要点：
  - 移除"拥挤站优先离站"hack，改为更优雅的方案。
  - 高风险的**紧凑换乘**会导致乘客来回换路；加入"随预测时长递增的换乘阈值"。
- **我方借鉴**：意识到换乘抖动问题，预留 `BACKTRACK_PENALTY` / 紧凑换乘阈值作为后手。
- **我方不抄**：该阈值先不实现（个人实验，出现再补）。

### Dinosaur Polo Club：*Code complexity*
- 链接：https://dinopoloclub.com/2014/01/03/code-complexity/
- 要点：赛道/线路编辑的复杂度爆炸（Y 型交叉、环线、车厢）。**复杂度不在寻路，在"可编辑线路"本身。**
- **我方借鉴**：线路编辑要尽早限制形态（本作是 1D 有序停靠表），避免 Y 交叉/环线复杂度。

### GDC：*Mini Metro: When Less is More*（Jamie，UI 设计师）
- 链接：https://www.gdcvault.com/play/1024250/-Mini-Metro-When-Less （YouTube: https://www.youtube.com/watch?v=kmHXk4Y35QM）
- 要点：极简 UI、"玩具火车轨道"心态、无惩罚的线路重编辑、用视觉语言替代文字。
- **我方借鉴**：无文字引导；拖拽即编辑、无成本重排；HUD 尽量隐形。

### Postmortem: Dinosaur Polo Club's Mini Metro
- 链接：https://www.gamedeveloper.com/audio/postmortem-dinosaur-polo-club-s-i-mini-metro-i-
- 要点：窄垂直切片、短局、程序化关卡、分段内容（城市）。
- **我方借鉴**：单栋楼 = 窄切片；多建筑地图 = 分段内容。

## 2. 开源复刻（算法对照）

### `yanfengliu/python_mini_metro`
- 链接：https://github.com/yanfengliu/python_mini_metro
- 要点：图节点为 **station nodes（站+线）**；**BFS** 最短跳；`TravelPlan` 保存完整路径，逐步 `next_station`；无路则等待网络变化。
- **我方借鉴**：`(floor, elevator)` 节点结构；`Plan/Leg` 逐步执行；**MVP 先用 BFS 落地**，再升级 A*。

## 3. 学术公交路由（仅作参考，刻意不采用）

### RAPTOR / TBTR / CSA
- RAPTOR 论文：https://www.microsoft.com/en-us/research/wp-content/uploads/2012/01/raptor_alenex.pdf
- 综述仓库：https://transnetlab.github.io/transit-routing/html/index.html
- 要点：面向 2 万+ 站级网络、Pareto 最优、多准则、无预处理动态路由。
- **我方判断**：对本作（几十层、单源、小图）属于**过度设计**，明确不采用。

## 4. 设计理念参考

### *Learning from Mini Metro* — Human Transit
- 链接：https://humantransit.org/2014/12/learning-how-transit-works-from-mini-metro.html
- 要点：网络结构随需求演化（放射→网格）；换乘是拥堵主因；"临时救济线"策略。
- **我方借鉴**：换乘点设计是核心；压力集中在换乘层；预留"临时加梯/临时线路"式救急手段。

### *Visualizing the Theory of Constraints with Mini Metro*
- 链接：https://fortelabs.com/blog/visualizing-the-theory-of-constraints-with-mini-metro/
- 要点：约束理论五步法；识别瓶颈 → 优化 → 从属 → 提升 → 重复。
- **我方借鉴**：HUD 与诊断要帮玩家"快速定位瓶颈层/瓶颈梯"。

## 5. 外部技术参考

- **RAPTOR 对比**（用来说明为何不用）：https://pubsonline.informs.org/doi/10.1287/trsc.2014.0534
- **Time-dependent Dijkstra / TAD**（同上，仅参考）：https://arxiv.org/html/2603.11729
- **mulberry32**：确定性 PRNG，~15 行，自实现，无依赖。

---

## 借鉴 / 不抄 一览

| 来源 | 借鉴 | 不抄 |
|---|---|---|
| Mini Metro A* 路线 | 有向图 + A* + 等车 + 换乘/回头惩罚 | 容量预测、拥挤规避 hack |
| DPG 2017 公告 | 换乘抖动的认知与后手 | 紧凑换乘阈值（先） |
| python_mini_metro | (站,线) 节点、Plan/Leg、BFS 起步 | — |
| RAPTOR/TBTR/CSA | 无 | 全部（过度设计） |
| Human Transit | 换乘即瓶颈、网络演化 | — |
| GDC / Postmortem | 极简、窄切片、无文字 | — |

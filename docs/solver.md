# 求解器设计说明（solver.js）

> 本文件用「业务语言 → 对应代码」的方式，把从点选套装到产出可翻页方案的全流程串一遍。
> 所有代码均对应 `src/utils/solver.js`（正式版本）。

---

## 一、业务背景

本工具是「异环·空幕」放置辅助工具。核心诉求是：**给定一个角色棋盘（容器）和一套套装（必填驱动块），把全部形状的驱动块精准铺满整个棋盘**，并给出所有合法的铺法供用户挑选。

关键业务约束来自游戏设定：

- 每个角色对驱动块的**类型偏好不同**（角色 A 偏好 Ⅱ型 2 格块，角色 B 偏好 Ⅲ型 3 格块……）。排序阶段据此把「更贴合偏好」的方案排到最前。
- 合格方案必须 **100% 精准占满**可用格（零留空），漏 1~2 格的方案一律视为不合格。

---

## 二、业务实体与代码映射

| 业务语言 | 代码载体 | 含义 |
|---|---|---|
| 容器（角色棋盘） | `available[rows][cols]`、`availMask` (BigInt) | 哪些格可用(1)/不可用(0)，合格方案须 100% 占满可用格 |
| 驱动块形状库 | `SHAPES`（12 种，固定朝向，定义在 `src/data/shapes.js`） | Ⅱ/Ⅲ/Ⅳ 型多联块，**无旋转翻转**，锚点 = 行优先最小格 |
| 套装（必填） | `required = { shapeId: 次数 }` | 选中套装 → 4 个形状各必填 1 次，硬约束 |
| 可选形状池 | `palette = { shapeId: 库存上限 }` | 用户额外点选、可填可不填、受数量封顶 |
| 限定可选池开关 | `options.usePalette` | false=旧逻辑（全 12 种填空、无上限）；true=仅 palette |
| 虚荣模式 | `options.vanity` | 套装块降级为非必选，全部所选作为可选池 |
| 方案排序优先级 | `options.priorityType`（`''/II/III/IV`） | 展示层排序维度，按角色类型偏好排前（见第六节） |
| 合格方案 | `filled === availMask && rem.every(v<=0)` | **精准占满** + 必填全放下 |

---

## 三、顶层调度：`solve()` —— 两档策略

```js
export function solve(rows, cols, available, required, palette = {}, options = {}) {
  const exact = exactSolve(...)            // ① 先尝试「枚举全部精准占满铺法」
  if (exact && exact.solutions && exact.solutions.length) return exact
  const g = greedySolve(...)               // ② 实在铺不满 → 贪心近似，明确标记无解
  return { solutions: [sol], mode: 'greedy', exactFailed: true, ... }
}
```

业务含义：**能精准占满就给全部方案让用户翻页挑；铺不满也别白屏，回退一个「尽量填」的近似并提示「存在空格未填满」**。

常量与预算：

| 常量 | 值 | 作用 |
|---|---|---|
| `MAX_STATES` | 1_500_000 | 枚举状态总数上限（含 deadMemo 去重后） |
| `MAX_MS` | 1500 | 枚举耗时上限(ms)，避免病态棋盘卡界面 |
| `MAX_SOLUTIONS` | 800 | 返回方案数上限（按「批」去重后的唯一方案数） |

---

## 四、`exactSolve` 业务流程

### 步骤 1 — 建棋盘与可用格位掩码

```js
let availMask = 0n
for (let k = 0; k < N; k++) if (availArr[k]) availMask |= 1n << BigInt(k)
```

把容器「摊平」成一串比特，第 k 位=1 表示该格可用。**合格方案的终点就是 `filled === availMask`**。

### 步骤 2 — 解析「必填 / 可选」库存模型

```js
const mand = new Array(12).fill(0)   // 必填数（来自套装）
const cap  = new Array(12).fill(0)   // 库存上限（来自 palette）
// vanity: mand 恒 0；否则按 required 填 mand
if (!usePalette && !vanity)
  for (let si=0; si<12; si++) cap[si] = Infinity   // 旧逻辑：剩余空间用全部 12 种、无上限
```

每个形状算两本账——**必须放几个（mand）** 和 **最多能放几个（cap）**。`used[si]` 记录已放数，`used[si] >= cap[si]` 就封顶不能再放。

### 步骤 3 — 形状归一化 + 预计算合法放置

```js
// 锚点 = 形状行优先最小格；placementsAt[i] = 锚点落在第 i 格时的所有合法「放块」
for (let i=0; i<N; i++) for (const shp of usable)
  if (能放进 availArr) placementsAt[i].push({ si, cells, mask })
```

因为朝向固定，**「行优先最靠前的未处理格」一定就是要放的这块的锚点**。所以每一层只需在唯一锚点上枚举「放哪块」，分支数极小。

### 步骤 4 — 必填槽位登记

```js
slotOfShape[si] = slotIndex   // 该必填形状对应第几个槽
reqCounts = [1,1,1,1]         // 还差几个必填
unplaceable = [...]           // 棋盘里根本放不下的必填 → 直接算未放置
```

### 步骤 5 — 枚举核心 `enumRec(state)`（DFS + 搜索中剪枝）

状态 `state = (done, filled, rem, used)`，递归伪流程：

```js
const enumRec = (done, filled, rem, used) => {
  // —— 闸① 预算/记忆化（不展开死路）——
  if (预算满) { truncated = true; return }
  if (deadMemo.has(key)) return                 // 该状态此前已证伪
  const i = lowestFree(done)                    // 锚点 = 下一个未处理格
  if (i === -1) {                               // 叶子：全部格处理完
    if (rem.every(v<=0) && filled === availMask)  // 必填全放 + 精准占满
      record(walk)                             // ✅ 记一个合格方案
    return
  }
  // —— 闸② 必填可达性（必填注定放不下 → 整条剪掉）——
  for (每个还差的必填形状)
    if (剩余空格里已无任何空位能放它) { deadMemo.add(key); return }

  for (const mv of movesAt(i, ...)) {
    // —— 闸③ 前向剪枝（放完这块就造出永远填不上的死洞 → 跳过该走法）——
    if (isDeadAfterPlace(mv.childFilled, mv.placement.cells)) continue
    walk.push(mv); enumRec(mv.childDone, mv.childFilled, mv.childRem, mv.childUsed); walk.pop()
  }
  if (本轮 0 解 && 未超预算) deadMemo.add(key)  // 证伪记忆化
}
```

而 `movesAt`（走法生成）的业务规则：**合格方案不允许留空，只有「放块」一种走法，没有 skip 分支**。

```js
if (used[si] >= cap[si]) continue              // 该形状库存封顶
const consume = slot>=0 && rem[slot]>0        // 这次放置是用来满足必填吗？
// consume=true → 必填（画布黄色）；false → 可选填充（画布紫色）
```

> **四道剪枝闸**（搜索中触发，不是枚举完再过滤）：
> 1. 入口预算 + `deadMemo` 命中 → 不展开；
> 2. 必填可达性 → 必填注定放不下整条剪掉；
> 3. `isDeadAfterPlace` 前向剪枝 → 本次放置造出孤立死洞则跳过该走法；
> 4. 子叶探索完 0 解 → 记 `deadMemo` 避免重复展开。
>
> 「精准占满」判定只在**叶子**(所有格处理完)做，且只决定记不记录——漏格路径在中途就被前向剪枝或必填检查砍掉，压根到不了叶子。

### 步骤 6 — 批去重（同批驱动块只留一个）

```js
const batchSig = walk => 形状id×数量排序串   // 如 "II-h2×1,III-a×1,..."
if (seenBatch.has(sig)) return              // 同一批块不同摆位 → 视为重复，去重
seenBatch.add(sig); solutions.push(...)
```

业务语言：**「缇娜的夜间酒馆」这套块，从左上摆和从右下摆算同一个方案**，只保留首个，方案数按「批」计。

> 去重维度是与「位置/顺序无关」的**形状多重集合**（非旋转翻转）。记忆化用的是 `deadMemo`（只记证伪死状态），避免全状态跳过在枚举时漏解。

### 步骤 7 — 收尾

```js
solutions.sort((a,b) => a.blocks - b.blocks)  // 块少的（大块用得多）排最前
return { solutions, missed, totalAvail, truncated, optimal:!truncated, mode:'exact' }
```

---

## 五、回退 `greedySolve`（铺不满时）

```js
// 先放必填（大块优先）→ 再用可选池填空（大块优先）→ 漏的格计入 skips
return { placements, covered, blocks, missed, optimal:false }
```

贪心是「从左到右一个一个塞」的近似，**不保证精准占满**，所以 `skips > 0`，UI 会标 warning 提示「未找到可完全铺满的方案」。

---

## 六、方案排序优先级（展示层，不重新求解）

异环设定下，每个角色对驱动块类型偏好不同。新增纯函数 `sortSolutionsByPriority`：

```js
export function sortSolutionsByPriority(solutions, priorityType) {
  if (!solutions || !solutions.length) return solutions
  if (!priorityType) {
    return solutions.slice().sort((a, b) => a.blocks - b.blocks)  // 默认：少块优先
  }
  const score = s => {
    let n = 0
    for (const p of s.placements) {
      const shp = SHAPE_MAP[p.blockId]
      if (shp && shp.type === priorityType) n++
    }
    return n
  }
  // 该类型块越多越靠前；同分按「块数升序（大块多）」兜底
  return solutions.slice().sort((a, b) => (score(b) - score(a)) || (a.blocks - b.blocks))
}
```

- `priorityType=''` → 默认按块数升序（等同原行为）；
- `'II'`/`'III'`/`'IV'` → 按方案内该类型块数量**降序**，命中越多越靠前。

切换优先级只重排 `solutions` 数组、归零索引，**毫秒级、不重新求解、保留已编辑的副词条**。

---

## 七、返回契约（UI 如何消费）

```js
{
  solutions: [ { placements:[{ blockId, cells, mandatory }], covered, blocks, skips:0 } ],
  missed,            // 没放下/没放满的必填块
  totalAvail,        // 容器可用格总数
  truncated,        // 是否因 MAX_SOLUTIONS/预算截断
  mode,              // 'exact' | 'greedy'
  exactFailed, exactTruncated
}
```

- `placements[].mandatory` → 画布 **黄=套装必填 / 紫=可选填充**（`ROLE_COLOR`）。
- `solutions.length > 1` → Board 顶部出**分页条**（上一/下一 + x/N + 已截断提示 + 当前优先级）。
- `mode === 'greedy'` → 提示「回退贪心近似，存在空格未填满」。

---

## 八、性能实测（枚举量扫描）

4 容器 × 12 套装全组合扫描（`usePalette=false` 默认态，required=套装 4 形状各×1），全部 `mode=exact` 无截断：

| 容器 | 可用格 | 该容器最大枚举数 | 对应套装 |
|---|---|---|---|
| **Lacrimosa** | 25 | **790** | 缇娜的夜间酒馆 |
| Fadia | 20 | 65 | 缇娜的夜间酒馆 |
| sakiri | 20 | 64 | 缇娜的夜间酒馆 |
| Zankou | 20 | 36 | 迪亚波罗斯 |

- 全局峰值 **790**（`MAX_SOLUTIONS=800` 当前仅余 10 余量）。如需更大容器/新套装，建议提高 `MAX_SOLUTIONS` 留余量（当前按需求保持 800）。
- `usePalette=true` 路径非瓶颈：仅用套装 4 形状材料总面积填不满，几乎恒为 0 精确解（走贪心回退）。
- 前向剪枝让搜索空间大幅缩小：以 Fadia 为例，状态数从 7004（仅 deadMemo）降到 4036（+孤立洞剪枝），方案数/互异性完全一致。

---

## 九、一句话业务总结

**选套装 → 解析成必填+可选池 → 在锚点约束下做带三层剪枝的 DFS 精确覆盖枚举 → 同批去重 → 全占满方案翻页给用户挑；铺不满就贪心兜底并提示；按角色类型偏好排优先级**。

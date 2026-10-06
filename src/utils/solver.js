import { SHAPES } from '../data/shapes.js'

/* ============================================================
 * 驱动块放置求解器（枚举版）
 * ------------------------------------------------------------
 * 为什么贪心不是最优：
 *   贪心按「从左上到右下扫描 + 大块优先」逐个塞，早期的一个选择会制造出
 *   形状不规则的死角，导致后面填不满；而只要换一种组合就能铺满。
 *
 * 精确求解思路（核心约束：合格方案必须【精准占满】全部可用格）：
 *   ① 驱动块朝向固定，因此「行优先最靠前的未处理格」一定等于覆盖它的那一块
 *      的锚点（该块行优先最小的格子）。每一层只能在该锚点上「放一个合法块」，
 *      分支数极小（没有「留空」分支——因为合格方案不允许遗漏任何一格）。
 *   ② 合格的铺法 = 所有可用格 100% 被块覆盖（零留空）且必填形状全部放下；
 *      凡漏了 1~2 格没填满的方案一律丢弃，不作为可行解返回。
 *   ③ 用「访问态记忆化」(visited) 避免重复进入完全相同的 (已处理, 已填, 必填余量,
 *      已用数量) 子状态；用「方案签名去重」(seenSig) 保证同一铺法只记一次。
 *   ④ 必填形状作为硬约束：状态里若某个必填形状在剩余空格里已无处可放，
 *      立刻回溯，保证「必填全部放下」优先于覆盖率。
 *   ⑤ 预算（状态数 / 耗时 / 方案数）耗尽仍枚举不全时，标记 truncated 并截断，
 *      保证界面不卡死（随后若精确 0 解则回退贪心并明确提示「无解」）。
 *
 * 必填 / 可选 模型：
 *   - required：必填套装。来自选中的套装，套装固定为 4 个不同形状，
 *     每个形状必须至少放置 required[id] 次（默认各 1）。这是硬约束。
 *   - palette：可选形状池（库存上限）。用户额外点选的形状及其可用数量，
 *     求解时「可以」拿它们去填剩余空格，但「不强制」用完；且每形状放置总数
 *     不得超过其库存上限。
 *   - usePalette（分配开关）：是否启用「限定可选形状池」这个新逻辑。
 *     · false（默认，旧逻辑）：剩余空间用【全部 12 种形状】填充，无数量上限，
 *       即旧的「选套装后一个个找空填空」行为，palette 被忽略。
 *     · true（新逻辑）：剩余空间仅用 palette（含套装预填）中的形状填充，
 *       并受每形状库存上限 cap 约束。
 *   - 每个形状的可放置上限 cap：
 *        usePalette=false → cap = Infinity（全部形状可用，无上限）；
 *        usePalette=true  → cap = 在 palette 中则取库存数，否则取必填数
 *        （必填形状天然可用，cap 至少 = 必填数）。used 记录已放数量用于封顶。
 *   - 每个 placement 带 mandatory 标记：该次放置是否用于满足必填
 *     （consume=true 即必填，false 即可选填充），供画布按角色着色。
 *
 * 枚举输出：solve() 返回 { solutions, missed, totalAvail, truncated, optimal, mode,
 *   exactFailed, exactTruncated }
 *   solutions 为数组，每个元素 { placements, covered, blocks, skips }；
 *   每个方案都是「精准占满」——skips 恒为 0、covered === totalAvail。
 *   exactFailed=true 表示精确枚举未找到任何完全铺满方案（已回退贪心近似）；
 *   exactTruncated=true 表示是因预算耗尽而中断（非穷尽）。
 * ============================================================ */

/** 枚举状态总数上限（含访问态记忆化后的去重子状态数） */
const MAX_STATES = 1_500_000
/** 枚举耗时上限（毫秒），避免病态棋盘卡住界面 */
const MAX_MS = 1500
/** 返回方案数上限，避免组合爆炸 */
const MAX_SOLUTIONS = 800

const ABORT = { abort: true }

export function solve(rows, cols, available, required, palette = {}, options = {}) {
  const { basedOnSet = true, fillRemaining = true, usePalette = false, vanity = false } = options
  const exact = exactSolve(rows, cols, available, required, palette, { basedOnSet, fillRemaining, usePalette, vanity })
  if (exact && exact.solutions && exact.solutions.length) return exact
  // 精确枚举未找到任何「完全铺满」方案 → 回退贪心近似，并明确标记无解
  const g = greedySolve(rows, cols, available, required, palette, { basedOnSet, fillRemaining, usePalette, vanity })
  const sol = { placements: g.placements, covered: g.covered, blocks: g.blocks, skips: g.totalAvail - g.covered }
  return {
    solutions: [sol],
    missed: g.missed,
    totalAvail: g.totalAvail,
    truncated: false,
    optimal: false,
    mode: 'greedy',
    exactFailed: true,
    exactTruncated: !!(exact && exact.truncated),
  }
}

/* ===================== 精确求解（枚举全部合法铺法） ===================== */
function exactSolve(rows, cols, available, required, palette = {}, { basedOnSet, fillRemaining, usePalette = false, vanity = false }) {
  const N = rows * cols
  const availArr = new Array(N).fill(false)
  let totalAvail = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ok = !!(available[r] && available[r][c])
      availArr[r * cols + c] = ok
      if (ok) totalAvail++
    }
  }

  const shapeIndexById = new Map(SHAPES.map((s, i) => [s.id, i]))

  // 精确覆盖目标：所有可用格的位掩码（合格方案要求 filled === availMask）
  let availMask = 0n
  for (let k = 0; k < N; k++) if (availArr[k]) availMask |= 1n << BigInt(k)

  /* ---------- 必填数 mand / 库存上限 cap（per shape index） ---------- */
  const mand = new Array(SHAPES.length).fill(0)
  const cap = new Array(SHAPES.length).fill(0)
  // 虚荣模式：套装的驱动块「非必选」，所有形状都作为可选池（mand 恒为 0）
  if (basedOnSet && required && !vanity) {
    for (const [sid, cnt] of Object.entries(required)) {
      const si = shapeIndexById.get(sid)
      if (si === undefined) continue
      const n = Math.max(0, Math.min(4, Number(cnt) | 0))
      if (n > 0) mand[si] = n
    }
  }
  for (const [sid, cnt] of Object.entries(palette || {})) {
    const si = shapeIndexById.get(sid)
    if (si === undefined) continue
    const n = Math.max(0, Math.min(4, Number(cnt) | 0))
    if (n > 0) cap[si] = n
  }
  // 必填形状必须可用：cap 至少不低于必填数
  for (let si = 0; si < SHAPES.length; si++) {
    if (mand[si] > 0 && cap[si] < mand[si]) cap[si] = mand[si]
  }
  // 未开启「可选形状池」且非虚荣模式：恢复旧逻辑——剩余空间用全部形状（无数量上限）填充
  if (!usePalette && !vanity) {
    for (let si = 0; si < SHAPES.length; si++) cap[si] = Infinity
  }
  const usable = si => cap[si] > 0

  /* ---------- 形状归一化：锚点 = 行优先最小的格子 ---------- */
  const shapes = SHAPES.map(s => {
    let ar = s.cells[0][0], ac = s.cells[0][1]
    for (const [r, c] of s.cells) {
      if (r < ar || (r === ar && c < ac)) { ar = r; ac = c }
    }
    return { id: s.id, name: s.name, rel: s.cells.map(([r, c]) => [r - ar, c - ac]) }
  })

  /* ---------- 预计算：每个锚点格上的所有合法放置（仅可用形状） ---------- */
  const placementsAt = Array.from({ length: N }, () => [])
  const placementsByShape = Array.from({ length: shapes.length }, () => [])
  const shapeHasPlacement = new Array(shapes.length).fill(false)
  shapes.forEach((shp, si) => {
    if (!usable(si)) return
    for (let i = 0; i < N; i++) {
      if (!availArr[i]) continue
      const r = Math.floor(i / cols), c = i % cols
      const cells = []
      let ok = true
      for (const [dr, dc] of shp.rel) {
        const rr = r + dr, cc = c + dc
        if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) { ok = false; break }
        const k = rr * cols + cc
        if (!availArr[k]) { ok = false; break }
        cells.push(k)
      }
      if (!ok) continue
      let mask = 0n
      for (const k of cells) mask |= 1n << BigInt(k)
      placementsAt[i].push({ si, size: cells.length, cells, mask })
      placementsByShape[si].push(mask)
      shapeHasPlacement[si] = true
    }
  })
  // 大块优先：放置分支里大块排前，枚举结果更偏向高覆盖
  for (const list of placementsAt) list.sort((a, b) => b.size - a.size)

  /* ---------- 必填形状（唯一 id → 槽位） ---------- */
  const slotOfShape = new Array(shapes.length).fill(-1)
  const reqIds = []
  const reqCounts = []
  const reqShapeIndex = []
  const unplaceable = [] // 棋盘里根本放不下的必填形状（直接算未放置）
  if (basedOnSet && required && !vanity) {
    for (const [sid, cnt] of Object.entries(required)) {
      const si = shapeIndexById.get(sid)
      if (si === undefined) continue
      const n = Math.max(0, Math.min(4, Number(cnt) | 0))
      if (n <= 0) continue
      if (!shapeHasPlacement[si]) {
        for (let i = 0; i < n; i++) unplaceable.push(sid)
        continue
      }
      slotOfShape[si] = reqIds.length
      reqIds.push(sid)
      reqCounts.push(n)
      reqShapeIndex.push(si)
    }
  }
  const totalReq = reqCounts.reduce((a, b) => a + b, 0)

  const missedOf = rem => {
    const missed = unplaceable.map(id => SHAPES[shapeIndexById.get(id)]).filter(Boolean)
    reqIds.forEach((id, slot) => {
      const left = rem[slot] ?? 0
      for (let i = 0; i < left; i++) {
        const si = shapeIndexById.get(id)
        if (si !== undefined) missed.push(SHAPES[si])
      }
    })
    return missed
  }

  // 无可用格；或不填充且（非虚荣模式）无必填：唯一的合法铺法就是空棋盘。
  // 虚荣模式下即便没有必填，也要用可选池去精准占满，故不提前返回。
  if (totalAvail === 0 || (!vanity && !fillRemaining && totalReq === 0)) {
    return {
      solutions: [{ placements: [], covered: 0, blocks: 0, skips: 0 }],
      missed: missedOf(reqCounts),
      totalAvail,
      truncated: false,
      optimal: true,
      mode: 'exact',
    }
  }

  const budget = { used: 0, max: MAX_STATES, t0: Date.now() }

  const lowestFree = done => {
    for (let i = 0; i < N; i++) {
      if (availArr[i] && !((done >> BigInt(i)) & 1n)) return i
    }
    return -1
  }

  /**
   * 枚举某状态在锚点 i 处的所有合法走法。合格方案必须精准占满，故只有「放块」
   * 一种走法，没有「留空」分支（留空即漏格，不算合格）。
   * 已用数量 used[si] 达到库存上限 cap[si] 时，该形状不可再放（可选填充的硬上限）。
   */
  const movesAt = (i, done, filled, rem, used) => {
    const list = []
    for (const pm of placementsAt[i]) {
      if ((filled & pm.mask) !== 0n) continue
      const si = pm.si
      if (used[si] >= cap[si]) continue // 库存上限：该形状已放满
      const slot = slotOfShape[si]
      const consume = slot >= 0 && rem[slot] > 0
      if (!consume && !fillRemaining) continue
      const childRem = consume ? rem.slice() : rem
      if (consume) childRem[slot]--
      const childUsed = used.slice(); childUsed[si]++
      const next = filled | pm.mask
      list.push({
        skip: false,
        placement: pm,
        consume,
        childRem,
        childUsed,
        childDone: done | pm.mask,  // 已处理 = 已填（无留空分支，二者等价）
        childFilled: next,
        size: pm.size,
      })
    }
    return list
  }

  /* ---------- 枚举全部合法铺法 ---------- */
  const solutions = []
  const seenSig = new Set()   // 方案签名去重（同一铺法只记一次）
  const visited = new Set()   // 访问态记忆化（同一子状态只展开一次）
  let truncated = false
  const keyOf = (done, filled, rem, used) =>
    done.toString(36) + '|' + filled.toString(36) + '|' + rem.join(',') + '|' + used.join(',')
  const freshUsed = () => new Array(shapes.length).fill(0)

  const record = walk => {
    const placements = []
    let covered = 0, blocks = 0
    for (const mv of walk) {
      const si = mv.placement.si
      placements.push({
        blockId: shapes[si].id,
        cells: mv.placement.cells.map(k => [Math.floor(k / cols), k % cols]),
        mandatory: mv.consume,
      })
      covered += mv.placement.size
      blocks++
    }
    const sig = placements
      .map(p => p.blockId + '@' + p.cells.map(c => c[0] + '.' + c[1]).join('_'))
      .sort().join('|')
    if (seenSig.has(sig)) return
    seenSig.add(sig)
    solutions.push({ placements, covered, blocks, skips: 0 })
  }

  const walk = []
  const enumRec = (done, filled, rem, used) => {
    if (solutions.length >= MAX_SOLUTIONS) { truncated = true; return }
    if (budget.used > budget.max || Date.now() - budget.t0 > MAX_MS) { truncated = true; return }
    budget.used++
    const key = keyOf(done, filled, rem, used)
    if (visited.has(key)) return
    visited.add(key)
    const i = lowestFree(done)
    if (i === -1) {
      // 叶子：所有可用格已处理。合格方案须【精准占满】且【必填全放下】
      if (rem.every(v => v <= 0) && filled === availMask) record(walk)
      return
    }
    // 必填硬约束：剩余必填在剩余空格已无处可放 → 剪枝
    let ok = true
    for (let s = 0; s < rem.length && ok; s++) {
      if (rem[s] <= 0) continue
      let any = false
      for (const mask of placementsByShape[reqShapeIndex[s]]) {
        if ((mask & done) === 0n) { any = true; break }
      }
      if (!any) ok = false
    }
    if (!ok) return
    for (const mv of movesAt(i, done, filled, rem, used)) {
      if (solutions.length >= MAX_SOLUTIONS) { truncated = true; return }
      walk.push(mv)
      enumRec(mv.childDone, mv.childFilled, mv.childRem, mv.childUsed)
      walk.pop()
    }
  }
  enumRec(0n, 0n, reqCounts.slice(), freshUsed())

  if (solutions.length === 0) {
    // 精确枚举穷尽/中断后仍未找到「完全铺满」方案
    return {
      solutions: [],
      missed: missedOf(reqCounts),
      totalAvail,
      truncated,
      optimal: false,
      mode: 'exact',
    }
  }
  // 最好的排最前：块数最少（块少 = 大块用得多），符合「大块优先」偏好
  solutions.sort((a, b) => a.blocks - b.blocks)
  return {
    solutions,
    missed: missedOf(reqCounts),
    totalAvail,
    truncated,
    optimal: !truncated,
    mode: 'exact',
  }
}

/* ===================== 贪心近似（回退方案） ===================== */
function greedySolve(rows, cols, available, required, palette = {}, { basedOnSet = true, fillRemaining = true, usePalette = false, vanity = false } = {}) {
  const occupied = new Set()
  const key = (r, c) => r + ',' + c
  const placements = []
  const missed = []

  const shapeIndexById = new Map(SHAPES.map((s, i) => [s.id, i]))
  const mand = new Array(SHAPES.length).fill(0)
  const cap = new Array(SHAPES.length).fill(0)
  // 虚荣模式：套装块非必选，mand 恒为 0
  if (basedOnSet && required && !vanity) {
    for (const [sid, cnt] of Object.entries(required)) {
      const si = shapeIndexById.get(sid)
      if (si === undefined) continue
      mand[si] = Math.max(0, Math.min(4, Number(cnt) | 0))
    }
  }
  for (const [sid, cnt] of Object.entries(palette || {})) {
    const si = shapeIndexById.get(sid)
    if (si === undefined) continue
    const n = Math.max(0, Math.min(4, Number(cnt) | 0))
    if (n > 0) cap[si] = n
  }
  for (let si = 0; si < SHAPES.length; si++) {
    if (mand[si] > 0 && cap[si] < mand[si]) cap[si] = mand[si]
  }
  // 未开启「可选形状池」且非虚荣模式：恢复旧逻辑——剩余空间用全部形状（无数量上限）填充
  if (!usePalette && !vanity) {
    for (let si = 0; si < SHAPES.length; si++) cap[si] = Infinity
  }
  const used = new Array(SHAPES.length).fill(0)

  const availCells = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (available[r][c]) availCells.push([r, c])
    }
  }

  const canPlaceAt = (shp, br, bc) => {
    for (const [dr, dc] of shp.cells) {
      const r = br + dr
      const c = bc + dc
      if (r < 0 || r >= rows || c < 0 || c >= cols) return false
      if (!available[r][c]) return false
      if (occupied.has(key(r, c))) return false
    }
    return true
  }

  const placeAt = (shp, br, bc) => {
    const cells = shp.cells.map(([dr, dc]) => [br + dr, bc + dc])
    for (const [r, c] of cells) occupied.add(key(r, c))
    const si = shapeIndexById.get(shp.id)
    used[si]++
    placements.push({ blockId: shp.id, cells, mandatory: used[si] <= mand[si] })
  }

  // 仅可用形状（cap>0）参与放置与填充
  const usable = SHAPES.map((s, si) => ({ s, si })).filter(({ si }) => cap[si] > 0)

  const tryOnce = shp => {
    const si = shapeIndexById.get(shp.id)
    if (used[si] >= cap[si]) return false
    for (const [br, bc] of availCells) {
      if (canPlaceAt(shp, br, bc)) { placeAt(shp, br, bc); return true }
    }
    return false
  }

  /* ---------- 先放必填（受 mand 约束，大块优先） ---------- */
  if (basedOnSet) {
    const mandShapes = usable.filter(({ si }) => mand[si] > 0).sort((a, b) => b.s.cells.length - a.s.cells.length)
    for (const { s, si } of mandShapes) {
      let n = mand[si]
      while (n-- > 0) {
        if (!tryOnce(s)) { missed.push(s); break }
      }
    }
  }

  /* ---------- 再填剩余（仅用可选池，受 cap 上限，大块优先） ---------- */
  if (fillRemaining) {
    const fillOrder = usable.slice().sort((a, b) => b.s.cells.length - a.s.cells.length)
    let progress = true
    let guard = 0
    while (progress && guard++ < 500) {
      progress = false
      for (const { s } of fillOrder) {
        if (tryOnce(s)) { progress = true; break }
      }
    }
  }

  return {
    placements,
    covered: occupied.size,
    totalAvail: availCells.length,
    blocks: placements.length,
    missed,
    optimal: false,
  }
}

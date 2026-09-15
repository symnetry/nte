import { SHAPES } from '../data/shapes.js'

/* ============================================================
 * 驱动块放置求解器
 * ------------------------------------------------------------
 * 为什么贪心不是最优：
 *   贪心按「从左上到右下扫描 + 大块优先」逐个塞，早期的一个选择会制造出
 *   形状不规则的死角，导致后面填不满；而只要换一种组合就能铺满。
 *
 * 精确求解思路：
 *   ① 驱动块朝向固定，因此「行优先最靠前的未处理格」一定等于覆盖它的那一块
 *      的锚点（该块行优先最小的格子）。于是每层分支只有「该锚点上的合法放置
 *      + 留空」两类，分支数极小。
 *   ② 对「留空数量」做迭代加深：先试 0 格（完全铺满），不行再试 1、2…
 *      实际棋盘几乎都能铺满，第一层就命中。
 *   ③ 每一层先「找任意解」（失败态记忆化，速度极快），再在同一层内用
 *      分支限界 + 同状态支配剪枝去减少块数；超出预算就沿用已找到的解。
 *   ④ 必填形状作为硬约束：状态里若某个必填形状在剩余空格里已无处可放，
 *      立刻回溯，保证「必填全部放下」优先于覆盖率。
 *   ⑤ 总预算（状态数 / 耗时）耗尽仍无解时回退到贪心，返回 optimal=false。
 * ============================================================ */

/** 记忆化状态总数上限 */
const MAX_STATES = 400000
/** 求解耗时上限（毫秒），避免病态棋盘卡住界面 */
const MAX_MS = 900
/** 「留空」数量的迭代上限 */
const MAX_SKIPS = 10

const ABORT = { abort: true }

export function solve(rows, cols, available, required, options = {}) {
  const { basedOnSet = true, fillRemaining = true } = options
  const fallback = greedySolve(rows, cols, available, required, { basedOnSet, fillRemaining })
  try {
    const res = exactSolve(rows, cols, available, required, { basedOnSet, fillRemaining })
    return res || fallback
  } catch (err) {
    if (err === ABORT) return fallback
    throw err
  }
}

/* ===================== 精确求解 ===================== */
function exactSolve(rows, cols, available, required, { basedOnSet, fillRemaining }) {
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

  /* ---------- 形状归一化：锚点 = 行优先最小的格子 ---------- */
  const shapes = SHAPES.map(s => {
    let ar = s.cells[0][0], ac = s.cells[0][1]
    for (const [r, c] of s.cells) {
      if (r < ar || (r === ar && c < ac)) { ar = r; ac = c }
    }
    return { id: s.id, name: s.name, rel: s.cells.map(([r, c]) => [r - ar, c - ac]) }
  })

  /* ---------- 预计算：每个锚点格上的所有合法放置 ---------- */
  const placementsAt = Array.from({ length: N }, () => [])
  const placementsByShape = Array.from({ length: shapes.length }, () => [])
  const shapeHasPlacement = new Array(shapes.length).fill(false)
  shapes.forEach((shp, si) => {
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
  // 大块优先：更容易一次就找到高覆盖率、块数少的解
  for (const list of placementsAt) list.sort((a, b) => b.size - a.size)

  /* ---------- 必填形状（唯一 id → 槽位） ---------- */
  const shapeIndexById = new Map(shapes.map((s, i) => [s.id, i]))
  const slotOfShape = new Array(shapes.length).fill(-1)
  const reqIds = []
  const reqCounts = []
  const reqShapeIndex = []
  const unplaceable = [] // 棋盘里根本放不下的必填形状（直接算未放置）
  if (basedOnSet && required) {
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
    const missed = unplaceable.map(id => shapes[shapeIndexById.get(id)]).filter(Boolean)
    reqIds.forEach((id, slot) => {
      const left = rem[slot] ?? 0
      for (let i = 0; i < left; i++) {
        const si = shapeIndexById.get(id)
        if (si !== undefined) missed.push(shapes[si])
      }
    })
    return missed
  }

  if (totalAvail === 0 || (!fillRemaining && totalReq === 0)) {
    return { placements: [], covered: 0, totalAvail, blocks: 0, missed: missedOf(reqCounts), optimal: true }
  }

  const budget = { used: 0, max: MAX_STATES, t0: Date.now() }
  const overBudget = () => budget.used > budget.max || Date.now() - budget.t0 > MAX_MS
  const bit = i => 1n << BigInt(i)

  const lowestFree = done => {
    for (let i = 0; i < N; i++) {
      if (availArr[i] && !((done >> BigInt(i)) & 1n)) return i
    }
    return -1
  }

  /**
   * 枚举某状态在锚点 i 处的所有合法走法（含「留空」）。
   * preferRequired=true 时把「会消耗必填槽位」的走法排到最前面，
   * 让存在性搜索尽快把必填形状都放下去（剪枝更有效）。
   */
  const movesAt = (i, filled, rem, preferRequired) => {
    const list = []
    const reqMoves = []
    for (const pm of placementsAt[i]) {
      if ((filled & pm.mask) !== 0n) continue
      const slot = slotOfShape[pm.si]
      const consume = slot >= 0 && rem[slot] > 0
      if (!consume && !fillRemaining) continue
      let childRem = rem
      if (consume) { childRem = rem.slice(); childRem[slot]-- }
      const next = filled | pm.mask
      const mv = {
        skip: false,
        placement: pm,
        consume,
        childRem,
        childDone: next,
        childFilled: next,
        size: pm.size,
      }
      if (preferRequired && consume) reqMoves.push(mv)
      else list.push(mv)
    }
    list.push({ skip: true, cell: i, childRem: rem, childDone: null, childFilled: filled, size: 0 })
    return preferRequired ? reqMoves.concat(list) : list
  }

  /**
   * 求「必填全部放下、留空 ≤ maxSkips」的解：
   *   阶段一 找任意解（存在性），阶段二 在预算内减少块数。
   */
  const solveLevel = maxSkips => {
    const keyOf = (done, filled, rem) => done.toString(36) + '|' + filled.toString(36) + '|' + rem.join(',')
    const allReqPlaced = rem => rem.every(v => v <= 0)

    // 「剩余必填是否还放得下」缓存（blocked = 已处理格 = 已填充 ∪ 已留空）
    const fitMemo = new Map()
    const canPlaceRemaining = (blocked, rem) => {
      const k = blocked.toString(36) + '#' + rem.join(',')
      const c = fitMemo.get(k)
      if (c !== undefined) return c
      let ok = true
      for (let s = 0; s < rem.length && ok; s++) {
        if (rem[s] <= 0) continue
        let any = false
        for (const mask of placementsByShape[reqShapeIndex[s]]) {
          if ((mask & blocked) === 0n) { any = true; break }
        }
        if (!any) ok = false
      }
      fitMemo.set(k, ok)
      return ok
    }

    /* ---------- 阶段一：找任意可行解 ---------- */
    const failMemo = new Set()
    const walk = []
    let path = null
    const find = (done, filled, rem, skips) => {
      if (path) return true
      if (++budget.used > budget.max) throw ABORT
      if ((budget.used & 1023) === 0 && Date.now() - budget.t0 > MAX_MS) throw ABORT
      const key = keyOf(done, filled, rem)
      if (failMemo.has(key)) return false
      const i = lowestFree(done)
      if (i === -1) {
        if (allReqPlaced(rem)) { path = walk.slice(); return true }
        failMemo.add(key)
        return false
      }
      if (!canPlaceRemaining(done, rem)) { failMemo.add(key); return false }
      for (const mv of movesAt(i, filled, rem, true)) {
        if (mv.skip) {
          if (skips >= maxSkips) continue
          walk.push(mv)
          const ok = find(done | bit(i), filled, rem, skips + 1)
          walk.pop()
          if (ok) return true
        } else {
          walk.push(mv)
          const ok = find(mv.childDone, mv.childFilled, mv.childRem, skips)
          walk.pop()
          if (ok) return true
        }
      }
      failMemo.add(key)
      return false
    }
    if (!find(0n, 0n, reqCounts.slice(), 0)) return null

    /* ---------- 阶段二：分支限界减少块数 ---------- */
    const countOf = p => p.reduce((a, m) => a + (m.skip ? 0 : 1), 0)
    let bestPath = path
    let bestCount = countOf(path)
    const seen = new Map()
    const stopped = { v: false }

    const improve = (done, filled, rem, skips, count) => {
      if (stopped.v || count >= bestCount) return
      if (overBudget()) { stopped.v = true; return }
      budget.used++
      const i = lowestFree(done)
      if (i === -1) {
        if (allReqPlaced(rem) && count < bestCount) { bestCount = count; bestPath = walk.slice() }
        return
      }
      const key = keyOf(done, filled, rem)
      const prev = seen.get(key)
      if (prev !== undefined && prev <= count) return
      seen.set(key, count)
      if (!canPlaceRemaining(done, rem)) return
      for (const mv of movesAt(i, filled, rem)) {
        if (mv.skip) {
          if (skips >= maxSkips) continue
          walk.push(mv)
          improve(done | bit(i), filled, rem, skips + 1, count)
          walk.pop()
        } else {
          walk.push(mv)
          improve(mv.childDone, mv.childFilled, mv.childRem, skips, count + 1)
          walk.pop()
        }
        if (stopped.v) return
      }
    }
    improve(0n, 0n, reqCounts.slice(), 0, 0)

    /* ---------- 还原解 ---------- */
    const rem = reqCounts.slice()
    const placements = []
    let covered = 0, blocks = 0, skips = 0, reqPlaced = 0
    for (const mv of bestPath) {
      if (mv.skip) { skips++; continue }
      placements.push({
        blockId: shapes[mv.placement.si].id,
        cells: mv.placement.cells.map(k => [Math.floor(k / cols), k % cols]),
      })
      covered += mv.placement.size
      blocks++
      if (mv.consume) { rem[slotOfShape[mv.placement.si]]--; reqPlaced++ }
    }

    return { placements, covered, totalAvail, blocks, reqPlaced, skips, rem, optimal: true }
  }

  /* ---------- 迭代加深：留空 0 → 1 → 2 … 取第一个可行解 ---------- */
  const skipsCap = Math.min(totalAvail, MAX_SKIPS)
  for (let k = 0; k <= skipsCap; k++) {
    const sol = solveLevel(k)
    if (!sol) continue
    return {
      placements: sol.placements,
      covered: sol.covered,
      totalAvail: sol.totalAvail,
      blocks: sol.blocks,
      missed: missedOf(sol.rem),
      optimal: true,
    }
  }
  return null
}

/* ===================== 贪心近似（回退方案） ===================== */
function greedySolve(rows, cols, available, required, { basedOnSet = true, fillRemaining = true } = {}) {
  const occupied = new Set()
  const key = (r, c) => r + ',' + c
  const placements = []

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
    placements.push({ blockId: shp.id, cells })
  }

  const tryPlaceShape = shp => {
    for (const [br, bc] of availCells) {
      if (canPlaceAt(shp, br, bc)) {
        placeAt(shp, br, bc)
        return true
      }
    }
    return false
  }

  const missed = []

  if (basedOnSet) {
    const pending = []
    for (const [shapeId, count] of Object.entries(required || {})) {
      const shp = SHAPES.find(s => s.id === shapeId)
      if (!shp) continue
      for (let i = 0; i < count; i++) pending.push(shp)
    }
    pending.sort((a, b) => b.cells.length - a.cells.length)
    for (const shp of pending) {
      if (!tryPlaceShape(shp)) missed.push(shp)
    }
  }

  if (fillRemaining) {
    const fillOrder = [...SHAPES].sort((a, b) => b.cells.length - a.cells.length)
    let progress = true
    let guard = 0
    while (progress && guard++ < 500) {
      progress = false
      for (const shp of fillOrder) {
        if (tryPlaceShape(shp)) {
          progress = true
          break
        }
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

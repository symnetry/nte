import { SHAPE_MAP } from './shapes.js'

/* ===================== 驱动块满级词条数据 =====================
 * 数值来源：《异环》驱动块官方数据逆向（yh.zzzmap.com /api/drive，2026-09-12 抓取）。
 * 规则：
 *   1. 每块固定共存「攻击力 + 生命值」两条主属性（固定值，非百分比）；
 *   2. 副词条从 11 条池中最多 4 条、块内不重复（「攻击力%」与「攻击力(固定)」
 *      是两条不同词条，可共存）；
 *   3. 所有词条满级值与格子数严格线性：满级值 = 每格基准 × 格子数
 *      （Ⅱ型 2 格、Ⅲ型 3 格、Ⅳ型 4 格）。
 * 这里取的是满级满值（「按最高的拿」），不做随机档位模拟。
 */

export const MAIN_STATS = [
  { id: 'mainAtk', name: '攻击力', perCell: 21 },
  { id: 'mainHp', name: '生命值', perCell: 280 },
]

/** 副词条池（11 条）。unit='%' 表示百分比词条，否则为固定值 */
export const SUBSTAT_POOL = [
  { id: 'atkPct', name: '攻击力%', perCell: 1.25, unit: '%' },
  { id: 'atkFlat', name: '攻击力', perCell: 8, unit: '' },
  { id: 'hpPct', name: '生命值%', perCell: 1.25, unit: '%' },
  { id: 'hpFlat', name: '生命值', perCell: 100, unit: '' },
  { id: 'defPct', name: '防御力%', perCell: 1.75, unit: '%' },
  { id: 'defFlat', name: '防御力', perCell: 8, unit: '' },
  { id: 'critRate', name: '暴击率', perCell: 1, unit: '%' },
  { id: 'critDmg', name: '暴击伤害', perCell: 2, unit: '%' },
  { id: 'tilt', name: '倾陷强度', perCell: 6, unit: '' },
  { id: 'ring', name: '环合强度', perCell: 6, unit: '' },
  { id: 'dmgBoost', name: '通用伤害增强', perCell: 1, unit: '%' },
]

export const SUBSTAT_MAP = Object.fromEntries(SUBSTAT_POOL.map(s => [s.id, s]))
export const SUBSTAT_SLOTS = 4

export const BLOCK_TYPE_ORDER = ['IV', 'III', 'II']
export const TYPE_LABELS = { IV: 'Ⅳ型', III: 'Ⅲ型', II: 'Ⅱ型' }

const round2 = v => Math.round(v * 100) / 100

/** 数值文本：去尾零，百分比带 % */
export function formatStatValue(def, value) {
  const n = round2(value)
  return String(n) + (def.unit || '')
}

/** 某块（cells 格）某条副词条的满级满值文本，如「攻击力% +3.75%」 */
export function substatLabel(statId, cells) {
  const def = SUBSTAT_MAP[statId]
  if (!def) return ''
  return `${def.name} +${formatStatValue(def, def.perCell * cells)}`
}

/** 主属性满级值（固定共存）：{ mainAtk, mainHp } */
export function mainStatsFor(cells) {
  return { mainAtk: 21 * cells, mainHp: 280 * cells }
}

/** 归一化副词条槽位：长度固定 4、去重、仅保留合法 id，非法输入容错 */
export function normalizeSubstats(raw) {
  const out = [null, null, null, null]
  if (!Array.isArray(raw)) return out
  const seen = new Set()
  let i = 0
  for (const id of raw) {
    if (i >= SUBSTAT_SLOTS) break
    if (!SUBSTAT_MAP[id] || seen.has(id)) continue
    seen.add(id)
    out[i++] = id
  }
  return out
}

/**
 * 聚合画布上全部已放置块的满级属性（主属性恒计入，副词条只计已选项）。
 * 返回 { blockCount, fullCount, mainAtk, mainHp, subs: [{ def, value }] }
 */
export function aggregatePlacements(placements) {
  let mainAtk = 0
  let mainHp = 0
  let fullCount = 0
  let blockCount = 0
  const totals = {}
  for (const p of placements || []) {
    const shp = SHAPE_MAP[p.blockId]
    if (!shp) continue
    const cells = shp.cells.length
    blockCount++
    mainAtk += 21 * cells
    mainHp += 280 * cells
    const subs = normalizeSubstats(p.substats)
    if (subs.every(Boolean)) fullCount++
    for (const id of subs) {
      if (!id) continue
      totals[id] = (totals[id] || 0) + SUBSTAT_MAP[id].perCell * cells
    }
  }
  const subs = SUBSTAT_POOL
    .map(def => ({ def, value: round2(totals[def.id] || 0) }))
    .filter(x => x.value > 0)
  return { blockCount, fullCount, mainAtk, mainHp, subs }
}

/**
 * 毕业差异评估：把画布上每个已放置块的副词条与其类型的毕业目标对比。
 * target: { IV: [4 id], III: [4 id], II: [4 id] }（某类型未配满则该类型块跳过评估）。
 * 词条按「集合」比较（顺序无关）；返回逐块状态与汇总缺口。
 */
export function evaluateGraduation(placements, target) {
  const goals = {}
  for (const type of BLOCK_TYPE_ORDER) goals[type] = normalizeSubstats(target?.[type])

  const evaluated = []
  const missingCounts = {}
  const targetAttr = {}
  const currentAttr = {}
  let graduatedCount = 0
  for (const p of placements || []) {
    const shp = SHAPE_MAP[p.blockId]
    if (!shp) continue
    const goal = goals[shp.type]
    if (!goal.every(Boolean)) continue
    const cells = shp.cells.length
    const current = normalizeSubstats(p.substats)
    const curSet = new Set(current.filter(Boolean))
    const goalSet = new Set(goal)
    const missing = goal.filter(id => !curSet.has(id))
    const extra = current.filter(Boolean).filter(id => !goalSet.has(id))
    const graduated = missing.length === 0
    if (graduated) graduatedCount++
    for (const id of missing) missingCounts[id] = (missingCounts[id] || 0) + 1
    for (const id of goal) targetAttr[id] = (targetAttr[id] || 0) + SUBSTAT_MAP[id].perCell * cells
    for (const id of curSet) currentAttr[id] = (currentAttr[id] || 0) + SUBSTAT_MAP[id].perCell * cells
    evaluated.push({ placement: p, type: shp.type, cells, current, missing, extra, matchCount: 4 - missing.length, graduated })
  }

  const attrGap = SUBSTAT_POOL
    .filter(def => targetAttr[def.id])
    .map(def => {
      const t = round2(targetAttr[def.id] || 0)
      const c = round2(currentAttr[def.id] || 0)
      return { def, target: t, current: c, delta: round2(c - t) }
    })

  return { evaluated, graduatedCount, missingCounts, attrGap }
}

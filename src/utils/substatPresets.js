import { SUBSTAT_MAP, SUBSTAT_SLOTS, normalizeSubstats } from '../data/driveStats.js'

/* ===================== 副词条方案（收藏）本地缓存 =====================
 * 方案 = 一组 4 条副词条的组合，可一键应用到画布上全部已放置块。
 * 与 storage.js 同一套路：localStorage + try/catch 静默降级。
 */

const PRESETS_KEY = 'nte_substat_presets'
const LAST_PLAN_KEY = 'nte_substat_last_plan'
const GRAD_TARGET_KEY = 'nte_grad_target'

/** 毕业目标默认值：三种类型都预填「双爆双攻」，可自行修改 */
export function defaultGradTarget() {
  return {
    IV: ['critRate', 'critDmg', 'atkPct', 'atkFlat'],
    III: ['critRate', 'critDmg', 'atkPct', 'atkFlat'],
    II: ['critRate', 'critDmg', 'atkPct', 'atkFlat'],
  }
}

export function loadGradTarget() {
  try {
    const raw = JSON.parse(localStorage.getItem(GRAD_TARGET_KEY) || 'null')
    return normalizeGradTarget(raw ?? defaultGradTarget())
  } catch {
    return normalizeGradTarget(defaultGradTarget())
  }
}

export function persistGradTarget(target) {
  try { localStorage.setItem(GRAD_TARGET_KEY, JSON.stringify(target)) } catch { /* 静默 */ }
}

/** 容错：{ IV/III/II: 4 词条 id }，逐类型归一化 */
export function normalizeGradTarget(raw) {
  const out = { IV: [null, null, null, null], III: [null, null, null, null], II: [null, null, null, null] }
  if (!raw || typeof raw !== 'object') return out
  for (const type of ['IV', 'III', 'II']) out[type] = normalizeSubstats(raw[type])
  return out
}

export function loadPresets() {
  try {
    return normalizePresets(JSON.parse(localStorage.getItem(PRESETS_KEY) || '[]'))
  } catch {
    return []
  }
}

export function persistPresets(presets) {
  try { localStorage.setItem(PRESETS_KEY, JSON.stringify(presets)) } catch { /* 静默 */ }
}

/** 上次在方案编辑区用过的 4 条词条（跨会话记忆） */
export function loadLastPlan() {
  try {
    return normalizeSubstats(JSON.parse(localStorage.getItem(LAST_PLAN_KEY) || 'null'))
  } catch {
    return [null, null, null, null]
  }
}

export function persistLastPlan(substats) {
  try { localStorage.setItem(LAST_PLAN_KEY, JSON.stringify(substats)) } catch { /* 静默 */ }
}

export function makePresetId() {
  return `sp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

/** 方案默认名：按词条名拼接，如「暴击率/暴击伤害/攻击力%/攻击力」 */
export function autoPresetName(substats) {
  return substats.filter(Boolean).map(id => SUBSTAT_MAP[id].name).join('/')
}

/** 容错：仅保留合法形状 { id, name, substats[4] }，substats 归一化去重 */
export function normalizePresets(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue
    const substats = normalizeSubstats(p.substats)
    if (!substats.every(Boolean)) continue
    out.push({
      id: typeof p.id === 'string' && p.id ? p.id : makePresetId(),
      name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : autoPresetName(substats),
      substats,
    })
  }
  return out
}

/** 按 id 合并：同 id 覆盖为新版，其余追加 */
export function mergePresets(existing, incoming) {
  const byId = new Map(existing.map(p => [p.id, p]))
  let updated = 0
  for (const p of incoming) {
    if (byId.has(p.id)) updated++
    byId.set(p.id, p)
  }
  return { list: [...byId.values()], added: incoming.length - updated, updated }
}

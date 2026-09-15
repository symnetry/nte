const SETS_KEY = 'nte_user_sets'
const CONTAINERS_KEY = 'nte_custom_containers'
const HIDDEN_SETS_KEY = 'nte_hidden_sets'

export function loadSets() {
  try {
    return JSON.parse(localStorage.getItem(SETS_KEY) || '[]')
  } catch {
    return []
  }
}

export function persistSets(sets) {
  try {
    localStorage.setItem(SETS_KEY, JSON.stringify(sets))
  } catch { /* localStorage 不可用时静默 */ }
}

export function loadContainers() {
  try {
    return JSON.parse(localStorage.getItem(CONTAINERS_KEY) || '[]')
  } catch {
    return []
  }
}

export function persistContainers(containers) {
  try {
    localStorage.setItem(CONTAINERS_KEY, JSON.stringify(containers))
  } catch { /* localStorage 不可用时静默 */ }
}

/** 被「隐藏（不再展示）」的套装 id 列表 */
export function loadHiddenSetIds() {
  try {
    const v = JSON.parse(localStorage.getItem(HIDDEN_SETS_KEY) || '[]')
    return Array.isArray(v) ? v.filter(x => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function persistHiddenSetIds(ids) {
  try {
    localStorage.setItem(HIDDEN_SETS_KEY, JSON.stringify(ids))
  } catch { /* localStorage 不可用时静默 */ }
}

export function clearLocalData() {
  try {
    localStorage.removeItem(SETS_KEY)
    localStorage.removeItem(CONTAINERS_KEY)
    localStorage.removeItem(HIDDEN_SETS_KEY)
  } catch { /* ignore */ }
}

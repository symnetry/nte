/* ===================== JSON 数据解析 / 合并 / 下载 ===================== */

function readAsText(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result)
    fr.onerror = () => reject(new Error('读取文件失败'))
    fr.readAsText(file)
  })
}

export function parseJsonFile(file) {
  const text = typeof file.text === 'function' ? file.text() : readAsText(file)
  return text.then(t => JSON.parse(t))
}

function genId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`
}

export function normalizeSets(data) {
  const sets = Array.isArray(data) ? data : data.sets
  if (!Array.isArray(sets)) throw new Error('格式错误')
  return sets.map(s => ({
    id: s.id || genId('set'),
    name: s.name || '未命名',
    slots: (s.slots || []).slice(0, 4).concat([null, null, null, null]).slice(0, 4),
  }))
}

export function normalizeContainers(data) {
  const list = Array.isArray(data) ? data : (data.containers || (data.grid ? [data] : null))
  if (!list) throw new Error('格式错误：应为容器对象或数组')
  return list.map(item => {
    if (!item.grid) throw new Error('缺少 grid 字段')
    const rows = Math.max(1, Math.min(10, parseInt(item.grid.rows) || 5))
    const cols = Math.max(1, Math.min(10, parseInt(item.grid.cols) || 5))
    const available = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => {
        const row = item.grid.available && item.grid.available[r]
        return row ? !!row[c] : true
      }),
    )
    return {
      id: item.id || genId('char'),
      name: item.name || '未命名容器',
      rows, cols, available,
    }
  })
}

/**
 * 合并一批已解析的 JSON 数据（可能是 {sets:[...]} / {grid:...} / 数组 / 单对象）：
 * ① id 相同且名称相同 → 更新；② id 相同但名称不同 → 重建 id（避免文件复制产生的 id 冲突互相覆盖）；
 * ③ 名称相同 → 更新（保留本地 id）；④ 全新 → 新增。
 */
export function mergeNormalized(items, normalize, list) {
  const next = [...list]
  const stats = { added: 0, updated: 0, skipped: 0, errors: [] }
  for (const data of items) {
    try {
      const arr = normalize(data)
      for (let item of arr) {
        // 1) id 精确匹配（id 相同且名称相同 → 同一条目，更新）
        if (item.id) {
          const idx = next.findIndex(x => x.id === item.id)
          if (idx >= 0) {
            const local = next[idx]
            if (item.name && local.name && item.name === local.name) {
              next[idx] = { ...item, id: local.id }
              stats.updated++
              continue
            }
            // id 相同但名称不同（如文件复制产生的 id 冲突）→ 重建 id，避免互相覆盖
            item = { ...item, id: genId(item.id.startsWith('set') ? 'set' : 'char') }
          }
        }
        // 2) 名称兜底匹配（名称非空且非默认名）
        if (item.name && item.name !== '未命名' && item.name !== '未命名容器') {
          const idx = next.findIndex(x => x.name === item.name)
          if (idx >= 0) {
            next[idx] = { ...item, id: next[idx].id }
            stats.updated++
            continue
          }
        }
        next.push(item)
        stats.added++
      }
    } catch (err) {
      stats.skipped++
      stats.errors.push(err.message)
    }
  }
  return { list: next, stats }
}

/**
 * 合并导入文件：先解析 JSON，再走 mergeNormalized。
 */
export async function mergeFromFiles(files, normalize, list) {
  const datas = []
  const stats = { added: 0, updated: 0, skipped: 0, errors: [] }
  for (const f of files) {
    try {
      datas.push(await parseJsonFile(f))
    } catch (err) {
      stats.skipped++
      stats.errors.push(`${f.name}: ${err.message}`)
    }
  }
  const res = mergeNormalized(datas, normalize, list)
  return {
    list: res.list,
    stats: { ...res.stats, skipped: res.stats.skipped + stats.skipped, errors: [...stats.errors, ...res.stats.errors] },
  }
}

export function buildImportMsg(kind, fileCount, stats) {
  return `已批量导入 ${fileCount} 个文件：${kind} 新增 ${stats.added}，更新 ${stats.updated}`
    + (stats.skipped ? `，跳过 ${stats.skipped}（${stats.errors.join('；')}）` : '')
}

export function safeFileName(name) {
  return String(name || '').replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'unnamed'
}

export function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/**
 * 从部署目录在线加载 JSON 数据（suit/character）。
 * 依赖构建时生成的 manifest.json（见 vite.config.js generateManifest 插件）。
 */
export async function fetchRemoteData(kind) {
  const base = import.meta.env.BASE_URL || '/nte/'
  const manifestUrl = `${base}${kind}/manifest.json`
  const res = await fetch(manifestUrl)
  if (!res.ok) throw new Error(`清单加载失败（HTTP ${res.status}）：${manifestUrl}`)
  const manifest = await res.json()
  const files = (manifest.files || []).map(f => f.name)
  const items = []
  const errors = []
  for (const name of files) {
    try {
      const r = await fetch(`${base}${kind}/${encodeURIComponent(name)}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      items.push(JSON.parse(await r.text()))
    } catch (err) {
      errors.push(`${name}: ${err.message}`)
    }
  }
  return { items, errors, files }
}

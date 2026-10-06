import React, { useEffect, useRef, useState } from 'react'
import { NteContext, useNte } from './context.js'
import {
  loadSets, persistSets, loadContainers, persistContainers,
  loadHiddenSetIds, persistHiddenSetIds,
} from '../utils/storage.js'
import {
  normalizeSets,
  normalizeContainers,
  mergeFromFiles,
  mergeNormalized,
  fetchRemoteData,
  safeFileName,
  downloadText,
  buildImportMsg,
} from '../utils/jsonIO.js'
import { solve } from '../utils/solver.js'

// 转发导出，兼容组件现有 import 路径
export { useNte } from './context.js'

function makeGrid(rows, cols, val = true) {
  return Array.from({ length: rows }, () => Array(cols).fill(val))
}

export function NteProvider({ children }) {
  const [userSets, setUserSets] = useState(loadSets)
  const [customContainers, setCustomContainers] = useState(loadContainers)
  const [hiddenSetIds, setHiddenSetIds] = useState(loadHiddenSetIds)
  const [rows, setRows] = useState(5)
  const [cols, setCols] = useState(5)
  const [available, setAvailable] = useState(() => makeGrid(5, 5))
  const [placements, setPlacements] = useState([])
  const [required, setRequired] = useState({})
  const [palette, setPalette] = useState({}) // 可选形状池（库存上限）：{ 形状id: 数量 }
  const [selectedSetId, setSelectedSetId] = useState('')
  const [basedOnSet, setBasedOnSet] = useState(true)
  const [fillRemaining, setFillRemaining] = useState(true)
  const [usePalette, setUsePalette] = useState(false) // 新逻辑开关：是否限定可选形状池（默认关=旧逻辑）
  const [vanity, setVanity] = useState(false) // 虚荣模式：限定可选形状池的分支，套装块变非必选、全部所选形状均为可选池
  const [solutions, setSolutions] = useState([])        // 枚举得到的所有合法铺法
  const [solutionIndex, setSolutionIndex] = useState(0)  // 当前展示的方案序号
  const [solutionTruncated, setSolutionTruncated] = useState(false) // 方案是否因预算/上限被截断
  const [charName, setCharName] = useState('')
  const [containerSelectedId, setContainerSelectedId] = useState('')
  const [status, setStatus] = useState({ msg: '就绪', isError: false })
  const [modal, setModal] = useState(null) // { mode:'sets'|'container'|'config', isImport, title }
  const [jsonText, setJsonText] = useState('')
  const [dialog, setDialog] = useState(null) // 应用内确认框 { title, message }
  // 图库「点选放置」模式：记录选中的形状 id；libDragRef 供 HTML5 拖拽跨组件传递形状 id
  const [armedShapeId, setArmedShapeId] = useState('')
  const libDragRef = useRef({ blockId: null })
  const dialogResolveRef = useRef(null)

  // 异步闭包读取最新值
  const userSetsRef = useRef(userSets)
  const containersRef = useRef(customContainers)
  const hiddenSetIdsRef = useRef(hiddenSetIds)
  const rowsRef = useRef(rows)
  const colsRef = useRef(cols)
  const availableRef = useRef(available)
  const placementsRef = useRef(placements)
  const requiredRef = useRef(required)
  const paletteRef = useRef(palette)
  const usePaletteRef = useRef(usePalette)
  const vanityRef = useRef(vanity)
  const solutionsRef = useRef(solutions)
  const solutionIndexRef = useRef(solutionIndex)
  const selectedSetIdRef = useRef(selectedSetId)
  const containerSelectedIdRef = useRef(containerSelectedId)
  const charNameRef = useRef(charName)
  const containerExportNameRef = useRef('')
  useEffect(() => { userSetsRef.current = userSets }, [userSets])
  useEffect(() => { containersRef.current = customContainers }, [customContainers])
  useEffect(() => { hiddenSetIdsRef.current = hiddenSetIds }, [hiddenSetIds])
  useEffect(() => { rowsRef.current = rows; colsRef.current = cols }, [rows, cols])
  useEffect(() => { availableRef.current = available }, [available])
  useEffect(() => { placementsRef.current = placements }, [placements])
  useEffect(() => { requiredRef.current = required }, [required])
  useEffect(() => { paletteRef.current = palette }, [palette])
  useEffect(() => { usePaletteRef.current = usePalette }, [usePalette])
  useEffect(() => { vanityRef.current = vanity }, [vanity])
  useEffect(() => { solutionsRef.current = solutions }, [solutions])
  useEffect(() => { solutionIndexRef.current = solutionIndex }, [solutionIndex])
  useEffect(() => { selectedSetIdRef.current = selectedSetId }, [selectedSetId])
  useEffect(() => { containerSelectedIdRef.current = containerSelectedId }, [containerSelectedId])
  useEffect(() => { charNameRef.current = charName }, [charName])

  const notify = (msg, isError = false) => setStatus({ msg, isError })

  /* ---------- 应用内确认框 ----------
   * Electron 内嵌浏览器不支持 window.prompt，window.confirm 也可能被拦截，
   * 因此统一走应用内对话框，保证任何环境下都能正常交互。
   */
  const confirmAsync = (message, title = '请确认') => new Promise(resolve => {
    dialogResolveRef.current = resolve
    setDialog({ title, message })
  })

  const closeDialog = result => {
    const resolve = dialogResolveRef.current
    dialogResolveRef.current = null
    setDialog(null)
    if (resolve) resolve(result)
  }

  /* ---------- 网格 ---------- */
  const setGrid = async (r, c, confirmText) => {
    const nr = Math.max(1, Math.min(10, parseInt(r) || 5))
    const nc = Math.max(1, Math.min(10, parseInt(c) || 5))
    if (nr === rowsRef.current && nc === colsRef.current) return false
    if (placementsRef.current.length > 0 && confirmText && !(await confirmAsync(confirmText, '改变网格尺寸'))) return false
    setRows(nr); setCols(nc)
    setAvailable(makeGrid(nr, nc))
    setPlacements([])
    notify(`网格已调整为 ${nr}×${nc}`)
    return true
  }

  const toggleCell = (r, c) => {
    setAvailable(prev => {
      const next = prev.map(row => [...row])
      next[r][c] = !next[r][c]
      return next
    })
  }

  const resetBoard = () => {
    setAvailable(makeGrid(rowsRef.current, colsRef.current))
    setPlacements([])
    notify('已清空放置并重置全部可用')
  }

  const clearPlacements = () => {
    setPlacements([])
    notify('已清空放置')
  }

  /* ---------- 求解（枚举全部合法铺法，展示第 1 个） ---------- */
  const runSolve = () => {
    const res = solve(rowsRef.current, colsRef.current, availableRef.current, requiredRef.current, paletteRef.current, { basedOnSet, fillRemaining, usePalette, vanity })
    const list = res.solutions || []
    setSolutions(list)
    setSolutionTruncated(!!res.truncated)
    setSolutionIndex(0)
    const first = list[0] || { placements: [] }
    setPlacements(first.placements || [])
    const parts = []
    if (list.length > 1) {
      // 所有方案都是「精准占满」的合格解
      parts.push(`共 ${list.length} 个完全铺满方案${res.truncated ? '（已截断）' : ''}${vanity ? '（虚荣模式）' : ''}，当前第 1 个；用「上一方案/下一方案」翻看`)
    } else if (list.length === 1) {
      parts.push(`分配完成（${res.mode === 'greedy' ? '贪心近似' : '精确枚举'}${vanity ? '·虚荣模式' : ''}）：放置 ${first.blocks} 个块，铺满 ${first.covered}/${res.totalAvail} 格`)
    } else {
      parts.push(vanity
        ? '未找到可完全铺满的方案（所选可选池无法精准填满所有空格）'
        : '未找到可完全铺满的方案（存在无法填补的空格）')
    }
    if (res.missed.length) parts.push(`无法放置必填：${res.missed.map(s => s.name).join('、')}`)
    if (res.mode === 'greedy') {
      parts.push(res.exactTruncated
        ? '组合数过多、搜索超时，已回退贪心近似（可能仍有空格未填满）'
        : '已回退到贪心近似（存在空格未填满，非完全铺满）')
    }
    notify(parts.join('；'), res.missed.length > 0 || res.mode === 'greedy')
    return res
  }

  /* ---------- 方案分页：切换到第 i 个方案（保存当前方案的副词条编辑） ---------- */
  const gotoSolution = i => {
    const arr = solutionsRef.current
    if (!arr.length) return
    const idx = Math.max(0, Math.min(arr.length - 1, i))
    if (idx === solutionIndexRef.current) return
    const next = arr.slice()
    next[solutionIndexRef.current] = { ...next[solutionIndexRef.current], placements: placementsRef.current }
    setSolutions(next)
    setSolutionIndex(idx)
    setPlacements(next[idx].placements || [])
  }

  /* ---------- 套装 ---------- */
  const addSet = () => {
    const id = `set_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`
    const next = [...userSetsRef.current, { id, name: '新套装', slots: [null, null, null, null] }]
    setUserSets(next); persistSets(next)
    notify('已新建套装')
    return id
  }

  const updateSet = (id, patch) => {
    const next = userSetsRef.current.map(s => (s.id === id ? { ...s, ...patch } : s))
    setUserSets(next); persistSets(next)
  }

  const deleteSet = id => {
    const next = userSetsRef.current.filter(s => s.id !== id)
    setUserSets(next); persistSets(next)
    const nextHidden = hiddenSetIdsRef.current.filter(x => x !== id)
    setHiddenSetIds(nextHidden); persistHiddenSetIds(nextHidden)
    if (selectedSetIdRef.current === id) {
      setSelectedSetId('')
      setRequired({})
    }
    notify('已删除套装')
  }

  /** 隐藏（不再展示）/ 恢复展示某个套装，配置存本地 */
  const toggleSetHidden = id => {
    const next = hiddenSetIdsRef.current.includes(id)
      ? hiddenSetIdsRef.current.filter(x => x !== id)
      : [...hiddenSetIdsRef.current, id]
    setHiddenSetIds(next); persistHiddenSetIds(next)
    if (selectedSetIdRef.current === id && next.includes(id)) {
      setSelectedSetId('')
      setRequired({})
    }
  }

  const importSets = async files => {
    const { list, stats } = await mergeFromFiles(files, normalizeSets, userSetsRef.current)
    setUserSets(list); persistSets(list)
    return stats
  }

  const importRemoteSets = async () => {
    const { items, errors, files } = await fetchRemoteData('suit')
    const { list, stats } = mergeNormalized(items, normalizeSets, userSetsRef.current)
    setUserSets(list); persistSets(list)
    return { stats, errors, files }
  }

  /* ---------- 容器 ---------- */
  const getSelectedContainer = () =>
    containersRef.current.find(c => c.id === containerSelectedIdRef.current) || null

  const saveCurrentContainer = async name => {
    const trimmed = (name || '').trim()
    if (!trimmed) { notify('请为当前画布指定容器名', true); return null }
    const replaced = containersRef.current.find(c => c.name === trimmed)
    let next, id
    if (replaced) {
      if (!(await confirmAsync(`已存在同名容器「${trimmed}」，是否用当前画布覆盖它？`, '覆盖容器'))) { notify('已取消保存容器'); return null }
      id = replaced.id
      next = containersRef.current.map(c => (c.id === replaced.id
        ? { ...c, rows: rowsRef.current, cols: colsRef.current, available: availableRef.current.map(r => [...r]) }
        : c))
    } else {
      id = `char_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`
      next = [...containersRef.current, {
        id,
        name: trimmed,
        rows: rowsRef.current,
        cols: colsRef.current,
        available: availableRef.current.map(r => [...r]),
      }]
    }
    setCustomContainers(next); persistContainers(next)
    notify(`容器「${trimmed}」已保存（${rowsRef.current}×${colsRef.current}）`)
    return id
  }

  const applyContainer = async container => {
    if (!container) { notify('请先在下拉框选择要应用的容器', true); return }
    if (placementsRef.current.length > 0 && !(await confirmAsync('应用容器会清空当前放置，继续？', '应用容器'))) return
    setRows(container.rows); setCols(container.cols)
    setAvailable(container.available.map(r => [...r]))
    setPlacements([])
    notify(`已应用容器「${container.name}」，左键点击格子可继续编辑可选/不可选区域`)
  }

  const renameContainer = (container, newName) => {
    if (!container) { notify('请先选择要重命名的容器', true); return }
    const trimmed = (newName || '').trim()
    if (!trimmed || trimmed === container.name) return
    const next = containersRef.current.map(c => (c.id === container.id ? { ...c, name: trimmed } : c))
    setCustomContainers(next); persistContainers(next)
    notify(`容器已重命名为「${trimmed}」`)
  }

  const deleteContainer = async container => {
    if (!container) { notify('请先选择要删除的容器', true); return }
    if (!(await confirmAsync(`确定删除容器「${container.name}」？`, '删除容器'))) return
    const next = containersRef.current.filter(c => c.id !== container.id)
    setCustomContainers(next); persistContainers(next)
    if (containerSelectedIdRef.current === container.id) setContainerSelectedId('')
    notify(`已删除容器「${container.name}」`)
  }

  const importContainers = async files => {
    const { list, stats } = await mergeFromFiles(files, normalizeContainers, containersRef.current)
    setCustomContainers(list); persistContainers(list)
    return stats
  }

  const importRemoteContainers = async () => {
    const { items, errors, files } = await fetchRemoteData('character')
    const { list, stats } = mergeNormalized(items, normalizeContainers, containersRef.current)
    setCustomContainers(list); persistContainers(list)
    return { stats, errors, files }
  }

  /* ---------- 必填形状 ---------- */
  const applySetToRequired = setId => {
    setSelectedSetId(setId)
    const set = userSetsRef.current.find(s => s.id === setId)
    if (!set) return
    const r = {}
    for (const sid of set.slots) {
      if (!sid) continue
      r[sid] = (r[sid] || 0) + 1
    }
    setRequired(r)
    setPalette({ ...r }) // 可选池默认自动包含套装形状
  }

  const incPalette = id => {
    setPalette(prev => {
      const v = prev[id] ? prev[id] + 1 : 1
      if (v > 4) {
        const { [id]: _drop, ...rest } = prev
        return rest
      }
      return { ...prev, [id]: v }
    })
  }

  const clearPalette = id => {
    setPalette(prev => {
      const { [id]: _drop, ...rest } = prev
      return rest
    })
  }

  /* ---------- 放置块的副词条 ---------- */
  const updatePlacementSubstats = (target, substats) => {
    setPlacements(prev => prev.map(p => (p === target ? { ...p, substats } : p)))
  }

  /** 一键全满：把同一组 4 条副词条应用到全部已放置块 */
  const applySubstatsToAll = substats => {
    setPlacements(prev => prev.map(p => ({ ...p, substats: [...substats] })))
  }

  /* ---------- 整体配置 ---------- */
  const loadConfig = config => {
    if (!config.grid) throw new Error('缺少 grid 字段')
    setRows(config.grid.rows)
    setCols(config.grid.cols)
    setAvailable(config.grid.available.map(row => row.map(v => !!v)))
    setPlacements((config.solution || []).map(p => ({
      blockId: p.shapeId || p.blockId,
      cells: p.cells,
      ...(Array.isArray(p.substats) ? { substats: p.substats } : {}),
    })))
    setSolutions([])          // 导入配置后清空方案分页（以导入的放置为准）
    setSolutionIndex(0)
    setRequired(config.conditions?.required || {})
    setPalette(config.conditions?.palette || config.conditions?.required || {}) // 旧配置无 palette 时向后兼容
    setSelectedSetId(config.preset || '')
    if (config.name) setCharName(config.name)
    if (config.conditions) {
      setBasedOnSet(!!config.conditions.basedOnSet)
      setFillRemaining(!!config.conditions.fillRemaining)
      setUsePalette(!!config.conditions.usePalette)
      setVanity(!!config.conditions.vanity)
    }
  }

  /* ---------- 模态框（导入导出 JSON） ---------- */
  const buildJsonFor = mode => {
    if (mode === 'sets') {
      // 已隐藏的套装视同删除，不导出
      const visible = userSetsRef.current.filter(s => !hiddenSetIdsRef.current.includes(s.id))
      return JSON.stringify({ version: 1, sets: visible }, null, 2)
    }
    if (mode === 'container') {
      const c = getSelectedContainer()
      if (!c) return null
      containerExportNameRef.current = c.name
      return JSON.stringify({
        kind: 'character', version: 1,
        name: c.name,
        grid: {
          rows: c.rows, cols: c.cols,
          available: c.available.map(r => r.map(v => (v ? 1 : 0))),
        },
      }, null, 2)
    }
    const name = charNameRef.current.trim() || '未命名角色'
    return JSON.stringify({
      name, version: 3,
      grid: {
        rows: rowsRef.current, cols: colsRef.current,
        available: availableRef.current.map(r => r.map(v => (v ? 1 : 0))),
      },
      preset: selectedSetIdRef.current || null,
      conditions: { basedOnSet, fillRemaining, usePalette, vanity, required: requiredRef.current, palette: paletteRef.current },
      solution: placementsRef.current.map(p => ({ shapeId: p.blockId, cells: p.cells, substats: p.substats })),
    }, null, 2)
  }

  const openModal = (mode, isImport) => {
    if (!isImport) {
      const text = buildJsonFor(mode)
      if (text === null) {
        notify('请先选择要导出的容器', true)
        return
      }
      setJsonText(text)
    } else {
      setJsonText('')
    }
    const titles = {
      sets: isImport ? '导入套装 JSON' : '套装 JSON（可复制，或点「下载 JSON」保存到 suit/ 目录）',
      container: isImport ? '导入自定义容器 JSON' : '自定义容器 JSON（点「下载 JSON」保存到 character/ 目录）',
      config: isImport ? '导入整体配置 JSON' : '整体配置 JSON',
    }
    setModal({ mode, isImport, title: titles[mode] })
  }

  const closeModal = () => setModal(null)

  const applyModal = () => {
    if (!modal) return
    const { mode } = modal
    try {
      const data = JSON.parse(jsonText)
      if (mode === 'sets') {
        const list = normalizeSets(data)
        setUserSets(list); persistSets(list)
        notify(`套装导入成功：${list.length} 个`)
      } else if (mode === 'container') {
        const list = normalizeContainers(data)
        const next = [...containersRef.current, ...list]
        setCustomContainers(next); persistContainers(next)
        notify('容器导入成功：' + list.map(c => c.name).join('、'))
      } else {
        loadConfig(data)
        notify('导入成功')
      }
      closeModal()
    } catch (err) {
      notify('导入失败：' + err.message, true)
    }
  }

  const downloadModal = () => {
    if (!modal) return
    const { mode } = modal
    const text = jsonText
    let filename, dirHint
    if (mode === 'sets') {
      const firstName = userSetsRef.current[0] && safeFileName(userSetsRef.current[0].name)
      filename = `suit_${firstName || '套装配'}.json`
      dirHint = 'suit/'
    } else if (mode === 'container') {
      filename = `character_${safeFileName(containerExportNameRef.current || '容器')}.json`
      dirHint = 'character/'
    } else {
      const rname = safeFileName(charNameRef.current.trim() || '未命名角色')
      filename = `config_${rname}.json`
      dirHint = '项目根目录'
    }
    downloadText(filename, text)
    notify(`已生成下载文件「${filename}」，请保存到 ${dirHint} 目录`)
  }

  /* ---------- 首次进入时自动加载内置数据（public/suit、public/character 下的 json） ---------- */
  const bootstrappedRef = useRef(false)
  useEffect(() => {
    if (bootstrappedRef.current) return
    bootstrappedRef.current = true

    const jobs = []
    // 本地已有套装（或已隐藏过）就不再覆盖用户的数据
    if (userSetsRef.current.length === 0 && hiddenSetIdsRef.current.length === 0) {
      jobs.push(
        importRemoteSets().then(({ stats, files }) => {
          return files.length ? `内置套装 ${stats.added + stats.updated} 个` : ''
        }),
      )
    }
    if (containersRef.current.length === 0) {
      jobs.push(
        importRemoteContainers().then(({ stats, files }) => {
          return files.length ? `内置容器 ${stats.added + stats.updated} 个` : ''
        }),
      )
    }
    if (jobs.length === 0) return

    Promise.allSettled(jobs).then(results => {
      const parts = results
        .filter(r => r.status === 'fulfilled' && r.value)
        .map(r => r.value)
      if (parts.length) notify(`已加载${parts.join('、')}`)
    })
    // 单个请求失败（离线 / 未部署）不影响另一个，用户仍可手动点「在线加载」
  }, [])

  const handleRemoteLoad = async kind => {
    try {
      const res = kind === 'suit'
        ? await importRemoteSets()
        : await importRemoteContainers()
      const label = kind === 'suit' ? '套装' : '容器'
      const parts = [`已从服务器加载 ${res.files.length} 个${label}文件：新增 ${res.stats.added}，更新 ${res.stats.updated}`]
      if (res.errors.length) parts.push(`失败 ${res.errors.length}（${res.errors.join('；')}）`)
      notify(parts.join('；'), res.errors.length > 0)
    } catch (err) {
      notify(`从服务器加载失败：${err.message}`, true)
    }
  }

  const value = {
    userSets, setUserSets, customContainers, setCustomContainers,
    hiddenSetIds, toggleSetHidden,
    rows, cols, available, placements, setPlacements, required, status, notify,
    selectedSetId, setSelectedSetId, basedOnSet, setBasedOnSet, fillRemaining, setFillRemaining,
    usePalette, setUsePalette, vanity, setVanity,
    charName, setCharName, containerSelectedId, setContainerSelectedId,
    setGrid, toggleCell, resetBoard, clearPlacements, runSolve, loadConfig,
    solutions, solutionIndex, solutionTruncated, gotoSolution,
    armedShapeId, setArmedShapeId, libDragRef,
    addSet, updateSet, deleteSet, importSets, importRemoteSets,
    saveCurrentContainer, applyContainer, renameContainer, deleteContainer, importContainers, importRemoteContainers,
    applySetToRequired, palette, setPalette, incPalette, clearPalette, updatePlacementSubstats, applySubstatsToAll,
    modal, jsonText, setJsonText, openModal, closeModal, applyModal, downloadModal, handleRemoteLoad,
    dialog, closeDialog, confirmAsync,
    getSelectedContainer, buildImportMsg,
  }

  return <NteContext.Provider value={value}>{children}</NteContext.Provider>
}

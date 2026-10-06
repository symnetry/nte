import React, { useMemo, useRef, useState } from 'react'
import { useNte } from '../../state/useNteState.jsx'
import { SHAPE_MAP, ROLE_COLOR } from '../../data/shapes.js'
import {
  SUBSTAT_POOL, SUBSTAT_SLOTS, BLOCK_TYPE_ORDER, TYPE_LABELS,
  substatLabel, mainStatsFor, normalizeSubstats,
  aggregatePlacements, formatStatValue, evaluateGraduation,
} from '../../data/driveStats.js'
import {
  loadPresets, persistPresets, loadLastPlan, persistLastPlan,
  makePresetId, autoPresetName, normalizePresets, mergePresets,
  loadGradTarget, persistGradTarget,
} from '../../utils/substatPresets.js'
import { downloadText, parseJsonFile, buildImportMsg } from '../../utils/jsonIO.js'

const CELL = 48 // 与 Board.jsx 的格子尺寸保持一致
const PANEL_WIDTH = 300
const STORAGE_KEY = 'nte_substat_panel_open'
const EXPORT_NAME = 'substat_presets.json'

/* ============================================================
 * 驱动块词条悬浮窗（挂在画布/容器右侧，可展开可收起）
 * ------------------------------------------------------------
 * ① 每个已放置的块可自选 4 条副词条（11 条池内不重复），
 *    数值取该块格数对应的满级满值（如 Ⅲ型攻击力% = 3.75%）；
 * ② 「一键全满」把上方选好的 4 条方案应用到全部已放置块；
 * ③ 方案可收藏到 localStorage，卡片右上 ☆ 可直接收藏该块配置，
 *    并支持方案整体导出 / 导入 JSON。
 * ============================================================ */
export default function SubstatPanel() {
  const { rows, cols, placements, updatePlacementSubstats, applySubstatsToAll, notify } = useNte()
  const [open, setOpen] = useState(() => localStorage.getItem(STORAGE_KEY) !== '0')
  // 方案编辑区：默认双爆+双攻，跨会话记忆上次选择
  const [plan, setPlan] = useState(() => {
    const last = loadLastPlan()
    return last.every(Boolean) ? last : ['critRate', 'critDmg', 'atkPct', 'atkFlat']
  })
  const [planName, setPlanName] = useState('')
  const [presets, setPresets] = useState(loadPresets)
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef(null)
  // 毕业目标：按 Ⅱ/Ⅲ/Ⅳ 型各一套 4 词条目标，改动即存本地
  const [gradTarget, setGradTarget] = useState(loadGradTarget)
  const [gradOpen, setGradOpen] = useState(() => localStorage.getItem('nte_grad_panel_open') !== '0')

  const toggle = () => {
    setOpen(v => {
      localStorage.setItem(STORAGE_KEY, v ? '0' : '1')
      return !v
    })
  }

  const agg = useMemo(() => aggregatePlacements(placements), [placements])
  const grad = useMemo(() => evaluateGraduation(placements, gradTarget), [placements, gradTarget])
  const gradReadyTypes = BLOCK_TYPE_ORDER.filter(t => (gradTarget[t] || []).every(Boolean))

  const changeGrad = (type, slot, id) => {
    setGradTarget(prev => {
      const arr = (prev[type] || [null, null, null, null]).slice()
      arr[slot] = id || null
      const next = { ...prev, [type]: arr }
      persistGradTarget(next)
      return next
    })
  }

  const clearGrad = () => {
    const next = { IV: [null, null, null, null], III: [null, null, null, null], II: [null, null, null, null] }
    setGradTarget(next)
    persistGradTarget(next)
    notify('已清空毕业目标')
  }

  const toggleGrad = () => {
    setGradOpen(v => {
      localStorage.setItem('nte_grad_panel_open', v ? '0' : '1')
      return !v
    })
  }

  // 锚在棋盘右缘外侧；窗口不够宽时收回贴住右边缘（避免溢出屏幕）
  const anchorLeft = `min(calc(50% + ${(cols * CELL) / 2 + 16}px), calc(100% - ${PANEL_WIDTH + 16}px))`

  /* ---------- 方案编辑区 ---------- */
  const changePlan = (slot, id) => {
    setPlan(prev => {
      const next = prev.slice()
      next[slot] = id || null
      persistLastPlan(next)
      return next
    })
  }

  const applyPlanToAll = (substats, label) => {
    if (!substats.every(Boolean)) { notify('请先把 4 条方案词条都选好', true); return }
    if (placements.length === 0) { notify('画布上还没有已放置的驱动块', true); return }
    applySubstatsToAll(substats)
    notify(`已一键全满：${placements.length} 个块 → ${label || autoPresetName(substats)}`)
  }

  const savePreset = () => {
    if (!plan.every(Boolean)) { notify('请先把 4 条方案词条都选好再收藏', true); return }
    const preset = {
      id: makePresetId(),
      name: planName.trim() || autoPresetName(plan),
      substats: [...plan],
    }
    setPresets(prev => {
      const next = [...prev, preset]
      persistPresets(next)
      return next
    })
    setPlanName('')
    setSelectedPresetId(preset.id)
    notify(`已收藏方案「${preset.name}」`)
  }

  /** 卡片 ☆：直接收藏该块当前的 4 条副词条 */
  const starBlock = p => {
    const subs = normalizeSubstats(p.substats)
    if (!subs.every(Boolean)) { notify('该块还有副词条未选满，选满 4 条后再收藏', true); return }
    const preset = { id: makePresetId(), name: autoPresetName(subs), substats: subs }
    setPresets(prev => {
      const next = [...prev, preset]
      persistPresets(next)
      return next
    })
    notify(`已收藏方案「${preset.name}」`)
  }

  /** 下拉选中收藏的方案 = 载入编辑区 + 立即一键全满 */
  const selectPreset = id => {
    setSelectedPresetId(id)
    const preset = presets.find(p => p.id === id)
    if (!preset) return
    setPlan(preset.substats)
    persistLastPlan(preset.substats)
    applyPlanToAll(preset.substats, preset.name)
  }

  const deletePreset = () => {
    const preset = presets.find(p => p.id === selectedPresetId)
    if (!preset) { notify('请先在下拉框选择要删除的方案', true); return }
    setPresets(prev => {
      const next = prev.filter(p => p.id !== preset.id)
      persistPresets(next)
      return next
    })
    setSelectedPresetId('')
    notify(`已删除方案「${preset.name}」`)
  }

  const exportPresets = () => {
    if (presets.length === 0) { notify('还没有收藏任何方案', true); return }
    downloadText(EXPORT_NAME, JSON.stringify({ kind: 'substatPresets', version: 1, presets }, null, 2))
    notify(`已生成下载文件「${EXPORT_NAME}」`)
  }

  const onPresetFiles = async e => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length === 0) return
    setImporting(true)
    try {
      const stats = { added: 0, updated: 0, skipped: 0, errors: [] }
      const items = []
      for (const f of files) {
        try {
          const data = await parseJsonFile(f)
          const arr = Array.isArray(data) ? data : data.presets
          if (!Array.isArray(arr)) throw new Error('格式错误：应为方案数组')
          items.push(...arr)
        } catch (err) {
          stats.skipped++
          stats.errors.push(`${f.name}: ${err.message}`)
        }
      }
      const valid = normalizePresets(items)
      stats.skipped += items.length - valid.length
      const { list, added, updated } = mergePresets(presets, valid)
      stats.added = added
      stats.updated = updated
      setPresets(list); persistPresets(list)
      notify(buildImportMsg('方案', files.length, stats), stats.skipped > 0)
    } finally {
      setImporting(false)
    }
  }

  /* ---------- 渲染 ---------- */
  if (!open) {
    return (
      <button
        className="substat-tab"
        style={{ left: anchorLeft }}
        onClick={toggle}
        title="展开驱动块词条面板"
      >
        词条 · {agg.blockCount} 块 ▸
      </button>
    )
  }

  const renderPlanSelect = (slot, value, onChange, title) => (
    <select value={value || ''} title={title} onChange={e => onChange(slot, e.target.value)}>
      <option value="">词条 {slot + 1}（未选）</option>
      {SUBSTAT_POOL.map(def => {
        const usedElsewhere = plan.some((x, i) => i !== slot && x === def.id)
        if (usedElsewhere) return null
        return <option key={def.id} value={def.id}>{def.name}</option>
      })}
    </select>
  )

  return (
    <div className="substat-float" style={{ left: anchorLeft }}>
      <div className="substat-head" onClick={toggle} title="收起面板">
        <span className="substat-title">驱动块词条</span>
        <span className="substat-count">{agg.fullCount}/{agg.blockCount} 已选满</span>
        <span className="toggle">« 收起</span>
      </div>
      <div className="substat-body">
        {/* ---- 全满方案工具区 ---- */}
        <div className="preset-bar">
          <div className="preset-grid">
            {plan.map((id, slot) => renderPlanSelect(slot, id, changePlan, `方案词条 ${slot + 1}`))}
          </div>
          <div className="preset-row">
            <button className="primary small" title="把上方 4 条方案应用到画布上全部已放置块" onClick={() => applyPlanToAll(plan)}>一键全满</button>
            <input
              type="text"
              className="preset-name"
              placeholder="方案名（可空）"
              value={planName}
              onChange={e => setPlanName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') savePreset() }}
            />
            <button className="small" title="把上方 4 条词条收藏为方案（存本地缓存）" onClick={savePreset}>⭐ 收藏</button>
          </div>
          <div className="preset-row">
            <select
              style={{ flex: 1, minWidth: 0 }}
              title="选中方案后立即应用到全部块，并载入上方编辑区"
              value={selectedPresetId}
              onChange={e => selectPreset(e.target.value)}
            >
              <option value="">— 收藏的方案{presets.length ? `（${presets.length}）` : ''} —</option>
              {presets.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button className="small danger" disabled={!selectedPresetId} onClick={deletePreset}>删</button>
            <button className="small" disabled={importing} title="导出全部收藏方案为 JSON" onClick={exportPresets}>导出</button>
            <button className="small" disabled={importing} title="从 JSON 文件导入收藏方案（按 id 合并）" onClick={() => fileInputRef.current?.click()}>导入</button>
          </div>
        </div>

        {/* ---- 毕业目标配置（按类型，改动即存本地） ---- */}
        <div className="grad-section">
          <div className="grad-head" onClick={toggleGrad} title="展开/收起毕业目标配置">
            <span className="grad-title">毕业目标</span>
            <span className="grad-count">
              {gradReadyTypes.length
                ? `${gradReadyTypes.map(t => TYPE_LABELS[t]).join('/')} 已配置`
                : '未配置'}
            </span>
            <button className="small" onClick={e => { e.stopPropagation(); clearGrad() }}>清空</button>
            <span className="toggle">{gradOpen ? '▴' : '▾'}</span>
          </div>
          {gradOpen && (
            <div>
              {BLOCK_TYPE_ORDER.map(type => {
                const arr = gradTarget[type] || []
                return (
                  <div className="grad-row" key={type}>
                    <span className="grad-label">{TYPE_LABELS[type]}</span>
                    {arr.map((id, slot) => (
                      <select key={slot} value={id || ''} onChange={e => changeGrad(type, slot, e.target.value)}>
                        <option value="">词条 {slot + 1}</option>
                        {SUBSTAT_POOL.map(def => {
                          if (arr.some((x, i) => i !== slot && x === def.id)) return null
                          return <option key={def.id} value={def.id}>{def.name}</option>
                        })}
                      </select>
                    ))}
                  </div>
                )
              })}
              <div className="hint">按类型配置毕业词条（顺序无关，按集合对比）。每张卡片显示毕业状态，下方汇总缺口。</div>
            </div>
          )}
        </div>

        {placements.length === 0 && (
          <div className="hint">
            画布上还没有驱动块。从左侧「② 驱动块库」拖入或点「一键最优分配」后，
            在这里为每块自选 {SUBSTAT_SLOTS} 条副词条（满级满值，块内不重复）。
          </div>
        )}
        {placements.map((p, i) => {
          const shp = SHAPE_MAP[p.blockId]
          if (!shp) return null
          const cells = shp.cells.length
          const subs = normalizeSubstats(p.substats)
          const used = new Set(subs.filter(Boolean))
          const main = mainStatsFor(cells)
          const anchor = p.cells[0] || [0, 0]
          const gradInfo = grad.evaluated.find(e => e.placement === p)
          const onChange = (slot, id) => {
            const next = subs.slice()
            next[slot] = id || null
            updatePlacementSubstats(p, next)
          }
          return (
            <div className="substat-block" key={`${i}-${p.blockId}`}>
              <div className="blk-head">
                <span className="blk-dot" style={{ background: p.mandatory ? ROLE_COLOR.mandatory : ROLE_COLOR.optional }} />
                <span className="blk-name">{shp.name}</span>
                <span className="blk-pos">@({anchor[0] + 1},{anchor[1] + 1})</span>
                <span className="blk-main">攻+{main.mainAtk} 命+{main.mainHp}</span>
                {gradInfo && (gradInfo.graduated
                  ? <span className="grad-chip ok">毕业</span>
                  : (
                    <span
                      className="grad-chip part"
                      title={[
                        gradInfo.missing.length ? `缺: ${gradInfo.missing.map(id => SUBSTAT_POOL.find(d => d.id === id).name).join('/')}` : '',
                        gradInfo.extra.length ? `多: ${gradInfo.extra.map(id => SUBSTAT_POOL.find(d => d.id === id).name).join('/')}` : '',
                      ].filter(Boolean).join('；')}
                    >{gradInfo.matchCount}/4</span>
                  ))}
                <button
                  className="blk-star"
                  title="收藏该块的副词条组合为方案"
                  onClick={() => starBlock(p)}
                >☆</button>
              </div>
              <div className="substat-selects">
                {subs.map((id, slot) => (
                  <select key={slot} value={id || ''} onChange={e => onChange(slot, e.target.value)}>
                    <option value="">副词条 {slot + 1}（未选）</option>
                    {SUBSTAT_POOL.map(def => {
                      if (used.has(def.id) && def.id !== id) return null
                      return <option key={def.id} value={def.id}>{substatLabel(def.id, cells)}</option>
                    })}
                  </select>
                ))}
              </div>
            </div>
          )
        })}

        {/* ---- 毕业差异汇总 ---- */}
        {grad.evaluated.length > 0 && (
          <div className="grad-diff">
            <div className="totals-title">
              毕业差异：{grad.graduatedCount}/{grad.evaluated.length} 毕业
              {gradReadyTypes.length < 3 && `（仅评估 ${gradReadyTypes.map(t => TYPE_LABELS[t]).join('/')}）`}
            </div>
            {Object.keys(grad.missingCounts).length > 0 && (
              <div className="grad-chips">
                {SUBSTAT_POOL.filter(d => grad.missingCounts[d.id]).map(d => (
                  <span className="grad-chip part" key={d.id}>缺 {d.name} ×{grad.missingCounts[d.id]}</span>
                ))}
              </div>
            )}
            {grad.attrGap.map(({ def, target, current, delta }) => (
              <div className="stat-line" key={def.id}>
                <span>{def.name}（目标 +{formatStatValue(def, target)}）</span>
                <b className={delta < 0 ? 'gap-bad' : 'gap-good'}>
                  {delta < 0 ? `还缺 ${formatStatValue(def, -delta)}` : delta > 0 ? `超出 ${formatStatValue(def, delta)}` : '已达标'}
                </b>
              </div>
            ))}
          </div>
        )}

        {placements.length > 0 && (
          <div className="substat-totals">
            <div className="totals-title">全部块属性合计（满级）</div>
            <div className="stat-line"><span>攻击力（主属性）</span><b>+{agg.mainAtk}</b></div>
            <div className="stat-line"><span>生命值（主属性）</span><b>+{agg.mainHp}</b></div>
            {agg.subs.map(({ def, value }) => (
              <div className="stat-line" key={def.id}>
                <span>{def.name}</span>
                <b>+{formatStatValue(def, value)}</b>
              </div>
            ))}
            {agg.blockCount > agg.fullCount && (
              <div className="hint" style={{ marginTop: 6 }}>
                还有 {agg.blockCount - agg.fullCount} 个块未选满 {SUBSTAT_SLOTS} 条副词条，合计只计已选项。
              </div>
            )}
          </div>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={onPresetFiles}
      />
    </div>
  )
}

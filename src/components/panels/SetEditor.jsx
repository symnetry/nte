import React, { useCallback, useRef, useState } from 'react'
import { useNte } from '../../state/useNteState.jsx'
import { SHAPE_MAP } from '../../data/shapes.js'
import { buildImportMsg } from '../../utils/jsonIO.js'
import { ShapePreview } from '../common.jsx'
import ShapePicker from '../ShapePicker.jsx'
import CollapsiblePanel from '../CollapsiblePanel.jsx'

const SLOT_COUNT = 4

export default function SetEditor() {
  const {
    userSets, selectedSetId, addSet, updateSet, deleteSet,
    hiddenSetIds, toggleSetHidden,
    applySetToRequired, importSets, openModal, handleRemoteLoad, notify, confirmAsync,
  } = useNte()
  const fileInputRef = useRef(null)
  const [importing, setImporting] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  // { setId, slotIndex, anchor }，anchor 为槽位 DOM，决定浮层位置
  const [picker, setPicker] = useState(null)

  const hiddenCount = userSets.filter(s => hiddenSetIds.includes(s.id)).length
  const displaySets = showHidden
    ? userSets
    : userSets.filter(s => !hiddenSetIds.includes(s.id))

  const closePicker = useCallback(() => setPicker(null), [])

  const onFilesSelected = async e => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length === 0) return
    setImporting(true)
    try {
      const stats = await importSets(files)
      notify(buildImportMsg('套装', files.length, stats), stats.skipped > 0)
    } finally {
      setImporting(false)
    }
  }

  const onAddSet = () => {
    const id = addSet()
    if (id) applySetToRequired(id)
  }

  const onDeleteSet = async set => {
    if (!(await confirmAsync(`确定删除套装「${set.name || '未命名'}」？`, '删除套装'))) return
    deleteSet(set.id)
  }

  const onPickShape = shapeId => {
    if (!picker) return
    const { setId, slotIndex } = picker
    const set = userSets.find(s => s.id === setId)
    if (!set) return
    const slots = (set.slots || []).slice(0, SLOT_COUNT)
    while (slots.length < SLOT_COUNT) slots.push(null)
    slots[slotIndex] = shapeId || null
    updateSet(setId, { slots })
    // 若该套装正被选用，同步刷新「③ 分配条件」里的必填形状
    if (selectedSetId === setId) applySetToRequired(setId)
    setPicker(null)
  }

  return (
    <CollapsiblePanel title="④ 套装编辑器" badge={`${userSets.length} 个`} defaultOpen={false}>
      <div className="row">
        <button className="primary small" onClick={onAddSet}>＋ 新建套装</button>
        <button className="small" onClick={() => openModal('sets', false)}>导出套装 JSON</button>
        <button className="small" onClick={() => openModal('sets', true)}>导入套装 JSON</button>
      </div>
      <div className="row">
        <button className="small" style={{ flex: 1 }} disabled={importing} title="多选 json 文件批量导入套装配置并缓存到本地" onClick={() => fileInputRef.current?.click()}>批量导入 JSON</button>
        <button className="small primary" style={{ flex: 1 }} title="从线上 /nte/suit/ 目录加载套装 JSON" onClick={() => handleRemoteLoad('suit')}>在线加载</button>
      </div>
      <input
        ref={fileInputRef}
        id="suitFileInput"
        type="file"
        multiple
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={onFilesSelected}
      />

      <div className="divider" />

      <div className="checkbox-row">
        <input
          id="showHiddenSets"
          type="checkbox"
          checked={showHidden}
          onChange={e => setShowHidden(e.target.checked)}
        />
        <label htmlFor="showHiddenSets">
          显示已隐藏的套装{hiddenCount ? `（${hiddenCount} 个，` : '（'}隐藏后不再出现在下拉框与导出中）
        </label>
      </div>

      <div style={{ maxHeight: 260, overflowY: 'auto' }}>
        {displaySets.length === 0 ? (
          <div className="hint">还没有套装，点「新建套装」开始配置。</div>
        ) : displaySets.map(set => {
          const isHidden = hiddenSetIds.includes(set.id)
          return (
          <div
            key={set.id}
            className={'set-item' + (set.id === selectedSetId ? ' active' : '')}
            title="点击卡片即可选用该套装"
            style={isHidden ? { opacity: 0.5 } : undefined}
            onClick={() => applySetToRequired(set.id)}
          >
            <div className="set-head">
              <input
                type="text"
                value={set.name || ''}
                placeholder="套装名"
                onClick={e => e.stopPropagation()}
                onChange={e => updateSet(set.id, { name: e.target.value })}
              />
              <button
                className="small"
                title={isHidden ? '恢复展示该套装' : '隐藏该套装（不再展示，配置保存在本地）'}
                onClick={e => { e.stopPropagation(); toggleSetHidden(set.id) }}
              >
                {isHidden ? '显示' : '隐藏'}
              </button>
              <button
                className="danger small"
                onClick={e => { e.stopPropagation(); onDeleteSet(set) }}
              >
                删除
              </button>
            </div>
            <div className="slots">
              {Array.from({ length: SLOT_COUNT }, (_, i) => {
                const shp = SHAPE_MAP[set.slots?.[i]]
                return (
                  <div
                    key={i}
                    className={'slot-box' + (shp ? '' : ' empty')}
                    title={shp ? shp.name : `槽位 ${i + 1}：点击选择驱动块`}
                    onClick={e => {
                      e.stopPropagation()
                      setPicker({ setId: set.id, slotIndex: i, anchor: e.currentTarget })
                    }}
                  >
                    {shp && <ShapePreview shp={shp} cellSize={7} />}
                  </div>
                )
              })}
            </div>
          </div>
          )
        })}
      </div>

      <div className="hint" style={{ marginTop: 6 }}>
        点击槽位方块选择驱动块（4 个槽位），卡片上部输入框可改名；点击卡片即选用该套装，其形状会自动填入上方「③ 分配条件」。
      </div>
      <div className="hint">
        本地已缓存 <b>{userSets.length}</b> 个套装（保存在浏览器，刷新不丢失）；其中 <b>{hiddenCount}</b> 个已隐藏。
      </div>

      {picker && (
        <ShapePicker anchorEl={picker.anchor} onSelect={onPickShape} onClose={closePicker} />
      )}
    </CollapsiblePanel>
  )
}

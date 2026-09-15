import React from 'react'
import { useNte } from '../../state/useNteState.jsx'
import { SHAPES } from '../../data/shapes.js'
import { ShapePreview } from '../common.jsx'

export default function ConditionPanel() {
  const {
    userSets, hiddenSetIds, required, selectedSetId, basedOnSet, setBasedOnSet,
    fillRemaining, setFillRemaining, applySetToRequired, incRequired, clearRequired,
  } = useNte()

  // 已隐藏的套装不出现在下拉框里
  const selectableSets = userSets.filter(s => !hiddenSetIds.includes(s.id))

  return (
    <div className="panel">
      <h3>③ 分配条件</h3>
      <div className="checkbox-row">
        <input type="checkbox" id="condSet" checked={basedOnSet} onChange={e => setBasedOnSet(e.target.checked)} />
        <label htmlFor="condSet">基于套装：优先满足必填形状</label>
      </div>
      <div className="hint">选择套装后自动填充下方的必填形状。</div>
      <select
        value={selectedSetId}
        onChange={e => applySetToRequired(e.target.value)}
        style={{ width: '100%', marginTop: 6 }}
      >
        <option value="">— 选择套装 —</option>
        {selectableSets.map(s => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      <div className="req-grid" style={{ marginTop: 8 }}>
        {SHAPES.map(shp => (
          <div
            key={shp.id}
            className={'req-item' + (required[shp.id] ? ' active' : '')}
            onClick={() => incRequired(shp.id)}
            onContextMenu={e => {
              e.preventDefault()
              clearRequired(shp.id)
            }}
          >
            <ShapePreview shp={shp} cellSize={9} />
            <div className="badge">{required[shp.id] ? '×' + required[shp.id] : ''}</div>
          </div>
        ))}
      </div>
      <div className="hint" style={{ marginTop: 6 }}>左键点击循环设置数量（1→2→3→4→清除），右键直接清除。</div>
      <div className="divider" />
      <div className="checkbox-row">
        <input type="checkbox" id="condFill" checked={fillRemaining} onChange={e => setFillRemaining(e.target.checked)} />
        <label htmlFor="condFill">剩余空间用大块优先填满</label>
      </div>
    </div>
  )
}

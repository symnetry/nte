import React from 'react'
import { useNte } from '../../state/useNteState.jsx'
import { SHAPES } from '../../data/shapes.js'
import { ShapePreview } from '../common.jsx'

export default function ConditionPanel() {
  const {
    userSets, hiddenSetIds, required, selectedSetId, basedOnSet, setBasedOnSet,
    fillRemaining, setFillRemaining, usePalette, setUsePalette, vanity, setVanity,
    applySetToRequired, palette, incPalette, clearPalette,
    priorityType, setPriorityType,
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
      <div className="hint">选择套装后自动填充下方「必填套装」，并预填「可选形状池」。</div>
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

      <div className="sub-title" style={{ marginTop: 10 }}>
        {vanity ? '套装形状（虚荣模式：全部可选）' : '必填套装（必须全部放置）'}
      </div>
      <div className="req-grid" style={{ marginTop: 4 }}>
        {Object.keys(required).length === 0 && (
          <div className="hint">尚未选择套装</div>
        )}
        {SHAPES.filter(shp => required[shp.id]).map(shp => (
          <div
            key={shp.id}
            className={'req-item' + (vanity ? '' : ' mandatory')}
            title={`${shp.name}${vanity ? '（可选·虚荣）' : '（必填）'}`}
          >
            <ShapePreview shp={shp} cellSize={9} />
            <div className="badge">{vanity ? '可选' : '必填'}</div>
          </div>
        ))}
      </div>

      <div className="sub-title" style={{ marginTop: 10 }}>可选形状池（库存上限，可选填充）</div>
      <div className="checkbox-row">
        <input type="checkbox" id="condPalette" checked={usePalette}
          onChange={e => {
            const on = e.target.checked
            setUsePalette(on)
            if (!on) setVanity(false) // 关闭父开关则同步关闭虚荣分支
          }} />
        <label htmlFor="condPalette">限定可选形状池（关闭则按旧逻辑用全部形状填空）</label>
      </div>
      <div className="checkbox-row" style={{ marginLeft: 16, opacity: usePalette ? 1 : 0.4 }}>
        <input type="checkbox" id="condVanity" checked={vanity} disabled={!usePalette}
          onChange={e => setVanity(e.target.checked)} />
        <label htmlFor="condVanity">虚荣模式：套装块变非必选，全部所选形状均为可选池</label>
      </div>
      <div className="req-grid" style={{ marginTop: 4, opacity: usePalette ? 1 : 0.4, pointerEvents: usePalette ? 'auto' : 'none' }}>
        {SHAPES.map(shp => (
          <div
            key={shp.id}
            className={'req-item' + (palette[shp.id] ? ' active' : '')}
            title={`${shp.name}：左键循环 1→2→3→4→清除，右键清除`}
            onClick={() => incPalette(shp.id)}
            onContextMenu={e => {
              e.preventDefault()
              clearPalette(shp.id)
            }}
          >
            <ShapePreview shp={shp} cellSize={9} />
            <div className="badge">{palette[shp.id] ? '×' + palette[shp.id] : ''}</div>
          </div>
        ))}
      </div>
      <div className="hint" style={{ marginTop: 6 }}>
        {!usePalette
          ? '未开启「限定可选形状池」：剩余空格使用全部形状填充（旧逻辑），此池不起作用。'
          : vanity
            ? '虚荣模式已开启：套装形状仅作为可选池（非必填），连同你手动选择的形状一起精准占满棋盘。'
            : '左键循环设置数量（1→2→3→4→清除），右键直接清除。套装形状已自动预填。'}
      </div>

      <div className="sub-title" style={{ marginTop: 10 }}>方案排序优先级</div>
      <div className="hint">异环设定：角色对驱动块类型偏好不同，排序让「更符合偏好的方案」排最前。</div>
      <select
        value={priorityType}
        onChange={e => setPriorityType(e.target.value)}
        style={{ width: '100%', marginTop: 6 }}
      >
        <option value="">默认（少块优先）</option>
        <option value="II">Ⅱ型驱动优先（2 格块最多）</option>
        <option value="III">Ⅲ型驱动优先（3 格块最多）</option>
        <option value="IV">Ⅳ型驱动优先（4 格块最多）</option>
      </select>

      <div className="divider" />
      <div className="checkbox-row">
        <input type="checkbox" id="condFill" checked={fillRemaining} onChange={e => setFillRemaining(e.target.checked)} />
        <label htmlFor="condFill">剩余空间用大块优先填满</label>
      </div>
    </div>
  )
}

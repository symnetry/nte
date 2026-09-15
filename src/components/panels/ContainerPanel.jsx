import React, { useEffect, useRef, useState } from 'react'
import { useNte } from '../../state/useNteState.jsx'
import { buildImportMsg } from '../../utils/jsonIO.js'

export default function ContainerPanel() {
  const {
    rows, cols, setGrid, customContainers, containerSelectedId, setContainerSelectedId,
    saveCurrentContainer, applyContainer, renameContainer, deleteContainer,
    importContainers, handleRemoteLoad, openModal, notify,
  } = useNte()
  const [rowsInput, setRowsInput] = useState(rows)
  const [colsInput, setColsInput] = useState(cols)
  const [nameInput, setNameInput] = useState('')
  const [gridOpen, setGridOpen] = useState(false)
  const fileInputRef = useRef(null)
  const [importing, setImporting] = useState(false)

  const selected = customContainers.find(c => c.id === containerSelectedId) || null

  // 画布尺寸跟随实际网格
  useEffect(() => { setRowsInput(rows); setColsInput(cols) }, [rows, cols])
  // 选中容器时把名字带入输入框
  useEffect(() => {
    const c = customContainers.find(x => x.id === containerSelectedId)
    setNameInput(c ? c.name : '')
  }, [containerSelectedId, customContainers])

  const onApplyGrid = async () => {
    await setGrid(rowsInput, colsInput, '改变网格尺寸会清空当前放置，继续？')
  }

  // 下拉框选中即自动应用，无需再点「应用」
  const onSelectContainer = id => {
    setContainerSelectedId(id)
    const c = customContainers.find(x => x.id === id)
    if (c) applyContainer(c)
  }

  const onSaveContainer = async () => {
    const name = nameInput.trim()
    if (!name) { notify('请先在上方输入框填写容器名', true); return }
    const id = await saveCurrentContainer(name)
    if (id) setContainerSelectedId(id)
  }

  const onFilesSelected = async e => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length === 0) return
    setImporting(true)
    try {
      const stats = await importContainers(files)
      notify(buildImportMsg('容器', files.length, stats), stats.skipped > 0)
    } finally {
      setImporting(false)
    }
  }

  const onRename = () => {
    if (!selected) { notify('请先在下拉框选择要重命名的容器', true); return }
    const name = nameInput.trim()
    if (!name) { notify('请先在上方输入框填写新的容器名', true); return }
    renameContainer(selected, name)
  }

  const onDelete = () => {
    if (!selected) { notify('请先选择要删除的容器', true); return }
    deleteContainer(selected)
  }

  return (
    <div className="panel">
      <h3>① 容器配置</h3>

      {/* 自定义网格尺寸：默认收起 */}
      <div
        onClick={() => setGridOpen(!gridOpen)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none', marginBottom: gridOpen ? 8 : 0 }}
      >
        <span style={{ fontSize: 12, color: '#8b95a8' }}>{gridOpen ? '▾' : '▸'} 自定义网格尺寸（当前 {rows}×{cols}）</span>
      </div>
      {gridOpen && (
        <div className="row">
          <label>行</label>
          <input type="number" value={rowsInput} min="1" max="10" style={{ width: 60 }}
            onChange={e => setRowsInput(e.target.value)} />
          <label>列</label>
          <input type="number" value={colsInput} min="1" max="10" style={{ width: 60 }}
            onChange={e => setColsInput(e.target.value)} />
          <button onClick={onApplyGrid}>应用</button>
        </div>
      )}
      <div className="hint">画布上<b>左键点击</b>格子切换「可用/不可用」；<b>右键点击</b>已放置的驱动块可单独清除（不影响容器形状与其他放置）。</div>

      <div className="divider" />
      <div className="row">
        <select title="自定义容器列表（选中即自动应用）" value={containerSelectedId} onChange={e => onSelectContainer(e.target.value)} style={{ flex: 1 }}>
          <option value="">— 已有容器 —</option>
          {customContainers.map(c => (
            <option key={c.id} value={c.id}>{c.name}（{c.rows}×{c.cols}）</option>
          ))}
        </select>
      </div>
      <div className="row">
        <input
          type="text"
          value={nameInput}
          placeholder="容器名（保存 / 重命名用）"
          style={{ flex: 1 }}
          onChange={e => setNameInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onSaveContainer() }}
        />
        <button className="small" onClick={onRename}>重命名</button>
        <button className="small danger" onClick={onDelete}>删除</button>
      </div>
      <div className="row">
        <button className="primary small" style={{ flex: 1 }} onClick={onSaveContainer}>保存当前为容器</button>
        <button className="small" onClick={() => openModal('container', false)}>导出</button>
        <button className="small" onClick={() => openModal('container', true)}>导入</button>
      </div>
      <div className="row">
        <button className="small" style={{ flex: 1 }} disabled={importing} title="多选 json 文件批量导入容器配置并缓存到本地" onClick={() => fileInputRef.current?.click()}>批量导入 JSON</button>
        <button className="small primary" style={{ flex: 1 }} title="从线上 /nte/character/ 目录加载容器 JSON" onClick={() => handleRemoteLoad('character')}>在线加载</button>
      </div>
      <input
        ref={fileInputRef}
        id="containerFileInput"
        type="file"
        multiple
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={onFilesSelected}
      />
      <div className="hint">容器 = 网格 + 可用区。下拉框<b>选中即自动应用</b>；在输入框填<b>容器名</b>后点「保存当前为容器」新建，选中已有容器后改输入框内容点「重命名」改名。最后「导出」保存到 <b>character/</b> 目录。</div>
    </div>
  )
}

import React from 'react'
import { useNte } from '../../state/useNteState.jsx'

export default function ActionsPanel() {
  const { runSolve, clearPlacements, openModal, charName, setCharName } = useNte()

  return (
    <div className="panel">
      <h3>⑤ 操作</h3>
      <div className="row">
        <button className="primary" style={{ flex: 1 }} onClick={runSolve}>一键最优分配</button>
        <button style={{ flex: 1 }} onClick={clearPlacements}>清空放置</button>
      </div>
      <div className="row">
        <button style={{ flex: 1 }} onClick={() => openModal('config', false)}>导出整体 JSON</button>
        <button style={{ flex: 1 }} onClick={() => openModal('config', true)}>导入整体 JSON</button>
      </div>
      <div className="row">
        <input
          type="text"
          value={charName}
          placeholder="角色名（用于命名配置）"
          style={{ flex: 1 }}
          onChange={e => setCharName(e.target.value)}
        />
      </div>
    </div>
  )
}

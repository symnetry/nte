import React from 'react'
import { useNte } from '../state/useNteState.jsx'

/** 应用内确认框：替代 window.confirm（内嵌浏览器里可能被拦截） */
export default function ConfirmDialog() {
  const { dialog, closeDialog } = useNte()
  if (!dialog) return null

  return (
    <div
      id="modalMask"
      className="show"
      style={{ zIndex: 300 }}
      onClick={e => { if (e.target.id === 'modalMask') closeDialog(false) }}
    >
      <div id="modal" style={{ width: 400 }}>
        <h3 style={{ fontSize: 14, color: '#8b95a8' }}>{dialog.title || '请确认'}</h3>
        <div style={{ fontSize: 13, lineHeight: 1.7, color: '#c8ced9', whiteSpace: 'pre-wrap' }}>
          {dialog.message}
        </div>
        <div className="modal-actions">
          <button onClick={() => closeDialog(false)}>取消</button>
          <button className="primary" autoFocus onClick={() => closeDialog(true)}>确定</button>
        </div>
      </div>
    </div>
  )
}

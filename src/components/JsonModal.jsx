import React from 'react'
import { useNte } from '../state/useNteState.jsx'

export default function JsonModal() {
  const { modal, jsonText, setJsonText, closeModal, applyModal, downloadModal } = useNte()
  if (!modal) return null

  return (
    <div id="modalMask" className="show" onClick={e => { if (e.target.id === 'modalMask') closeModal() }}>
      <div id="modal">
        <h3 style={{ fontSize: 14, color: '#8b95a8' }}>{modal.title}</h3>
        <textarea id="jsonArea" value={jsonText} onChange={e => setJsonText(e.target.value)} spellCheck={false} />
        <div className="modal-actions">
          <button onClick={closeModal}>关闭</button>
          {!modal.isImport && <button className="primary" onClick={downloadModal}>下载 JSON</button>}
          {modal.isImport && <button className="primary" onClick={applyModal}>应用导入</button>}
        </div>
      </div>
    </div>
  )
}

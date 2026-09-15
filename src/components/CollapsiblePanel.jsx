import React, { useState } from 'react'

/** 可折叠面板：点击标题行展开 / 收起 */
export default function CollapsiblePanel({ title, badge = '', defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="panel">
      <div
        className="panel-head"
        title={open ? '点击收起' : '点击展开'}
        onClick={() => setOpen(!open)}
      >
        <h3>{title}</h3>
        <span className="toggle">
          {badge ? <span style={{ marginRight: 6 }}>{badge}</span> : null}
          {open ? '▾' : '▸'}
        </span>
      </div>
      {open && <div className="panel-body">{children}</div>}
    </div>
  )
}

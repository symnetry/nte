import React, { useEffect, useRef, useState } from 'react'
import { SHAPES, SHAPE_MAP } from '../data/shapes.js'
import { ShapePreview } from './common.jsx'

/** 形状选择浮层：点击槽位时弹出，选择形状或清空 */
export default function ShapePicker({ anchorEl, onSelect, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    const onDocClick = e => {
      if (ref.current && !ref.current.contains(e.target) && !e.target.closest('.slot-box')) {
        onClose()
      }
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [onClose])

  const rect = anchorEl.getBoundingClientRect()
  const pickerWidth = 210
  let left = rect.left
  let top = rect.bottom + 4
  if (left + pickerWidth > window.innerWidth) left = window.innerWidth - pickerWidth - 8
  const estHeight = 320
  if (top + estHeight > window.innerHeight) top = Math.max(4, rect.top - estHeight - 4)

  return (
    <div ref={ref} className="shape-picker show" style={{ left, top, position: 'fixed', zIndex: 100 }}>
      <button className="small" style={{ marginBottom: 6, width: '100%' }} onClick={() => { onSelect(null); onClose() }}>清空</button>
      <div className="picker-grid">
        {SHAPES.map(shp => (
          <div
            key={shp.id}
            className="picker-item"
            title={shp.name}
            onClick={() => { onSelect(shp.id); onClose() }}
          >
            <ShapePreview shp={shp} cellSize={8} />
          </div>
        ))}
      </div>
    </div>
  )
}

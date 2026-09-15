import React from 'react'
import { shapePreviewGrid } from '../data/shapes.js'

/** 形状小预览（图库 / 槽位 / 形状选择器 / 必填形状） */
export function ShapePreview({ shp, cellSize = 11 }) {
  const { grid, maxR, maxC } = shapePreviewGrid(shp)
  return (
    <div
      className="preview"
      style={{
        gridTemplateColumns: `repeat(${maxC}, ${cellSize}px)`,
        display: 'grid',
        lineHeight: 0,
        gap: 1,
      }}
    >
      {grid.map(({ r, c, on }) => (
        <div
          key={`${r}-${c}`}
          className={on ? 'on' : 'off'}
          style={on
            ? { background: shp.color, width: cellSize, height: cellSize, borderRadius: 1 }
            : { background: 'transparent', width: cellSize, height: cellSize }}
        />
      ))}
    </div>
  )
}

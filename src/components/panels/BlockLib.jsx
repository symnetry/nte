import React from 'react'
import { SHAPES } from '../../data/shapes.js'
import { ShapePreview } from '../common.jsx'
import { useNte } from '../../state/useNteState.jsx'

const order = { IV: 0, III: 1, II: 2 }

/** 生成跟随鼠标的拖拽幻影：只渲染方块本体（比整行「预览+文字」直观得多） */
function makeDragImage(shp) {
  const maxR = Math.max(...shp.cells.map(c => c[0])) + 1
  const maxC = Math.max(...shp.cells.map(c => c[1])) + 1
  const s = 18
  const pad = 4
  const img = document.createElement('canvas')
  img.width = maxC * s + pad * 2
  img.height = maxR * s + pad * 2
  const ctx = img.getContext('2d')
  for (const [r, c] of shp.cells) {
    ctx.fillStyle = shp.color
    ctx.fillRect(pad + c * s, pad + r * s, s - 1, s - 1)
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'
  ctx.lineWidth = 2
  for (const [r, c] of shp.cells) {
    ctx.strokeRect(pad + c * s + 0.5, pad + r * s + 0.5, s - 1, s - 1)
  }
  // 个别环境要求元素在文档内才能作为拖拽幻影，挂在屏外再清理
  img.style.position = 'fixed'
  img.style.top = '-9999px'
  document.body.appendChild(img)
  setTimeout(() => img.remove(), 0)
  return img
}

export default function BlockLib() {
  const { armedShapeId, setArmedShapeId, libDragRef, notify } = useNte()
  const sorted = [...SHAPES].sort((a, b) => order[a.type] - order[b.type])

  const toggleArmed = shp => {
    if (armedShapeId === shp.id) {
      setArmedShapeId('')
      notify('已取消选中的驱动块')
    } else {
      setArmedShapeId(shp.id)
      notify(`已选中 ${shp.name}：点击画布空格放置（可连放），ESC 或再点一次取消`)
    }
  }

  return (
    <div className="panel">
      <h3>② 驱动块库（拖拽或点击后放到画布）</h3>
      <div id="blockLib">
        {sorted.map(shp => (
          <div
            key={shp.id}
            className={`lib-item${armedShapeId === shp.id ? ' armed' : ''}`}
            title={armedShapeId === shp.id ? '点击取消选中' : '拖到画布，或点击选中后再点画布放置'}
            draggable
            onDragStart={e => {
              e.dataTransfer.setData('text/plain', shp.id)
              e.dataTransfer.effectAllowed = 'copy'
              libDragRef.current = { blockId: shp.id }
              try {
                const img = makeDragImage(shp)
                const [ar, ac] = shp.cells[0]
                e.dataTransfer.setDragImage(img, 4 + ac * 18 + 9, 4 + ar * 18 + 9)
              } catch { /* 个别环境不支持自定义幻影时退回默认 */ }
            }}
            onDragEnd={() => { libDragRef.current = { blockId: null } }}
            onClick={() => toggleArmed(shp)}
          >
            <ShapePreview shp={shp} cellSize={11} />
            <div className="name">{shp.name}</div>
          </div>
        ))}
      </div>
      <div className="hint" style={{ marginTop: 6 }}>
        拖到画布上会出现<b>红/绿落点预览</b>（绿=可放，红=冲突）；也可以<b>点击</b>图库选中块，
        再点画布空格连续放置（ESC 取消）。
      </div>
    </div>
  )
}

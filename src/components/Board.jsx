import React, { useCallback, useEffect, useRef } from 'react'
import { useNte } from '../state/useNteState.jsx'
import { SHAPE_MAP, lighten, darken } from '../data/shapes.js'

const CELL = 48

export default function Board() {
  const { rows, cols, available, placements, setPlacements, toggleCell, notify, armedShapeId, setArmedShapeId, libDragRef } = useNte()
  const canvasRef = useRef(null)
  const stateRef = useRef({ rows, cols, available, placements, armedShapeId })
  const draggingRef = useRef(null)
  // 图库 HTML5 拖拽的实时落点预览 { blockId, cellR, cellC }（dragover 持续更新）
  const extDragRef = useRef(null)
  // 点选放置模式下鼠标悬停格子的预览
  const hoverRef = useRef(null)

  /* ---------- 绘制 ---------- */
  const drawBlock = useCallback((ctx, shp, cells, isPreview, valid = true) => {
    const cellSet = new Set(cells.map(([r, c]) => r + ',' + c))
    const has = (r, c) => cellSet.has(r + ',' + c)
    const baseColor = isPreview ? (valid ? shp.color : '#ff4a4a') : shp.color
    const alpha = isPreview ? 0.5 : 1

    ctx.save()
    ctx.globalAlpha = alpha

    ctx.beginPath()
    for (const [r, c] of cells) {
      const x = c * CELL, y = r * CELL
      ctx.rect(x, y, CELL, CELL)
    }
    const rs = cells.map(c => c[0]), cs = cells.map(c => c[1])
    const minR = Math.min(...rs), maxR = Math.max(...rs)
    const minC = Math.min(...cs), maxC = Math.max(...cs)
    const grad = ctx.createLinearGradient(
      minC * CELL, minR * CELL,
      (maxC + 1) * CELL, (maxR + 1) * CELL,
    )
    if (isPreview && !valid) {
      grad.addColorStop(0, '#ff6b6b')
      grad.addColorStop(1, '#c73a3a')
    } else {
      grad.addColorStop(0, lighten(baseColor, 30))
      grad.addColorStop(0.5, baseColor)
      grad.addColorStop(1, darken(baseColor, 20))
    }
    ctx.fillStyle = grad
    ctx.fill()

    ctx.strokeStyle = 'rgba(0,0,0,0.35)'
    ctx.lineWidth = 1
    for (const [r, c] of cells) {
      const x = c * CELL, y = r * CELL
      if (has(r, c + 1)) {
        ctx.beginPath(); ctx.moveTo(x + CELL + 0.5, y); ctx.lineTo(x + CELL + 0.5, y + CELL); ctx.stroke()
      }
      if (has(r + 1, c)) {
        ctx.beginPath(); ctx.moveTo(x, y + CELL + 0.5); ctx.lineTo(x + CELL, y + CELL + 0.5); ctx.stroke()
      }
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.lineWidth = 1
    for (const [r, c] of cells) {
      const x = c * CELL, y = r * CELL
      if (!has(r - 1, c)) { ctx.beginPath(); ctx.moveTo(x + 2, y + 2); ctx.lineTo(x + CELL - 2, y + 2); ctx.stroke() }
      if (!has(r, c - 1)) { ctx.beginPath(); ctx.moveTo(x + 2, y + 2); ctx.lineTo(x + 2, y + CELL - 2); ctx.stroke() }
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'
    for (const [r, c] of cells) {
      const x = c * CELL, y = r * CELL
      if (!has(r + 1, c)) { ctx.beginPath(); ctx.moveTo(x + 2, y + CELL - 2); ctx.lineTo(x + CELL - 2, y + CELL - 2); ctx.stroke() }
      if (!has(r, c + 1)) { ctx.beginPath(); ctx.moveTo(x + CELL - 2, y + 2); ctx.lineTo(x + CELL - 2, y + CELL - 2); ctx.stroke() }
    }

    const outlinePath = new Path2D()
    for (const [r, c] of cells) {
      const x = c * CELL, y = r * CELL
      if (!has(r - 1, c)) { outlinePath.moveTo(x, y); outlinePath.lineTo(x + CELL, y) }
      if (!has(r + 1, c)) { outlinePath.moveTo(x, y + CELL); outlinePath.lineTo(x + CELL, y + CELL) }
      if (!has(r, c - 1)) { outlinePath.moveTo(x, y); outlinePath.lineTo(x, y + CELL) }
      if (!has(r, c + 1)) { outlinePath.moveTo(x + CELL, y); outlinePath.lineTo(x + CELL, y + CELL) }
    }
    ctx.shadowColor = isPreview && !valid ? '#ff4a4a' : lighten(baseColor, 40)
    ctx.shadowBlur = isPreview ? 4 : 8
    ctx.strokeStyle = isPreview ? (valid ? '#ffffff' : '#ff8888') : '#ffffff'
    ctx.lineWidth = isPreview ? 2 : 2.5
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.stroke(outlinePath)
    ctx.shadowBlur = 0
    ctx.strokeStyle = isPreview && !valid ? '#ffaaaa' : lighten(baseColor, 50)
    ctx.lineWidth = 1
    ctx.stroke(outlinePath)

    ctx.restore()
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const { rows, cols, available, placements } = stateRef.current
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * CELL, y = r * CELL
        if (available[r][c]) {
          ctx.fillStyle = '#1a1f2a'
          ctx.fillRect(x, y, CELL, CELL)
          ctx.strokeStyle = '#252b37'
          ctx.lineWidth = 1
          ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1)
        } else {
          ctx.fillStyle = '#0b0d11'
          ctx.fillRect(x, y, CELL, CELL)
          ctx.strokeStyle = '#1a1d24'
          ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1)
          ctx.strokeStyle = '#1e222b'
          ctx.beginPath()
          ctx.moveTo(x, y); ctx.lineTo(x + CELL, y + CELL)
          ctx.moveTo(x + CELL, y); ctx.lineTo(x, y + CELL)
          ctx.stroke()
        }
      }
    }

    for (const p of placements) {
      const shp = SHAPE_MAP[p.blockId]
      if (!shp) continue
      drawBlock(ctx, shp, p.cells, false)
    }

    const drag = draggingRef.current
    if (drag) {
      const shp = SHAPE_MAP[drag.blockId]
      if (shp) {
        const rect = canvas.getBoundingClientRect()
        const mx = drag.mouseX - rect.left, my = drag.mouseY - rect.top
        const cellC = Math.floor(mx / CELL) - drag.offsetC
        const cellR = Math.floor(my / CELL) - drag.offsetR
        const valid = canPlaceAt(shp, cellR, cellC, null)
        const previewCells = shp.cells.map(([dr, dc]) => [cellR + dr, cellC + dc])
        drawBlock(ctx, shp, previewCells, true, valid)
      }
    }

    // 图库拖入 / 点选悬停的落点预览（红=不可放，绿白=可放）
    const ext = extDragRef.current
    const armed = stateRef.current.armedShapeId
    const hover = ext && ext.blockId === libDragRef.current?.blockId ? ext
      : (hoverRef.current && hoverRef.current.blockId === armed ? hoverRef.current : null)
    if (hover) {
      const shp = SHAPE_MAP[hover.blockId]
      if (shp) {
        const valid = canPlaceAt(shp, hover.cellR, hover.cellC, null)
        const previewCells = shp.cells.map(([dr, dc]) => [hover.cellR + dr, hover.cellC + dc])
        drawBlock(ctx, shp, previewCells, true, valid)
      }
    }
  }, [drawBlock, libDragRef])

  const canPlaceAt = useCallback((shp, baseR, baseC, exclude) => {
    const { rows, cols, available, placements } = stateRef.current
    for (const [dr, dc] of shp.cells) {
      const r = baseR + dr, c = baseC + dc
      if (r < 0 || r >= rows || c < 0 || c >= cols) return false
      if (!available[r][c]) return false
      const hit = placements.find(p => p !== exclude && p.cells.some(([pr, pc]) => pr === r && pc === c))
      if (hit) return false
    }
    return true
  }, [])

  const findPlacementAt = useCallback((r, c) => {
    const { placements } = stateRef.current
    return placements.find(p => p.cells.some(([pr, pc]) => pr === r && pc === c)) || null
  }, [])

  /* ---------- 尺寸 ---------- */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = cols * CELL
    canvas.height = rows * CELL
  }, [rows, cols])

  /* ---------- 状态同步与重绘 ---------- */
  useEffect(() => {
    stateRef.current = { rows, cols, available, placements, armedShapeId }
    draw()
  }, [rows, cols, available, placements, armedShapeId, draw])

  /* ---------- ESC 取消点选放置 ---------- */
  useEffect(() => {
    if (!armedShapeId) return
    const onKey = e => {
      if (e.key !== 'Escape') return
      setArmedShapeId('')
      hoverRef.current = null
      notify('已取消选中的驱动块')
      draw()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [armedShapeId, setArmedShapeId, notify, draw])

  /* ---------- 交互 ---------- */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const onMouseDown = e => {
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      const c = Math.floor(mx / CELL), r = Math.floor(my / CELL)
      const { rows, cols } = stateRef.current
      if (r < 0 || r >= rows || c < 0 || c >= cols) return
      if (e.button === 0) {
        // 点选放置模式：左键点空格直接放置（可连放）；点到已有块则取消选中转为拖动
        const armed = stateRef.current.armedShapeId
        if (armed) {
          const armedShp = SHAPE_MAP[armed]
          if (armedShp && !findPlacementAt(r, c)) {
            if (canPlaceAt(armedShp, r, c, null)) {
              const cells = armedShp.cells.map(([dr, dc]) => [r + dr, c + dc])
              setPlacements(prev => [...prev, { blockId: armedShp.id, cells }])
              notify(`已放置 ${armedShp.name}，可继续点击放置（ESC 或再点图库取消）`)
            } else {
              notify('该位置无法放置（越界/不可用/重叠）', true)
            }
            return
          }
          if (armedShp) setArmedShapeId('')
        }
        const hit = findPlacementAt(r, c)
        if (hit) {
          const shp = SHAPE_MAP[hit.blockId]
          if (!shp) return
          const anchor = hit.cells[0]
          const offsetR = r - anchor[0]
          const offsetC = c - anchor[1]
          setPlacements(prev => prev.filter(p => p !== hit))
          draggingRef.current = { blockId: shp.id, offsetR, offsetC, mouseX: e.clientX, mouseY: e.clientY, substats: hit.substats }
          draw()
          return
        }
        toggleCell(r, c)
      }
    }

    const onMouseMove = e => {
      if (draggingRef.current) {
        draggingRef.current.mouseX = e.clientX
        draggingRef.current.mouseY = e.clientY
        draw()
        return
      }
      // 点选放置模式：悬停格子上画落点预览
      const armed = stateRef.current.armedShapeId
      if (armed) {
        const rect = canvas.getBoundingClientRect()
        const cellC = Math.floor((e.clientX - rect.left) / CELL)
        const cellR = Math.floor((e.clientY - rect.top) / CELL)
        const prev = hoverRef.current
        if (!prev || prev.cellR !== cellR || prev.cellC !== cellC || prev.blockId !== armed) {
          hoverRef.current = { blockId: armed, cellR, cellC }
          draw()
        }
      }
    }

    const onMouseLeave = () => {
      if (hoverRef.current) { hoverRef.current = null; draw() }
    }

    const onMouseUp = () => {
      const drag = draggingRef.current
      if (!drag) return
      const shp = SHAPE_MAP[drag.blockId]
      const rect = canvas.getBoundingClientRect()
      const mx = drag.mouseX - rect.left, my = drag.mouseY - rect.top
      const cellC = Math.floor(mx / CELL) - drag.offsetC
      const cellR = Math.floor(my / CELL) - drag.offsetR
      if (shp && canPlaceAt(shp, cellR, cellC, null)) {
        const cells = shp.cells.map(([dr, dc]) => [cellR + dr, cellC + dc])
        setPlacements(prev => [...prev, { blockId: shp.id, cells, ...(drag.substats ? { substats: drag.substats } : {}) }])
      }
      draggingRef.current = null
      draw()
    }

    const onContextMenu = e => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      const c = Math.floor(mx / CELL), r = Math.floor(my / CELL)
      const { rows, cols } = stateRef.current
      if (r < 0 || r >= rows || c < 0 || c >= cols) return
      // 只清除右键所在格子对应的驱动块，不清空全部放置、不重置容器可用区
      const hit = findPlacementAt(r, c)
      if (hit) setPlacements(prev => prev.filter(p => p !== hit))
    }

    // 图库拖入：dragover 期间持续更新落点预览（dragover 里读不到 dataTransfer
    // 的数据，形状 id 由 BlockLib 在 dragstart 写入共享的 libDragRef）
    const onDragOver = e => {
      e.preventDefault()
      const blockId = libDragRef.current?.blockId
      const shp = blockId && SHAPE_MAP[blockId]
      if (!shp) return
      const rect = canvas.getBoundingClientRect()
      const cellC = Math.floor((e.clientX - rect.left) / CELL)
      const cellR = Math.floor((e.clientY - rect.top) / CELL)
      extDragRef.current = { blockId, cellR, cellC }
      draw()
    }

    const onDragLeave = () => {
      if (extDragRef.current) { extDragRef.current = null; draw() }
    }

    const onDrop = e => {
      e.preventDefault()
      const id = e.dataTransfer.getData('text/plain') || libDragRef.current?.blockId
      const shp = SHAPE_MAP[id]
      libDragRef.current = { blockId: null }
      extDragRef.current = null
      if (!shp) return
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      const baseC = Math.floor(mx / CELL)
      const baseR = Math.floor(my / CELL)
      if (canPlaceAt(shp, baseR, baseC, null)) {
        const cells = shp.cells.map(([dr, dc]) => [baseR + dr, baseC + dc])
        setPlacements(prev => [...prev, { blockId: shp.id, cells }])
      } else {
        notify('该位置无法放置（越界/不可用/重叠）', true)
      }
      draw()
    }

    // 拖拽在画布外取消 / 结束时清掉预览
    const onDragEnd = () => {
      libDragRef.current = { blockId: null }
      if (extDragRef.current) { extDragRef.current = null; draw() }
    }

    canvas.addEventListener('mousedown', onMouseDown)
    canvas.addEventListener('mousemove', onMouseMove)
    canvas.addEventListener('mouseleave', onMouseLeave)
    window.addEventListener('mouseup', onMouseUp)
    canvas.addEventListener('contextmenu', onContextMenu)
    canvas.addEventListener('dragover', onDragOver)
    canvas.addEventListener('dragleave', onDragLeave)
    canvas.addEventListener('drop', onDrop)
    window.addEventListener('dragend', onDragEnd)
    return () => {
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('mouseleave', onMouseLeave)
      window.removeEventListener('mouseup', onMouseUp)
      canvas.removeEventListener('contextmenu', onContextMenu)
      canvas.removeEventListener('dragover', onDragOver)
      canvas.removeEventListener('dragleave', onDragLeave)
      canvas.removeEventListener('drop', onDrop)
      window.removeEventListener('dragend', onDragEnd)
    }
  }, [draw, toggleCell, notify, setPlacements, findPlacementAt, canPlaceAt, setArmedShapeId, libDragRef])

  return <canvas id="board" ref={canvasRef} />
}

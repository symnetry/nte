/* ===================== 固定驱动块形状库（12种） =====================
 * 形状库统一为黄色：驱动块「是什么形状」由格子排布区分，
 * 颜色只用于标识「角色」——上容器后由求解结果按 mandatory 着色
 * （黄=套装必填 / 紫=可选填充），见 ROLE_COLOR。
 */
export const SHAPES = [
  // ---- Ⅳ型（4格）----
  // 阶梯： . X / X X / X .
  { id: 'IV-stair', type: 'IV', name: 'Ⅳ型 阶梯', color: '#e8a33d', cells: [[0, 1], [1, 0], [1, 1], [2, 0]] },
  // Z形水平镜像： . X X / X X .
  { id: 'IV-Z', type: 'IV', name: 'Ⅳ型 Z形', color: '#e8a33d', cells: [[0, 1], [0, 2], [1, 0], [1, 1]] },
  // 竖四
  { id: 'IV-v4', type: 'IV', name: 'Ⅳ型 竖条', color: '#e8a33d', cells: [[0, 0], [1, 0], [2, 0], [3, 0]] },
  // 横四
  { id: 'IV-h4', type: 'IV', name: 'Ⅳ型 横条', color: '#e8a33d', cells: [[0, 0], [0, 1], [0, 2], [0, 3]] },

  // ---- Ⅲ型（3格）----
  // A：X . / X X   （2×2 缺右上）
  { id: 'III-a', type: 'III', name: 'Ⅲ型 A', color: '#e8a33d', cells: [[0, 0], [1, 0], [1, 1]] },
  // B：X X / X .   （2×2 缺右下）
  { id: 'III-b', type: 'III', name: 'Ⅲ型 B', color: '#e8a33d', cells: [[0, 0], [0, 1], [1, 0]] },
  // C：. X / X X   （2×2 缺左上）
  { id: 'III-c', type: 'III', name: 'Ⅲ型 C', color: '#e8a33d', cells: [[0, 1], [1, 0], [1, 1]] },
  // D：X X / . X   （2×2 缺左下）
  { id: 'III-d', type: 'III', name: 'Ⅲ型 D', color: '#e8a33d', cells: [[0, 0], [0, 1], [1, 1]] },
  // 竖三
  { id: 'III-v3', type: 'III', name: 'Ⅲ型 竖条', color: '#e8a33d', cells: [[0, 0], [1, 0], [2, 0]] },
  // 横三
  { id: 'III-h3', type: 'III', name: 'Ⅲ型 横条', color: '#e8a33d', cells: [[0, 0], [0, 1], [0, 2]] },

  // ---- Ⅱ型（2格）----
  { id: 'II-v2', type: 'II', name: 'Ⅱ型 竖条', color: '#e8a33d', cells: [[0, 0], [1, 0]] },
  { id: 'II-h2', type: 'II', name: 'Ⅱ型 横条', color: '#e8a33d', cells: [[0, 0], [0, 1]] },
]

/** 上容器后按「角色」着色：黄=套装必填项，紫=可选填充 */
export const ROLE_COLOR = { mandatory: '#e8a33d', optional: '#b06bd6' }

export const SHAPE_MAP = Object.fromEntries(SHAPES.map(s => [s.id, s]))

export function lighten(hex, amt) {
  const num = parseInt(hex.replace('#', ''), 16)
  let r = (num >> 16) + amt; if (r > 255) r = 255
  let g = ((num >> 8) & 0xff) + amt; if (g > 255) g = 255
  let b = (num & 0xff) + amt; if (b > 255) b = 255
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')
}

export function darken(hex, amt) {
  const num = parseInt(hex.replace('#', ''), 16)
  let r = (num >> 16) - amt; if (r < 0) r = 0
  let g = ((num >> 8) & 0xff) - amt; if (g < 0) g = 0
  let b = (num & 0xff) - amt; if (b < 0) b = 0
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')
}

/** 生成形状小预览的格子数据（用于图库/槽位/形状选择器） */
export function shapePreviewGrid(shp) {
  const maxR = Math.max(...shp.cells.map(c => c[0])) + 1
  const maxC = Math.max(...shp.cells.map(c => c[1])) + 1
  const grid = []
  for (let r = 0; r < maxR; r++) {
    for (let c = 0; c < maxC; c++) {
      grid.push({
        r, c,
        on: shp.cells.some(([cr, cc]) => cr === r && cc === c),
      })
    }
  }
  return { grid, maxR, maxC }
}

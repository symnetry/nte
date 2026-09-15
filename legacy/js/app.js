/* ===================== 固定驱动块形状库（12种，已修正） ===================== */
const SHAPES = [
  // ---- Ⅳ型（4格，橙色）----
  // 阶梯： . X / X X / X .
  { id:'IV-stair', type:'IV', name:'Ⅳ型 阶梯', color:'#e8a33d', cells:[[0,1],[1,0],[1,1],[2,0]] },
  // Z形水平镜像： . X X / X X .
  { id:'IV-Z',     type:'IV', name:'Ⅳ型 Z形',  color:'#e8a33d', cells:[[0,1],[0,2],[1,0],[1,1]] },
  // 竖四
  { id:'IV-v4',    type:'IV', name:'Ⅳ型 竖条', color:'#e8a33d', cells:[[0,0],[1,0],[2,0],[3,0]] },
  // 横四
  { id:'IV-h4',    type:'IV', name:'Ⅳ型 横条', color:'#e8a33d', cells:[[0,0],[0,1],[0,2],[0,3]] },

  // ---- Ⅲ型（3格，紫色）----
  // A：X . / X X   （2×2 缺右上）
  { id:'III-a',    type:'III', name:'Ⅲ型 A',   color:'#b06bd6', cells:[[0,0],[1,0],[1,1]] },
  // B：X X / X .   （2×2 缺右下）
  { id:'III-b',    type:'III', name:'Ⅲ型 B',   color:'#b06bd6', cells:[[0,0],[0,1],[1,0]] },
  // C：. X / X X   （2×2 缺左上）
  { id:'III-c',    type:'III', name:'Ⅲ型 C',   color:'#b06bd6', cells:[[0,1],[1,0],[1,1]] },
  // D：X X / . X   （2×2 缺左下）
  { id:'III-d',    type:'III', name:'Ⅲ型 D',   color:'#b06bd6', cells:[[0,0],[0,1],[1,1]] },
  // 竖三
  { id:'III-v3',   type:'III', name:'Ⅲ型 竖条', color:'#b06bd6', cells:[[0,0],[1,0],[2,0]] },
  // 横三
  { id:'III-h3',   type:'III', name:'Ⅲ型 横条', color:'#b06bd6', cells:[[0,0],[0,1],[0,2]] },

  // ---- Ⅱ型（2格，橙色）----
  { id:'II-v2',    type:'II',  name:'Ⅱ型 竖条', color:'#e8a33d', cells:[[0,0],[1,0]] },
  { id:'II-h2',    type:'II',  name:'Ⅱ型 横条', color:'#e8a33d', cells:[[0,0],[0,1]] },
];

/* ===================== 套装数据（用户自定义，localStorage 缓存） ===================== */
function loadSets() {
  try { return JSON.parse(localStorage.getItem('nte_user_sets') || '[]'); }
  catch { return []; }
}
function persistSets() {
  try { localStorage.setItem('nte_user_sets', JSON.stringify(userSets)); }
  catch { /* localStorage 不可用时静默 */ }
}
let userSets = loadSets();

/* ===================== 状态 ===================== */
const CELL = 48;
const state = {
  rows: 5, cols: 5,
  available: [],
  placements: [],
  dragging: null,
  required: {},
};

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');

/* ===================== 初始化 ===================== */
function initGrid(rows, cols) {
  state.rows = rows; state.cols = cols;
  state.available = Array.from({length: rows}, () => Array(cols).fill(true));
  state.placements = [];
  resizeCanvas();
  render();
}
function resizeCanvas() {
  canvas.width = state.cols * CELL;
  canvas.height = state.rows * CELL;
}

/* ===================== 渲染 ===================== */
function render() {
  const { rows, cols, available, placements } = state;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * CELL, y = r * CELL;
      if (available[r][c]) {
        ctx.fillStyle = '#1a1f2a';
        ctx.fillRect(x, y, CELL, CELL);
        ctx.strokeStyle = '#252b37';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + .5, y + .5, CELL - 1, CELL - 1);
      } else {
        ctx.fillStyle = '#0b0d11';
        ctx.fillRect(x, y, CELL, CELL);
        ctx.strokeStyle = '#1a1d24';
        ctx.strokeRect(x + .5, y + .5, CELL - 1, CELL - 1);
        ctx.strokeStyle = '#1e222b';
        ctx.beginPath();
        ctx.moveTo(x, y); ctx.lineTo(x + CELL, y + CELL);
        ctx.moveTo(x + CELL, y); ctx.lineTo(x, y + CELL);
        ctx.stroke();
      }
    }
  }

  for (const p of placements) {
    const shp = SHAPES.find(s => s.id === p.blockId);
    if (!shp) continue;
    drawBlock(shp, p.cells, false);
  }

  if (state.dragging) {
    const shp = SHAPES.find(s => s.id === state.dragging.blockId);
    if (shp) {
      const { offsetR, offsetC, mouseX, mouseY } = state.dragging;
      const rect = canvas.getBoundingClientRect();
      const mx = mouseX - rect.left, my = mouseY - rect.top;
      const cellC = Math.floor(mx / CELL) - offsetC;
      const cellR = Math.floor(my / CELL) - offsetR;
      const valid = canPlace(shp, cellR, cellC, null);
      const previewCells = shp.cells.map(([dr, dc]) => [cellR + dr, cellC + dc]);
      drawBlock(shp, previewCells, true, valid);
    }
  }
}

function drawBlock(shp, cells, isPreview, valid = true) {
  const cellSet = new Set(cells.map(([r, c]) => r + ',' + c));
  const has = (r, c) => cellSet.has(r + ',' + c);
  const baseColor = isPreview ? (valid ? shp.color : '#ff4a4a') : shp.color;
  const alpha = isPreview ? 0.5 : 1;

  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.beginPath();
  for (const [r, c] of cells) {
    const x = c * CELL, y = r * CELL;
    ctx.rect(x, y, CELL, CELL);
  }
  const rs = cells.map(c => c[0]), cs = cells.map(c => c[1]);
  const minR = Math.min(...rs), maxR = Math.max(...rs);
  const minC = Math.min(...cs), maxC = Math.max(...cs);
  const grad = ctx.createLinearGradient(
    minC * CELL, minR * CELL,
    (maxC + 1) * CELL, (maxR + 1) * CELL
  );
  if (isPreview && !valid) {
    grad.addColorStop(0, '#ff6b6b');
    grad.addColorStop(1, '#c73a3a');
  } else {
    grad.addColorStop(0, lighten(baseColor, 30));
    grad.addColorStop(0.5, baseColor);
    grad.addColorStop(1, darken(baseColor, 20));
  }
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  for (const [r, c] of cells) {
    const x = c * CELL, y = r * CELL;
    if (has(r, c + 1)) {
      ctx.beginPath(); ctx.moveTo(x + CELL + .5, y); ctx.lineTo(x + CELL + .5, y + CELL); ctx.stroke();
    }
    if (has(r + 1, c)) {
      ctx.beginPath(); ctx.moveTo(x, y + CELL + .5); ctx.lineTo(x + CELL, y + CELL + .5); ctx.stroke();
    }
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  for (const [r, c] of cells) {
    const x = c * CELL, y = r * CELL;
    if (!has(r - 1, c)) { ctx.beginPath(); ctx.moveTo(x + 2, y + 2); ctx.lineTo(x + CELL - 2, y + 2); ctx.stroke(); }
    if (!has(r, c - 1)) { ctx.beginPath(); ctx.moveTo(x + 2, y + 2); ctx.lineTo(x + 2, y + CELL - 2); ctx.stroke(); }
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  for (const [r, c] of cells) {
    const x = c * CELL, y = r * CELL;
    if (!has(r + 1, c)) { ctx.beginPath(); ctx.moveTo(x + 2, y + CELL - 2); ctx.lineTo(x + CELL - 2, y + CELL - 2); ctx.stroke(); }
    if (!has(r, c + 1)) { ctx.beginPath(); ctx.moveTo(x + CELL - 2, y + 2); ctx.lineTo(x + CELL - 2, y + CELL - 2); ctx.stroke(); }
  }

  const outlinePath = new Path2D();
  for (const [r, c] of cells) {
    const x = c * CELL, y = r * CELL;
    if (!has(r - 1, c)) { outlinePath.moveTo(x, y); outlinePath.lineTo(x + CELL, y); }
    if (!has(r + 1, c)) { outlinePath.moveTo(x, y + CELL); outlinePath.lineTo(x + CELL, y + CELL); }
    if (!has(r, c - 1)) { outlinePath.moveTo(x, y); outlinePath.lineTo(x, y + CELL); }
    if (!has(r, c + 1)) { outlinePath.moveTo(x + CELL, y); outlinePath.lineTo(x + CELL, y + CELL); }
  }
  ctx.shadowColor = isPreview && !valid ? '#ff4a4a' : lighten(baseColor, 40);
  ctx.shadowBlur = isPreview ? 4 : 8;
  ctx.strokeStyle = isPreview ? (valid ? '#ffffff' : '#ff8888') : '#ffffff';
  ctx.lineWidth = isPreview ? 2 : 2.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke(outlinePath);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = isPreview && !valid ? '#ffaaaa' : lighten(baseColor, 50);
  ctx.lineWidth = 1;
  ctx.stroke(outlinePath);

  ctx.restore();
}

function lighten(hex, amt) {
  const c = hex.replace('#', '');
  const num = parseInt(c, 16);
  let r = (num >> 16) + amt; if (r > 255) r = 255;
  let g = ((num >> 8) & 0xff) + amt; if (g > 255) g = 255;
  let b = (num & 0xff) + amt; if (b > 255) b = 255;
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}
function darken(hex, amt) {
  const c = hex.replace('#', '');
  const num = parseInt(c, 16);
  let r = (num >> 16) - amt; if (r < 0) r = 0;
  let g = ((num >> 8) & 0xff) - amt; if (g < 0) g = 0;
  let b = (num & 0xff) - amt; if (b < 0) b = 0;
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

/* ===================== 放置逻辑 ===================== */
function findPlacementAt(r, c) {
  for (const p of state.placements) {
    if (p.cells.some(([pr, pc]) => pr === r && pc === c)) return p;
  }
  return null;
}
function canPlace(shp, baseR, baseC, exclude) {
  for (const [dr, dc] of shp.cells) {
    const r = baseR + dr, c = baseC + dc;
    if (r < 0 || r >= state.rows || c < 0 || c >= state.cols) return false;
    if (!state.available[r][c]) return false;
    const hit = findPlacementAt(r, c);
    if (hit && hit !== exclude) return false;
  }
  return true;
}
function placeBlock(shp, baseR, baseC) {
  const cells = shp.cells.map(([dr, dc]) => [baseR + dr, baseC + dc]);
  state.placements.push({ blockId: shp.id, cells });
  render();
}

/* ===================== 画布交互 ===================== */
canvas.addEventListener('mousedown', e => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  const c = Math.floor(mx / CELL), r = Math.floor(my / CELL);
  if (r < 0 || r >= state.rows || c < 0 || c >= state.cols) return;

  if (e.button === 0) {
    const hit = findPlacementAt(r, c);
    if (hit) {
      const shp = SHAPES.find(s => s.id === hit.blockId);
      const anchor = hit.cells[0];
      const offsetR = r - anchor[0];
      const offsetC = c - anchor[1];
      state.placements = state.placements.filter(p => p !== hit);
      state.dragging = { blockId: shp.id, offsetR, offsetC, mouseX: e.clientX, mouseY: e.clientY };
      render();
      return;
    }
    state.available[r][c] = !state.available[r][c];
    render();
  }
});
canvas.addEventListener('mousemove', e => {
  if (state.dragging) {
    state.dragging.mouseX = e.clientX;
    state.dragging.mouseY = e.clientY;
    render();
  }
});
window.addEventListener('mouseup', e => {
  if (state.dragging) {
    const { blockId, offsetR, offsetC, mouseX, mouseY } = state.dragging;
    const shp = SHAPES.find(s => s.id === blockId);
    const rect = canvas.getBoundingClientRect();
    const mx = mouseX - rect.left, my = mouseY - rect.top;
    const cellC = Math.floor(mx / CELL) - offsetC;
    const cellR = Math.floor(my / CELL) - offsetR;
    if (shp && canPlace(shp, cellR, cellC, null)) {
      placeBlock(shp, cellR, cellC);
    }
    state.dragging = null;
    render();
  }
});
canvas.addEventListener('contextmenu', e => {
  e.preventDefault();
  state.available = Array.from({length: state.rows}, () => Array(state.cols).fill(true));
  state.placements = [];
  render();
});

/* ===================== 驱动块库 UI ===================== */
function renderBlockLib() {
  const lib = document.getElementById('blockLib');
  lib.innerHTML = '';
  const order = { IV: 0, III: 1, II: 2 };
  const sorted = [...SHAPES].sort((a, b) => order[a.type] - order[b.type]);
  for (const shp of sorted) {
    const div = document.createElement('div');
    div.className = 'lib-item';
    div.draggable = true;
    div.dataset.id = shp.id;
    div.appendChild(makeShapePreviewEl(shp, 11));
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = shp.name;
    div.appendChild(name);
    div.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', shp.id);
    });
    lib.appendChild(div);
  }
}
canvas.addEventListener('dragover', e => e.preventDefault());
canvas.addEventListener('drop', e => {
  e.preventDefault();
  const id = e.dataTransfer.getData('text/plain');
  const shp = SHAPES.find(s => s.id === id);
  if (!shp) return;
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  const baseC = Math.floor(mx / CELL);
  const baseR = Math.floor(my / CELL);
  if (canPlace(shp, baseR, baseC, null)) {
    placeBlock(shp, baseR, baseC);
  } else {
    setStatus('该位置无法放置（越界/不可用/重叠）', true);
  }
});

function makeShapePreviewEl(shp, cellSize) {
  const maxR = Math.max(...shp.cells.map(c => c[0])) + 1;
  const maxC = Math.max(...shp.cells.map(c => c[1])) + 1;
  const preview = document.createElement('div');
  preview.className = 'preview';
  preview.style.gridTemplateColumns = `repeat(${maxC}, ${cellSize}px)`;
  for (let r = 0; r < maxR; r++) {
    for (let c = 0; c < maxC; c++) {
      const d = document.createElement('div');
      const on = shp.cells.some(([cr, cc]) => cr === r && cc === c);
      d.className = on ? 'on' : 'off';
      if (on) d.style.background = shp.color;
      preview.appendChild(d);
    }
  }
  return preview;
}

/* ===================== 套装编辑器 ===================== */
function renderSetList() {
  const list = document.getElementById('setList');
  list.innerHTML = '';
  if (userSets.length === 0) {
    list.innerHTML = '<div class="hint">还没有套装，点「新建套装」开始配置。</div>';
  }
  for (const set of userSets) {
    const item = document.createElement('div');
    item.className = 'set-item';
    item.dataset.id = set.id;

    const head = document.createElement('div');
    head.className = 'set-head';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = set.name;
    nameInput.placeholder = '套装名';
    nameInput.addEventListener('input', () => { set.name = nameInput.value; persistSets(); });
    head.appendChild(nameInput);

    const delBtn = document.createElement('button');
    delBtn.className = 'danger small';
    delBtn.textContent = '删除';
    delBtn.addEventListener('click', () => {
      userSets = userSets.filter(s => s.id !== set.id);
      renderSetList();
      renderSetPresetOptions();
      persistSets();
    });
    head.appendChild(delBtn);
    item.appendChild(head);

    const slots = document.createElement('div');
    slots.className = 'slots';
    for (let i = 0; i < 4; i++) {
      const box = document.createElement('div');
      box.className = 'slot-box' + (set.slots[i] ? '' : ' empty');
      if (set.slots[i]) {
        const shp = SHAPES.find(s => s.id === set.slots[i]);
        if (shp) box.appendChild(makeShapePreviewEl(shp, 7));
      }
      box.addEventListener('click', e => {
        e.stopPropagation();
        openShapePicker(box, shp => {
          set.slots[i] = shp ? shp.id : null;
          renderSetList();
          persistSets();
        });
      });
      slots.appendChild(box);
    }
    item.appendChild(slots);

    list.appendChild(item);
  }
}

document.getElementById('addSet').addEventListener('click', () => {
  userSets.push({
    id: 'set_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
    name: '新套装',
    slots: [null, null, null, null],
  });
  renderSetList();
  renderSetPresetOptions();
  persistSets();
});

/* ===================== 形状选择弹层 ===================== */
let shapePickerCallback = null;
const pickerEl = document.getElementById('shapePicker');

function openShapePicker(anchorEl, callback) {
  shapePickerCallback = callback;
  pickerEl.innerHTML = '';

  const clearBtn = document.createElement('button');
  clearBtn.textContent = '清空';
  clearBtn.className = 'small';
  clearBtn.style.marginBottom = '6px';
  clearBtn.style.width = '100%';
  clearBtn.addEventListener('click', () => {
    if (shapePickerCallback) shapePickerCallback(null);
    closeShapePicker();
  });
  pickerEl.appendChild(clearBtn);

  const grid = document.createElement('div');
  grid.className = 'picker-grid';
  for (const shp of SHAPES) {
    const it = document.createElement('div');
    it.className = 'picker-item';
    it.title = shp.name;
    it.appendChild(makeShapePreviewEl(shp, 8));
    it.addEventListener('click', () => {
      if (shapePickerCallback) shapePickerCallback(shp);
      closeShapePicker();
    });
    grid.appendChild(it);
  }
  pickerEl.appendChild(grid);

  const rect = anchorEl.getBoundingClientRect();
  pickerEl.classList.add('show');
  const pw = pickerEl.offsetWidth, ph = pickerEl.offsetHeight;
  let left = rect.left, top = rect.bottom + 4;
  if (left + pw > window.innerWidth) left = window.innerWidth - pw - 8;
  if (top + ph > window.innerHeight) top = rect.top - ph - 4;
  pickerEl.style.left = left + 'px';
  pickerEl.style.top = top + 'px';
}
function closeShapePicker() {
  pickerEl.classList.remove('show');
  shapePickerCallback = null;
}
document.addEventListener('click', e => {
  if (!pickerEl.contains(e.target) && !e.target.closest('.slot-box')) {
    closeShapePicker();
  }
});

/* ===================== 套装预设下拉 ===================== */
function renderSetPresetOptions() {
  const sel = document.getElementById('setPreset');
  const cur = sel.value;
  sel.innerHTML = '<option value="">— 选择套装 —</option>';
  for (const set of userSets) {
    const opt = document.createElement('option');
    opt.value = set.id;
    opt.textContent = set.name;
    sel.appendChild(opt);
  }
  if (userSets.some(s => s.id === cur)) sel.value = cur;
}
document.getElementById('setPreset').addEventListener('change', e => {
  const setId = e.target.value;
  if (!setId) return;
  const set = userSets.find(s => s.id === setId);
  if (!set) return;
  state.required = {};
  for (const sid of set.slots) {
    if (!sid) continue;
    state.required[sid] = (state.required[sid] || 0) + 1;
  }
  renderReqGrid();
});

/* ===================== 必填形状 UI ===================== */
function renderReqGrid() {
  const grid = document.getElementById('reqGrid');
  grid.innerHTML = '';
  for (const shp of SHAPES) {
    const div = document.createElement('div');
    div.className = 'req-item' + (state.required[shp.id] ? ' active' : '');
    div.dataset.id = shp.id;
    div.appendChild(makeShapePreviewEl(shp, 9));
    const badge = document.createElement('div');
    badge.className = 'badge';
    badge.textContent = state.required[shp.id] ? '×' + state.required[shp.id] : '';
    div.appendChild(badge);
    div.addEventListener('click', () => {
      if (state.required[shp.id]) {
        state.required[shp.id]++;
        if (state.required[shp.id] > 4) delete state.required[shp.id];
      } else {
        state.required[shp.id] = 1;
      }
      renderReqGrid();
    });
    div.addEventListener('contextmenu', e => {
      e.preventDefault();
      delete state.required[shp.id];
      renderReqGrid();
    });
    grid.appendChild(div);
  }
}

/* ===================== 求解器 ===================== */
function solve() {
  const useSet = document.getElementById('condSet').checked;
  const useFill = document.getElementById('condFill').checked;
  const occupied = new Set();
  const key = (r, c) => r + ',' + c;
  const result = [];

  const availCells = [];
  for (let r = 0; r < state.rows; r++)
    for (let c = 0; c < state.cols; c++)
      if (state.available[r][c]) availCells.push([r, c]);

  function canPlaceAt(shp, br, bc) {
    for (const [dr, dc] of shp.cells) {
      const r = br + dr, c = bc + dc;
      if (r < 0 || r >= state.rows || c < 0 || c >= state.cols) return false;
      if (!state.available[r][c]) return false;
      if (occupied.has(key(r, c))) return false;
    }
    return true;
  }
  function placeAt(shp, br, bc) {
    const cells = shp.cells.map(([dr, dc]) => [br + dr, bc + dc]);
    for (const [r, c] of cells) occupied.add(key(r, c));
    result.push({ blockId: shp.id, cells });
  }
  function tryPlaceShape(shp) {
    for (const [br, bc] of availCells) {
      if (canPlaceAt(shp, br, bc)) { placeAt(shp, br, bc); return true; }
    }
    return false;
  }

  if (useSet) {
    const pending = [];
    for (const [shapeId, count] of Object.entries(state.required)) {
      const shp = SHAPES.find(s => s.id === shapeId);
      for (let i = 0; i < count; i++) pending.push(shp);
    }
    pending.sort((a, b) => b.cells.length - a.cells.length);
    for (const shp of pending) {
      if (!tryPlaceShape(shp)) setStatus(`无法放置必填形状：${shp.name}（空间不足）`, true);
    }
  }

  if (useFill) {
    const fillOrder = [...SHAPES].sort((a, b) => b.cells.length - a.cells.length);
    let progress = true, guard = 0;
    while (progress && guard++ < 500) {
      progress = false;
      for (const shp of fillOrder) {
        if (tryPlaceShape(shp)) { progress = true; break; }
      }
    }
  }

  state.placements = result;
  render();
  const totalCells = occupied.size;
  const totalAvail = availCells.length;
  setStatus(`分配完成：放置 ${result.length} 个块，覆盖 ${totalCells}/${totalAvail} 格`);
}
document.getElementById('solveBtn').addEventListener('click', solve);
document.getElementById('clearPlacement').addEventListener('click', () => {
  state.placements = [];
  render();
  setStatus('已清空放置');
});

/* ===================== 套装 JSON 导入导出（suit/ 目录） ===================== */
function exportSetsJson() {
  const json = JSON.stringify({ version: 1, sets: userSets }, null, 2);
  document.getElementById('jsonArea').value = json;
  document.getElementById('modalTitle').textContent = '套装 JSON（可复制，或点「下载 JSON」保存到 suit/ 目录）';
  document.getElementById('modalApply').dataset.mode = 'sets';
  showModal(false);
}
function normalizeSets(data) {
  const sets = Array.isArray(data) ? data : data.sets;
  if (!Array.isArray(sets)) throw new Error('格式错误');
  return sets.map(s => ({
    id: s.id || 'set_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
    name: s.name || '未命名',
    slots: (s.slots || []).slice(0, 4).concat([null, null, null, null]).slice(0, 4),
  }));
}
function importSetsJson() {
  try {
    const data = JSON.parse(document.getElementById('jsonArea').value);
    userSets = normalizeSets(data);
    renderSetList();
    renderSetPresetOptions();
    persistSets();
    setStatus('套装导入成功');
    hideModal();
  } catch (err) {
    alert('导入失败：' + err.message);
  }
}
document.getElementById('exportSets').addEventListener('click', exportSetsJson);
document.getElementById('importSets').addEventListener('click', () => {
  document.getElementById('jsonArea').value = '';
  document.getElementById('modalTitle').textContent = '导入套装 JSON';
  document.getElementById('modalApply').dataset.mode = 'sets';
  showModal(true);
});

/* ===================== 整体 JSON 导入导出 ===================== */
function exportConfig() {
  const name = document.getElementById('charName').value.trim() || '未命名角色';
  const config = {
    name, version: 3,
    grid: {
      rows: state.rows, cols: state.cols,
      available: state.available.map(row => row.map(v => v ? 1 : 0)),
    },
    preset: document.getElementById('setPreset').value || null,
    conditions: {
      basedOnSet: document.getElementById('condSet').checked,
      fillRemaining: document.getElementById('condFill').checked,
      required: state.required,
    },
    solution: state.placements.map(p => ({ shapeId: p.blockId, cells: p.cells })),
  };
  document.getElementById('jsonArea').value = JSON.stringify(config, null, 2);
  document.getElementById('modalTitle').textContent = '整体配置 JSON';
  document.getElementById('modalApply').dataset.mode = 'config';
  showModal(false);
}
function importConfig() {
  try {
    const config = JSON.parse(document.getElementById('jsonArea').value);
    if (!config.grid) throw new Error('缺少 grid 字段');
    state.rows = config.grid.rows;
    state.cols = config.grid.cols;
    state.available = config.grid.available.map(row => row.map(v => !!v));
    state.placements = (config.solution || []).map(p => ({
      blockId: p.shapeId || p.blockId,
      cells: p.cells,
    }));
    state.required = config.conditions?.required || {};
    if (config.preset) document.getElementById('setPreset').value = config.preset;
    if (config.conditions) {
      document.getElementById('condSet').checked = !!config.conditions.basedOnSet;
      document.getElementById('condFill').checked = !!config.conditions.fillRemaining;
    }
    if (config.name) document.getElementById('charName').value = config.name;
    document.getElementById('rows').value = state.rows;
    document.getElementById('cols').value = state.cols;
    resizeCanvas();
    renderReqGrid();
    render();
    setStatus('导入成功');
    hideModal();
  } catch (err) {
    alert('导入失败：' + err.message);
  }
}
document.getElementById('exportBtn').addEventListener('click', exportConfig);
document.getElementById('importBtn').addEventListener('click', () => {
  document.getElementById('jsonArea').value = '';
  document.getElementById('modalTitle').textContent = '导入整体配置 JSON';
  document.getElementById('modalApply').dataset.mode = 'config';
  showModal(true);
});

/* ===================== 自定义容器（character/ 目录） ===================== */
let customContainers = loadContainers();
let containerExportName = '';

function loadContainers() {
  try { return JSON.parse(localStorage.getItem('nte_custom_containers') || '[]'); }
  catch { return []; }
}
function persistContainers() {
  try {
    localStorage.setItem('nte_custom_containers', JSON.stringify(customContainers));
  } catch { /* localStorage 不可用时静默 */ }
}
function renderContainerOptions() {
  const sel = document.getElementById('containerPreset');
  const cur = sel.value;
  sel.innerHTML = '<option value="">— 已有容器 —</option>';
  for (const c of customContainers) {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.name}（${c.rows}×${c.cols}）`;
    sel.appendChild(opt);
  }
  if (customContainers.some(c => c.id === cur)) sel.value = cur;
}
function getSelectedContainer() {
  const id = document.getElementById('containerPreset').value;
  return customContainers.find(c => c.id === id) || null;
}
function buildContainerJson(name) {
  return {
    kind: 'character',
    version: 1,
    name: name || '未命名容器',
    grid: {
      rows: state.rows, cols: state.cols,
      available: state.available.map(row => row.map(v => v ? 1 : 0)),
    },
  };
}

document.getElementById('saveContainer').addEventListener('click', () => {
  const defName = getSelectedContainer() ? getSelectedContainer().name : '新容器';
  const name = (prompt('为当前画布指定容器名：', defName) || '').trim();
  if (!name) { setStatus('已取消保存容器'); return; }

  const replaced = customContainers.find(c => c.name === name);
  if (replaced) {
    if (!confirm(`已存在同名容器「${name}」，是否用当前画布覆盖它？`)) return;
    replaced.rows = state.rows;
    replaced.cols = state.cols;
    replaced.available = state.available.map(row => row.map(v => v ? 1 : 0));
  } else {
    const rows = state.rows, cols = state.cols, available = state.available;
    customContainers.push({
      id: 'char_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
      name, rows, cols,
      available: available.map(row => row.map(v => v ? 1 : 0)),
    });
  }
  persistContainers();
  renderContainerOptions();
  setStatus(`容器「${name}」已保存（${state.rows}×${state.cols}）`);
});

document.getElementById('applyContainer').addEventListener('click', () => {
  const container = getSelectedContainer();
  if (!container) { setStatus('请先在下拉框选择要应用的容器', true); return; }
  if (state.placements.length > 0 && !confirm('应用容器会清空当前放置，继续？')) return;
  initGrid(container.rows, container.cols);
  state.available = container.available.map(row => row.map(v => !!v));
  document.getElementById('rows').value = state.rows;
  document.getElementById('cols').value = state.cols;
  render();
  setStatus(`已应用容器「${container.name}」，左键点击格子可继续编辑可选/不可选区域`);
});

document.getElementById('renameContainer').addEventListener('click', () => {
  const container = getSelectedContainer();
  if (!container) { setStatus('请先选择要重命名的容器', true); return; }
  const newName = (prompt('新的容器名：', container.name) || '').trim();
  if (!newName || newName === container.name) return;
  container.name = newName;
  persistContainers();
  renderContainerOptions();
  setStatus(`容器已重命名为「${newName}」`);
});

document.getElementById('deleteContainer').addEventListener('click', () => {
  const container = getSelectedContainer();
  if (!container) { setStatus('请先选择要删除的容器', true); return; }
  if (!confirm(`确定删除容器「${container.name}」？`)) return;
  customContainers = customContainers.filter(c => c.id !== container.id);
  persistContainers();
  renderContainerOptions();
  setStatus(`已删除容器「${container.name}」`);
});

document.getElementById('exportContainer').addEventListener('click', () => {
  const container = getSelectedContainer();
  if (!container) { setStatus('请先选择要导出的容器（亦可用「保存当前为容器」暂存后再导出）', true); return; }
  containerExportName = container.name;
  const json = JSON.stringify({
    kind: 'character', version: 1,
    name: container.name,
    grid: {
      rows: container.rows, cols: container.cols,
      available: container.available.map(row => row.map(v => v ? 1 : 0)),
    },
  }, null, 2);
  document.getElementById('jsonArea').value = json;
  document.getElementById('modalTitle').textContent = '自定义容器 JSON（点「下载 JSON」保存到 character/ 目录）';
  document.getElementById('modalApply').dataset.mode = 'container';
  showModal(false);
});

document.getElementById('importContainer').addEventListener('click', () => {
  document.getElementById('jsonArea').value = '';
  document.getElementById('modalTitle').textContent = '导入自定义容器 JSON';
  document.getElementById('modalApply').dataset.mode = 'container';
  showModal(true);
});
function normalizeContainers(data) {
  const list = Array.isArray(data) ? data : (data.containers || (data.grid ? [data] : null));
  if (!list) throw new Error('格式错误：应为容器对象或数组');
  return list.map(item => {
    if (!item.grid) throw new Error('缺少 grid 字段');
    const rows = Math.max(1, Math.min(10, parseInt(item.grid.rows) || 5));
    const cols = Math.max(1, Math.min(10, parseInt(item.grid.cols) || 5));
    const available = Array.from({length: rows}, (_, r) =>
      Array.from({length: cols}, (_, c) => {
        const row = item.grid.available && item.grid.available[r];
        return row ? !!row[c] : true;
      })
    );
    return {
      id: item.id || 'char_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
      name: item.name || '未命名容器',
      rows, cols, available,
    };
  });
}
function importContainerJson() {
  try {
    const data = JSON.parse(document.getElementById('jsonArea').value);
    const list = normalizeContainers(data);
    customContainers.push(...list);
    persistContainers();
    renderContainerOptions();
    setStatus('容器导入成功：' + list.map(c => c.name).join('、'));
    hideModal();
  } catch (err) {
    alert('导入失败：' + err.message);
  }
}

/* ===================== 批量导入配置（解析后缓存到 localStorage） ===================== */
function pickJsonFiles() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.json,application/json';
    input.style.display = 'none';
    document.body.appendChild(input);
    let settled = false;
    const done = v => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(v);
    };
    input.onchange = () => done(input.files ? Array.from(input.files) : []);
    window.addEventListener('focus', function onFocus() {
      if (!settled && input.files && input.files.length === 0) done([]);
    }, { once: true });
    input.click();
  });
}
function readFileText(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error('读取文件失败'));
    fr.readAsText(file);
  });
}
async function mergeFromFiles(files, normalize, list, persistFns, renderFns, matchBy) {
  // matchBy(item) 返回候选匹配键数组（默认仅 id）；list 中任一元素的 id 或 name 命中即视为同一条目并更新。
  // 更新时保留本地条目原 id，避免破坏已导出整体配置中的 preset 引用。
  const stats = { added: 0, updated: 0, skipped: 0, errors: [] };
  for (const f of files) {
    try {
      const text = typeof f.text === 'function' ? await f.text() : await readFileText(f);
      const items = normalize(JSON.parse(text));
      for (const item of items) {
        const candidates = matchBy ? matchBy(item) : [item.id];
        const idx = list.findIndex(x =>
          candidates.some(k => k && (x.id === k || (x.name && x.name === k)))
        );
        if (idx >= 0) {
          const localId = list[idx].id;
          list[idx] = item;
          list[idx].id = localId;
          stats.updated++;
        } else {
          list.push(item);
          stats.added++;
        }
      }
    } catch (err) {
      stats.skipped++;
      stats.errors.push(`${f.name}: ${err.message}`);
    }
  }
  for (const fn of persistFns) fn();
  for (const fn of renderFns) fn();
  return stats;
}
function buildImportMsg(kind, fileCount, stats) {
  return `已批量导入 ${fileCount} 个文件：${kind} 新增 ${stats.added}，更新 ${stats.updated}` + (stats.skipped ? `，跳过 ${stats.skipped}（${stats.errors.join('；')}）` : '');
}
document.getElementById('batchImportContainer').addEventListener('click', async () => {
  const files = await pickJsonFiles();
  if (!files || files.length === 0) { setStatus('已取消选择文件'); return; }
  const stats = await mergeFromFiles(files, normalizeContainers, customContainers, [persistContainers], [renderContainerOptions]);
  setStatus(buildImportMsg('容器', files.length, stats), stats.skipped > 0);
});
document.getElementById('batchImportSets').addEventListener('click', async () => {
  const files = await pickJsonFiles();
  if (!files || files.length === 0) { setStatus('已取消选择文件'); return; }
  const stats = await mergeFromFiles(
    files, normalizeSets, userSets,
    [persistSets], [renderSetList, renderSetPresetOptions],
    item => { const keys = [item.id]; if (item.name && item.name !== '未命名') keys.push(item.name); return keys; }
  );
  setStatus(buildImportMsg('套装', files.length, stats), stats.skipped > 0);
});

/* ===================== 模态框 ===================== */
function showModal(isImport) {
  document.getElementById('modalApply').style.display = isImport ? 'inline-block' : 'none';
  document.getElementById('modalDownload').style.display = isImport ? 'none' : 'inline-block';
  document.getElementById('modalMask').classList.add('show');
}
function hideModal() { document.getElementById('modalMask').classList.remove('show'); }
document.getElementById('modalClose').addEventListener('click', hideModal);
document.getElementById('modalApply').addEventListener('click', () => {
  const mode = document.getElementById('modalApply').dataset.mode;
  if (mode === 'sets') importSetsJson();
  else if (mode === 'container') importContainerJson();
  else importConfig();
});
document.getElementById('modalMask').addEventListener('click', e => {
  if (e.target.id === 'modalMask') hideModal();
});

function safeFileName(name) {
  return String(name || '').replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'unnamed';
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
document.getElementById('modalDownload').addEventListener('click', () => {
  const mode = document.getElementById('modalApply').dataset.mode;
  const text = document.getElementById('jsonArea').value;
  let filename, dirHint;
  if (mode === 'sets') {
    const firstName = userSets[0] && safeFileName(userSets[0].name);
    filename = `suit_${firstName || '套装配'}.json`;
    dirHint = 'suit/';
  } else if (mode === 'container') {
    filename = `character_${safeFileName(containerExportName || '容器')}.json`;
    dirHint = 'character/';
  } else {
    const rname = safeFileName(document.getElementById('charName').value.trim() || '未命名角色');
    filename = `config_${rname}.json`;
    dirHint = '项目根目录';
  }
  downloadText(filename, text);
  setStatus(`已生成下载文件「${filename}」，请保存到 ${dirHint} 目录`);
});

document.getElementById('applyGrid').addEventListener('click', () => {
  const rows = Math.max(1, Math.min(10, parseInt(document.getElementById('rows').value) || 5));
  const cols = Math.max(1, Math.min(10, parseInt(document.getElementById('cols').value) || 5));
  if (rows === state.rows && cols === state.cols) return;
  if (state.placements.length > 0 && !confirm('改变网格尺寸会清空当前放置，继续？')) return;
  initGrid(rows, cols);
});

function setStatus(msg, isError) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.style.color = isError ? '#ff6b6b' : '#8b95a8';
}

/* ===================== 启动 ===================== */
initGrid(5, 5);
renderBlockLib();
renderSetList();
renderSetPresetOptions();
renderReqGrid();
renderContainerOptions();
if (userSets.length || customContainers.length) {
  setStatus(`已加载本地缓存：${userSets.length} 个套装、${customContainers.length} 个容器（刷新不丢失，新增可通过「批量导入 JSON」添加）`);
}

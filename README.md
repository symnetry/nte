# NTE · 异环空幕分配工具

> 异环·空幕放置辅助工具 + 多联块精确覆盖求解器。给定角色棋盘（容器）与套装（必填驱动块），把全部形状精准铺满整个棋盘，并枚举出所有合法铺法供挑选。

---

## 功能特性

- **一键最优分配**：基于锚点约束的带剪枝深度优先搜索（DFS），枚举出**全部**将容器 100% 精准占满的铺法（精确覆盖 / 零留空）。
- **必填套装 + 可选形状池**：选套装后 4 个形状必填（画布黄色）；可额外点选形状作为可选池（带库存上限，画布紫色）。
  - 「限定可选形状池」开关（`usePalette`）：关闭 = 旧逻辑（剩余空间用全部 12 种形状填空、无上限）；开启 = 仅用所选形状池填充。
  - **虚荣模式**（`vanity`）：限定可选形状池的分支，套装块变非必选，全部所选形状均为可选池。
- **方案排序优先级**（异环设定）：不同角色对驱动块类型偏好不同（Ⅱ/Ⅲ/Ⅳ 型），下拉选择后命中所选类型的方案排最前。
- **方案分页浏览**：多个合格方案时顶部出分页条（上一/下一 + x/N + 已截断提示 + 当前优先级），可逐方案翻看。
- **副词条编辑**：每个放置的驱动块可挂一组副词条，支持「一键全满」套用到全部块。
- **容器 / 套装管理**：内置 4 个角色容器、12 套套装；支持自定义增删、在线加载、JSON 导入导出。
- **画布交互**：左键编辑可用区 / 放置块、拖拽移动、右键移除；支持「点选放置」模式。

---

## 技术栈

- **React 18** + **Vite 5**（纯前端，无后端依赖）
- Canvas 绘制棋盘与驱动块
- 求解器为纯函数（`src/utils/solver.js`），BigInt 位掩码状态 + 记忆化剪枝

---

## 快速开始

```bash
# 安装依赖
npm install      # 或 pnpm / yarn

# 启动开发服务器
npm run dev

# 生产构建
npm run build

# 预览构建产物
npm run preview
```

构建产物输出到 `dist/`，可直接静态部署（含 Electron 嵌入场景）。

---

## 目录结构

```
nte/
├── public/
│   ├── suit/            # 套装数据（JSON），首次启动自动加载内置套装
│   │   ├── all.json
│   │   └── suit_*.json
│   └── character/       # 角色容器数据（JSON，含 grid 可用区矩阵）
│       ├── manifest.json
│       └── character_*.json
├── src/
│   ├── App.jsx          # 布局：侧栏面板 + 主区画布
│   ├── main.jsx
│   ├── data/
│   │   ├── shapes.js        # 12 种驱动块形状库（固定朝向）+ ROLE_COLOR
│   │   ├── driveStats.js    # 副词条数据
│   │   └── substatPresets.js
│   ├── state/
│   │   ├── context.js       # React Context
│   │   └── useNteState.jsx  # 全局状态与所有动作（求解/排序/导入导出等）
│   ├── components/
│   │   ├── Board.jsx        # 画布 + 方案分页条
│   │   ├── panels/
│   │   │   ├── ContainerPanel.jsx   # 容器（角色棋盘）管理
│   │   │   ├── BlockLib.jsx         # 驱动块库（拖拽/点选放置）
│   │   │   ├── ConditionPanel.jsx   # 分配条件（必填套装/可选池/优先级）
│   │   │   ├── SetEditor.jsx        # 套装编辑
│   │   │   ├── ActionsPanel.jsx     # 运行求解 / JSON 导入导出
│   │   │   └── SubstatPanel.jsx     # 副词条编辑
│   │   └── common.jsx
│   ├── utils/
│   │   ├── solver.js      # 精确覆盖求解器（核心算法，见 docs/solver.md）
│   │   ├── jsonIO.js
│   │   └── storage.js
│   └── styles.css
└── docs/
    └── solver.md         # 求解器设计说明（业务 + 代码）
```

---

## 数据格式

### 容器（character JSON）

```json
{
  "kind": "character",
  "version": 1,
  "name": "Fadia",
  "grid": {
    "rows": 5,
    "cols": 5,
    "available": [[1,1,1,1,1],[1,1,1,1,1],[1,1,1,1,1],[1,1,1,1,1],[1,1,1,1,1]]
  }
}
```

`available` 为 0/1 矩阵，`1` 表示可用格。

### 套装（suit JSON）

```json
{
  "version": 1,
  "sets": [
    { "id": "set_xxx", "name": "缇娜的夜间酒馆", "slots": ["II-v2", "III-a", "IV-h4", "II-h2"] }
  ]
}
```

`slots` 为 4 个形状 id（选中后各必填 1 次）。

### 整体配置导出（ActionsPanel → 导出配置）

```json
{
  "name": "角色名",
  "version": 3,
  "grid": { "rows": 5, "cols": 5, "available": [[...]] },
  "preset": "set_id",
  "conditions": {
    "basedOnSet": true, "fillRemaining": true, "usePalette": false,
    "vanity": false, "priorityType": "", "required": {...}, "palette": {...}
  },
  "solution": [ { "shapeId": "II-h2", "cells": [[0,0],[1,0]], "substats": [...] } ]
}
```

---

## 求解器原理速览

- **锚点约束**：驱动块朝向固定，「行优先最靠前的未处理格」必为当前放置块的锚点，每层级只在该锚点枚举合法放置，分支极小。
- **三道搜索中剪枝**：预算/`deadMemo` 记忆化、必填可达性、前向剪枝（孤立死洞检测），搜索空间大幅缩小、不丢解。
- **批去重**：同一「驱动块多重集合」（与位置/顺序无关、非旋转翻转）的铺法只保留一个。
- **贪心兜底**：穷举无完全铺满方案时回退贪心近似并明确提示。

完整设计说明见 [`docs/solver.md`](./docs/solver.md)。动态算法流程可视化见 [`docs/solver-visualization.html`](./docs/solver-visualization.html)（双击即可打开，无需构建）。

---

## 优先级 / 排序说明

方案排序优先级是**展示层排序**，不触发重新求解：选择「Ⅱ型优先」后，含 Ⅱ型块最多的方案自动排到最前，用分页条翻看即可；同分时按「块数少（大块多）」兜底。

---

## License

内部工具，仅供异环·空幕放置规划使用。

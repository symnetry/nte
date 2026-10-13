const grid = [
    [1,1,0,0,1],
    [0,0,1,0,1],
    [0,0,1,0,1],
    [1,0,1,0,1]
]



function numIslands(grid) {
    if (!grid || grid.length === 0) return 0

    const m = grid.length
    const n = grid[0].length
    let count = 0

    // 从 (i, j) 出发，把整座岛屿沉没（相邻的 '1' 全变 '0'）
    function dfs(i, j) {
        // 越界 或 不是陆地 → 直接返回
        if (i < 0 || i >= m || j < 0 || j >= n || grid[i][j] !== '1') return

        grid[i][j] = '0'          // 标记已访问（沉没）

        dfs(i + 1, j)             // 下
        dfs(i - 1, j)             // 上
        dfs(i, j + 1)             // 右
        dfs(i, j - 1)             // 左
    }

    for (let i = 0; i < m; i++) {
        for (let j = 0; j < n; j++) {
            if (grid[i][j] === '1') {
                count++           // 发现新岛屿
                dfs(i, j)         // 把整座岛沉掉
            }
        }
    }

    return count
}
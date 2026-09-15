import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * 构建/开发启动时扫描 public/suit 与 public/character 下的 JSON 文件，
 * 自动生成 manifest.json（文件清单），供页面在线加载数据。
 * 用户只需把 JSON 放进 public/suit/、public/character/，清单自动更新。
 */
function generateManifest() {
  function writeManifest(dir) {
    const abs = path.join(__dirname, 'public', dir)
    if (!fs.existsSync(abs)) return
    const files = fs.readdirSync(abs)
      .filter(f => f.endsWith('.json') && f !== 'manifest.json')
      .sort((a, b) => a.localeCompare(b, 'zh-CN'))
      .map(f => ({ name: f }))
    fs.writeFileSync(
      path.join(abs, 'manifest.json'),
      JSON.stringify({ files }, null, 2),
      'utf-8',
    )
  }
  return {
    name: 'nte-generate-manifest',
    buildStart() {
      writeManifest('suit')
      writeManifest('character')
    },
  }
}

export default defineConfig({
  // 部署到线上的 /nte 路径
  base: '/nte/',
  plugins: [react(), generateManifest()],
  server: {
    host: true,
    port: 5173,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
})

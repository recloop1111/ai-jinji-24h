import { defineConfig } from 'vitest/config'
import path from 'node:path'

// テスト実行時に tsconfig の `@/*` エイリアス（プロジェクトルート）を解決する。
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(process.cwd()),
    },
  },
})

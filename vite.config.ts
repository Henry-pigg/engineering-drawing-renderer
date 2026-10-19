import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * base 不能写死：
 *   · 本地开发是 '/'；
 *   · GitHub Pages 是子路径站点（/<仓库名>/），前缀错了资源会整片 404。
 * 由 CI 传入 VITE_BASE，仓库改名也不用改代码。
 */
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [react()],
});

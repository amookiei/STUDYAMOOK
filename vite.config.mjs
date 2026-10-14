import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 프로덕션(file://)에서만 CSP 메타 태그를 넣는다. 개발 모드에서는 Vite HMR 인라인 스크립트가 필요해서 넣지 않는다.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://cdn.jsdelivr.net",
  "connect-src 'self' https: wss:",
].join('; ');

function cspPlugin() {
  return {
    name: 'ux-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<!--CSP-->', `<meta http-equiv="Content-Security-Policy" content="${CSP}">`);
    },
  };
}

export default defineConfig({
  // Electron 에서 dist/index.html 을 file:// 로 열기 때문에 상대 경로가 필요하다.
  base: './',
  plugins: [react(), cspPlugin()],
  server: {
    port: 5173,
    strictPort: true,
    host: '127.0.0.1',
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    target: 'chrome130',
  },
});

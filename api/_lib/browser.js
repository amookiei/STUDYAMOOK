// 서버리스용 헤드리스 Chromium 실행.
// Vercel 에서는 @sparticuz/chromium 이 번들한 바이너리를, 로컬 테스트에서는 CHROMIUM_PATH 환경 변수의 브라우저를 쓴다.
const fs = require('fs');
const path = require('path');
const { chromium: playwright } = require('playwright-core');

// 서버리스 Chromium 에는 라틴 폰트만 들어 있어 한글이 네모로 깨진다.
// fontconfig 가 /tmp/fonts 를 읽으므로 실행 전에 한글 폰트를 받아 둔다 (인스턴스가 살아 있는 동안 재사용).
const FONT_DIR = '/tmp/fonts';
const DEFAULT_FONT_URLS = [
  'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosanskr/NotoSansKR%5Bwght%5D.ttf',
];
let fontsReady = null;

async function ensureFonts() {
  if (fontsReady) return fontsReady;
  fontsReady = (async () => {
    const urls = (process.env.CAPTURE_FONT_URLS || DEFAULT_FONT_URLS.join(',')).split(',').map((u) => u.trim()).filter(Boolean);
    if (!urls.length) return;
    fs.mkdirSync(FONT_DIR, { recursive: true });
    await Promise.all(urls.map(async (url) => {
      const file = path.join(FONT_DIR, decodeURIComponent(new URL(url).pathname.split('/').pop()) || 'font.ttf');
      if (fs.existsSync(file) && fs.statSync(file).size > 0) return;
      try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        fs.writeFileSync(file, Buffer.from(await resp.arrayBuffer()));
      } catch (err) {
        console.warn(`[api/capture] 폰트를 받지 못했습니다 (${url}): ${err.message}. 한글이 깨질 수 있습니다.`);
      }
    }));
  })();
  return fontsReady;
}

async function launchBrowser() {
  const override = (process.env.CHROMIUM_PATH || '').trim();
  if (override) {
    return playwright.launch({ executablePath: override, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  }
  // @sparticuz/chromium 은 ESM 전용 패키지라 CommonJS 에서는 동적 import() 로 불러와야 한다.
  const mod = await import('@sparticuz/chromium');
  const chromium = mod.default || mod;
  const [executablePath] = await Promise.all([chromium.executablePath(), ensureFonts()]);
  return playwright.launch({ executablePath, headless: true, args: [...chromium.args, '--disable-dev-shm-usage'] });
}

module.exports = { launchBrowser, ensureFonts, FONT_DIR };

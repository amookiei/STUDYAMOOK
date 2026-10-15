// POST /api/capture
// body: { url, supabase: { url, anonKey }, width?, maxHeight? }
// 헤드리스 Chromium 으로 페이지를 렌더링해 DOM 랜드마크를 추출하고, 스크롤하며 찍은 화면을 이어 붙여
// 전체 스크린샷을 만든 뒤 Supabase 스토리지(screenshots 버킷)에 올린다. (응답 크기 제한 때문에 base64 는 돌려주지 않는다)
const crypto = require('crypto');
const sharp = require('sharp');
const { readJson, send, fail, requireAccess, methodNotAllowed } = require('./_lib/http');
const { launchBrowser } = require('./_lib/browser');
const { createServerClient, uploadScreenshot } = require('./_lib/supabase');
const {
  USER_AGENT, EXTRACT_SCRIPT, HIDE_FIXED_SCRIPT, RESTORE_FIXED_SCRIPT, HIDE_SCROLLBAR_CSS, normalizeUrl, assertPublicUrl,
} = require('../shared/extract');

const VIEWPORT_HEIGHT = 900;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clampInt = (v, min, max, fallback) => { const n = parseInt(v, 10); return Number.isNaN(n) ? fallback : Math.min(max, Math.max(min, n)); };

async function autoScroll(page, pageHeight, viewportHeight) {
  const step = Math.max(400, Math.floor(viewportHeight * 0.8));
  const maxSteps = Math.min(40, Math.ceil(pageHeight / step));
  for (let i = 1; i <= maxSteps; i += 1) {
    await page.evaluate((y) => window.scrollTo(0, y), i * step);
    await sleep(100);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(250);
}

// 뷰포트 단위로 스크롤하며 찍은 PNG 들을 sharp 로 이어 붙인다 (Electron 버전과 같은 방식).
async function captureFullPage(page, width, height, viewportHeight) {
  const parts = [];
  let captured = 0;
  let chunkIndex = 0;
  try {
    while (captured < height) {
      await page.evaluate((y) => window.scrollTo(0, y), captured);
      if (chunkIndex === 1) await page.evaluate(HIDE_FIXED_SCRIPT).catch(() => {});
      await sleep(chunkIndex === 0 ? 250 : 180);
      const actualY = await page.evaluate(() => window.scrollY);
      const png = await page.screenshot({ type: 'png' });
      const meta = await sharp(png).metadata();
      const skipRows = Math.max(0, Math.round(captured - actualY));
      const wantRows = Math.min(meta.height - skipRows, Math.round(height - captured));
      if (wantRows <= 0) break;
      const piece = await sharp(png).extract({ left: 0, top: skipRows, width: meta.width, height: wantRows }).png().toBuffer();
      parts.push({ buffer: piece, top: Math.round(captured), height: wantRows, width: meta.width });
      captured += wantRows;
      chunkIndex += 1;
      if (actualY + viewportHeight >= height && captured < height) break;
    }
  } finally {
    await page.evaluate(RESTORE_FIXED_SCRIPT).catch(() => {});
  }
  if (!parts.length) throw new Error('스크린샷을 찍지 못했습니다.');
  const imageWidth = parts[0].width;
  const totalHeight = parts.reduce((sum, p) => sum + p.height, 0);
  const stitched = await sharp({ create: { width: imageWidth, height: totalHeight, channels: 3, background: '#ffffff' } })
    .composite(parts.map((p) => ({ input: p.buffer, top: p.top, left: 0 })))
    .png({ compressionLevel: 8 })
    .toBuffer();
  return { buffer: stitched, width: imageWidth, height: totalHeight };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  if (!requireAccess(req, res)) return undefined;

  const body = await readJson(req);
  let url;
  try {
    url = normalizeUrl(body.url);
    // 로컬 개발(UX_ALLOW_PRIVATE_URL=1)에서만 내부 주소 허용
    if (process.env.UX_ALLOW_PRIVATE_URL !== '1') assertPublicUrl(url);
  } catch (err) {
    return fail(res, 400, err.message);
  }
  let supabase;
  try {
    // 요청에 없으면 서버 환경 변수(SUPABASE_URL / SUPABASE_ANON_KEY 또는 VITE_ 접두사)를 쓴다.
    const fromEnv = {
      url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
      anonKey: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '',
    };
    const config = body.supabase && body.supabase.url && body.supabase.anonKey ? body.supabase : fromEnv;
    supabase = createServerClient(config);
  } catch (err) {
    return fail(res, 400, `${err.message} 웹에서 분석하려면 설정에서 Supabase 를 먼저 연결해 주세요.`);
  }
  const width = clampInt(body.width, 800, 1920, 1440);
  const maxHeight = clampInt(body.maxHeight, 2000, 12000, 8000);

  const startedAt = Date.now();
  let browser;
  try {
    browser = await launchBrowser();
    const context = await browser.newContext({ viewport: { width, height: VIEWPORT_HEIGHT }, userAgent: USER_AGENT, deviceScaleFactor: 1, locale: 'ko-KR' });
    const page = await context.newPage();
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    } catch (err) {
      const msg = /timeout/i.test(err.message) ? '페이지 로딩이 30초 안에 끝나지 않았습니다.' : `페이지를 불러오지 못했습니다 (${err.message.split('\n')[0]}).`;
      return fail(res, 502, msg);
    }
    await page.addStyleTag({ content: HIDE_SCROLLBAR_CSS }).catch(() => {});
    await sleep(1000);

    const first = await page.evaluate(EXTRACT_SCRIPT);
    await autoScroll(page, first.page.height, first.viewport.height);
    const landmarks = await page.evaluate(EXTRACT_SCRIPT);
    const pageHeight = Math.min(maxHeight, Math.max(600, landmarks.page.height));
    landmarks.page.capturedHeight = pageHeight;
    landmarks.page.truncated = landmarks.page.height > maxHeight;

    const shot = await captureFullPage(page, width, pageHeight, landmarks.viewport.height || VIEWPORT_HEIGHT);
    await context.close();

    const id = crypto.randomUUID();
    const uploaded = await uploadScreenshot(supabase, id, shot.buffer);

    return send(res, 200, {
      ok: true,
      id,
      url: landmarks.url || url,
      requestedUrl: url,
      title: landmarks.title || url,
      capturedAt: new Date().toISOString(),
      landmarks,
      screenshot: {
        mimeType: 'image/png',
        width: shot.width,
        height: shot.height,
        cssWidth: width,
        cssHeight: pageHeight,
        path: uploaded.path,
        url: uploaded.url,
        bytes: shot.buffer.length,
      },
      timing: { ms: Date.now() - startedAt },
    });
  } catch (err) {
    console.error('[api/capture]', err);
    return fail(res, 500, `캡처 중 오류가 났습니다: ${err.message}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
};

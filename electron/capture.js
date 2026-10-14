// 숨김 BrowserWindow로 URL을 렌더링한 뒤
//  1) DOM 랜드마크 구조(header/nav/main/aside/footer/section …)를 추출하고
//  2) 전체 페이지 스크린샷(PNG, base64)을 찍는다.
const { BrowserWindow, session, nativeImage } = require('electron');

const CAPTURE_PARTITION = 'persist:ux-capture';
const VIEWPORT_HEIGHT = 900;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

// 페이지 안에서 실행되는 스크립트. 직렬화 가능한 순수 JSON만 반환해야 한다.
const EXTRACT_SCRIPT = String.raw`
(() => {
  const LANDMARK_SELECTOR = [
    'header', 'nav', 'main', 'aside', 'footer', 'section', 'article', 'form', 'dialog',
    '[role="banner"]', '[role="navigation"]', '[role="main"]', '[role="complementary"]',
    '[role="contentinfo"]', '[role="search"]', '[role="form"]', '[role="region"]', '[role="dialog"]',
  ].join(',');

  const MAX_NODES = 80;
  const docEl = document.documentElement;
  const body = document.body;
  const pageWidth = Math.max(docEl.clientWidth, body ? body.clientWidth : 0, window.innerWidth);
  const pageHeight = Math.max(
    docEl.scrollHeight, docEl.offsetHeight, docEl.clientHeight,
    body ? body.scrollHeight : 0, body ? body.offsetHeight : 0,
  );

  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const roleOf = (el) => {
    const explicit = el.getAttribute('role');
    if (explicit) return explicit;
    const tag = el.tagName.toLowerCase();
    const implicit = { header: 'banner', nav: 'navigation', main: 'main', aside: 'complementary', footer: 'contentinfo', form: 'form', section: 'region', article: 'article', dialog: 'dialog' };
    return implicit[tag] || tag;
  };
  const labelOf = (el) => {
    const aria = el.getAttribute('aria-label');
    if (aria) return clean(aria);
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const target = document.getElementById(labelledBy);
      if (target) return clean(target.textContent).slice(0, 80);
    }
    const heading = el.querySelector('h1,h2,h3,h4');
    if (heading) return clean(heading.textContent).slice(0, 80);
    return '';
  };
  const isVisible = (el, rect) => {
    if (rect.width < 8 || rect.height < 8) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  };

  const all = Array.from(document.querySelectorAll(LANDMARK_SELECTOR));
  const chosen = [];
  for (const el of all) {
    const rect = el.getBoundingClientRect();
    if (!isVisible(el, rect)) continue;
    chosen.push({ el, rect });
    if (chosen.length >= MAX_NODES) break;
  }

  const depthOf = (el) => {
    let d = 0; let p = el.parentElement;
    while (p) { if (p.matches && p.matches(LANDMARK_SELECTOR)) d += 1; p = p.parentElement; }
    return d;
  };

  const landmarks = chosen.map(({ el, rect }, i) => {
    const top = rect.top + window.scrollY;
    const left = rect.left + window.scrollX;
    const headings = Array.from(el.querySelectorAll('h1,h2,h3')).slice(0, 6).map((h) => ({ level: h.tagName.toLowerCase(), text: clean(h.textContent).slice(0, 100) }));
    const links = Array.from(el.querySelectorAll('a[href]')).slice(0, 25).map((a) => clean(a.textContent).slice(0, 40)).filter(Boolean);
    const buttons = Array.from(el.querySelectorAll('button,[role="button"],input[type="submit"]')).slice(0, 15).map((b) => clean(b.textContent || b.value || b.getAttribute('aria-label')).slice(0, 40)).filter(Boolean);
    return {
      id: 'lm-' + (i + 1),
      tag: el.tagName.toLowerCase(),
      role: roleOf(el),
      label: labelOf(el),
      domId: el.id || '',
      className: clean(typeof el.className === 'string' ? el.className : '').slice(0, 80),
      depth: depthOf(el),
      box: {
        x: Math.round(left), y: Math.round(top), width: Math.round(rect.width), height: Math.round(rect.height),
        xPct: +(100 * left / pageWidth).toFixed(2), yPct: +(100 * top / pageHeight).toFixed(2),
        wPct: +(100 * rect.width / pageWidth).toFixed(2), hPct: +(100 * rect.height / pageHeight).toFixed(2),
      },
      headings,
      links,
      buttons,
      counts: {
        links: el.querySelectorAll('a[href]').length,
        buttons: el.querySelectorAll('button,[role="button"]').length,
        images: el.querySelectorAll('img,svg,video').length,
        inputs: el.querySelectorAll('input,textarea,select').length,
      },
      textSnippet: clean(el.textContent).slice(0, 240),
    };
  });

  const meta = (name) => {
    const el = document.querySelector('meta[name="' + name + '"],meta[property="' + name + '"]');
    return el ? clean(el.getAttribute('content')) : '';
  };
  const headingOutline = Array.from(document.querySelectorAll('h1,h2,h3')).slice(0, 40).map((h) => ({ level: h.tagName.toLowerCase(), text: clean(h.textContent).slice(0, 100) }));
  const fontFamilies = Array.from(new Set(['body', 'h1', 'h2', 'p', 'a', 'button'].map((sel) => { const el = document.querySelector(sel); return el ? window.getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim() : ''; }).filter(Boolean)));
  const bodyStyle = body ? window.getComputedStyle(body) : null;

  return {
    url: location.href,
    title: clean(document.title),
    description: meta('description') || meta('og:description'),
    lang: docEl.getAttribute('lang') || '',
    viewport: { width: window.innerWidth, height: window.innerHeight },
    page: { width: Math.round(pageWidth), height: Math.round(pageHeight) },
    headingOutline,
    style: {
      fontFamilies,
      bodyBackground: bodyStyle ? bodyStyle.backgroundColor : '',
      bodyColor: bodyStyle ? bodyStyle.color : '',
    },
    landmarks,
    totalLandmarks: all.length,
  };
})()
`;

function normalizeUrl(input) {
  const trimmed = String(input || '').trim();
  if (!trimmed) throw new Error('URL을 입력해 주세요.');
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new Error('올바른 URL 형식이 아닙니다.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('http/https URL만 지원합니다.');
  return parsed.toString();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function autoScroll(webContents, pageHeight, viewportHeight) {
  // lazy-load 이미지가 로드되도록 천천히 아래까지 스크롤한 뒤 맨 위로 되돌린다.
  const step = Math.max(400, Math.floor(viewportHeight * 0.8));
  const maxSteps = Math.min(40, Math.ceil(pageHeight / step));
  for (let i = 1; i <= maxSteps; i += 1) {
    await webContents.executeJavaScript(`window.scrollTo(0, ${i * step});`, true);
    await sleep(120);
  }
  await webContents.executeJavaScript('window.scrollTo(0, 0);', true);
  await sleep(300);
}

// 전체 페이지 스크린샷.
// 숨김 창에서는 CDP Page.captureScreenshot 이 프레임을 만들지 못해 멈추는 경우가 있고,
// 창을 페이지 높이만큼 키우면 100vh 기반 레이아웃이 함께 늘어나 버린다.
// 그래서 뷰포트 높이는 그대로 둔 채 스크롤하며 여러 장을 찍고 비트맵을 이어 붙인다.
// (position:fixed 요소는 첫 장 이후 숨겨서 헤더가 반복되지 않게 한다.)
const HIDE_FIXED_SCRIPT = String.raw`
(() => {
  let count = 0;
  for (const el of document.body.querySelectorAll('*')) {
    if (el.dataset.uxFixed) continue;
    const position = window.getComputedStyle(el).position;
    if (position === 'fixed') {
      // 화면에 고정된 요소(헤더, 배너, 챗봇 버튼)는 첫 장에 이미 찍혔으니 숨긴다.
      el.dataset.uxFixed = 'hidden';
      el.style.setProperty('visibility', 'hidden', 'important');
      count += 1;
    } else if (position === 'sticky') {
      // sticky 요소는 원래 자리(일반 흐름)로 돌려놓아 장마다 반복되지 않게 한다.
      el.dataset.uxFixed = 'sticky';
      el.style.setProperty('position', 'relative', 'important');
      count += 1;
    }
  }
  return count;
})()
`;
const RESTORE_FIXED_SCRIPT = String.raw`
(() => {
  for (const el of document.querySelectorAll('[data-ux-fixed]')) {
    if (el.dataset.uxFixed === 'hidden') el.style.removeProperty('visibility');
    else el.style.removeProperty('position');
    delete el.dataset.uxFixed;
  }
})()
`;
// 캡처 중 스크롤바가 찍히지 않도록 숨긴다. (레이아웃 폭에도 영향을 주므로 랜드마크 추출 전에 넣는다)
const HIDE_SCROLLBAR_CSS = 'html { scrollbar-width: none !important; } html::-webkit-scrollbar, body::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }';

async function captureFullPage(win, width, height, viewportHeight) {
  const webContents = win.webContents;
  const parts = [];
  let imageWidth = 0;
  let scale = 1;
  let captured = 0; // 지금까지 모은 CSS px 높이
  let chunkIndex = 0;
  try {
    while (captured < height) {
      await webContents.executeJavaScript(`window.scrollTo(0, ${captured});`, true);
      if (chunkIndex === 1) await webContents.executeJavaScript(HIDE_FIXED_SCRIPT, true).catch(() => {});
      await sleep(chunkIndex === 0 ? 300 : 220);
      const actualY = await webContents.executeJavaScript('window.scrollY', true);
      const image = await webContents.capturePage();
      const size = image.getSize();
      if (image.isEmpty() || size.height === 0) throw new Error('스크린샷을 찍지 못했습니다 (빈 이미지).');
      if (!imageWidth) { imageWidth = size.width; scale = size.width / width || 1; }
      if (size.width !== imageWidth) throw new Error('캡처 도중 창 크기가 바뀌었습니다.');
      const bitmap = image.toBitmap();
      const skipRows = Math.max(0, Math.round((captured - actualY) * scale)); // 바닥에 닿아 덜 스크롤된 만큼 건너뜀
      const wantRows = Math.min(size.height - skipRows, Math.round((height - captured) * scale));
      if (wantRows <= 0) break;
      parts.push(Buffer.from(bitmap.subarray(skipRows * imageWidth * 4, (skipRows + wantRows) * imageWidth * 4)));
      captured += wantRows / scale;
      chunkIndex += 1;
      if (actualY + viewportHeight >= height && captured < height) break; // 더 스크롤할 곳이 없음
    }
  } finally {
    await webContents.executeJavaScript(RESTORE_FIXED_SCRIPT, true).catch(() => {});
    await webContents.executeJavaScript('window.scrollTo(0, 0);', true).catch(() => {});
  }
  if (!parts.length) throw new Error('스크린샷을 찍지 못했습니다.');
  const buffer = Buffer.concat(parts);
  const totalRows = Math.floor(buffer.length / (imageWidth * 4));
  const stitched = nativeImage.createFromBitmap(buffer, { width: imageWidth, height: totalRows });
  return { base64: stitched.toPNG().toString('base64'), width: imageWidth, height: totalRows };
}

/**
 * @param {string} inputUrl
 * @param {{width?:number,maxHeight?:number,timeoutMs?:number,onProgress?:(msg:string)=>void}} options
 */
async function capturePage(inputUrl, options = {}) {
  const url = normalizeUrl(inputUrl);
  const width = Math.min(2560, Math.max(800, parseInt(options.width, 10) || 1440));
  const maxHeight = Math.min(30000, Math.max(2000, parseInt(options.maxHeight, 10) || 12000));
  const timeoutMs = options.timeoutMs || 45000;
  const progress = typeof options.onProgress === 'function' ? options.onProgress : () => {};

  const ses = session.fromPartition(CAPTURE_PARTITION);
  ses.setUserAgent(USER_AGENT);

  const win = new BrowserWindow({
    show: false,
    width,
    height: VIEWPORT_HEIGHT,
    webPreferences: {
      partition: CAPTURE_PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      images: true,
    },
  });
  win.webContents.setAudioMuted(true);
  // 캡처 창에서는 새 창/팝업을 열지 않는다.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  try {
    progress('페이지 로딩 중…');
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`페이지 로딩이 ${Math.round(timeoutMs / 1000)}초 안에 끝나지 않았습니다.`)), timeoutMs);
      win.webContents.once('did-finish-load', () => { clearTimeout(timer); resolve(); });
      win.webContents.once('did-fail-load', (_e, code, desc, failingUrl, isMainFrame) => {
        if (!isMainFrame || code === -3) return; // -3: ABORTED (리다이렉트 등)
        clearTimeout(timer);
        reject(new Error(`페이지를 불러오지 못했습니다 (${desc || code}).`));
      });
      win.loadURL(url, { userAgent: USER_AGENT }).catch((err) => {
        clearTimeout(timer);
        const code = err && err.errno !== undefined ? ` (${err.code || err.errno})` : '';
        reject(new Error(`페이지를 불러오지 못했습니다${code}. 주소와 네트워크 연결을 확인해 주세요.`));
      });
    });

    await win.webContents.insertCSS(HIDE_SCROLLBAR_CSS).catch(() => {});
    // 웹폰트/애니메이션이 안정될 시간을 준다.
    await sleep(1200);

    // 화면이 작은 환경에서는 초기 창 폭이 화면 폭으로 잘릴 수 있어 콘텐츠 크기를 다시 고정한다.
    win.setContentSize(width, VIEWPORT_HEIGHT);
    await sleep(200);

    progress('DOM 구조 추출 중…');
    const first = await win.webContents.executeJavaScript(EXTRACT_SCRIPT, true);
    await autoScroll(win.webContents, first.page.height, first.viewport.height);
    const landmarks = await win.webContents.executeJavaScript(EXTRACT_SCRIPT, true);

    const pageHeight = Math.min(maxHeight, Math.max(600, landmarks.page.height));
    landmarks.page.capturedHeight = pageHeight;
    landmarks.page.truncated = landmarks.page.height > maxHeight;

    progress('전체 스크린샷 촬영 중…');
    const shot = await captureFullPage(win, width, pageHeight, landmarks.viewport.height || VIEWPORT_HEIGHT);

    return {
      url: landmarks.url || url,
      requestedUrl: url,
      title: landmarks.title || url,
      capturedAt: new Date().toISOString(),
      landmarks,
      screenshot: {
        mimeType: 'image/png',
        base64: shot.base64,
        width: shot.width,   // 실제 이미지 픽셀 (HiDPI 면 CSS px 보다 큼)
        height: shot.height,
        cssWidth: width,
        cssHeight: pageHeight,
      },
    };
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

module.exports = { capturePage, normalizeUrl, EXTRACT_SCRIPT };

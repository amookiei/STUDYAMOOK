// 숨김 BrowserWindow로 URL을 렌더링한 뒤
//  1) DOM 랜드마크 구조(header/nav/main/aside/footer/section …)를 추출하고
//  2) 전체 페이지 스크린샷(PNG, base64)을 찍는다.
const { BrowserWindow, session, nativeImage } = require('electron');
const {
  USER_AGENT, EXTRACT_SCRIPT, HIDE_FIXED_SCRIPT, RESTORE_FIXED_SCRIPT, HIDE_SCROLLBAR_CSS, normalizeUrl,
} = require('../shared/extract');

const CAPTURE_PARTITION = 'persist:ux-capture';
const VIEWPORT_HEIGHT = 900;

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

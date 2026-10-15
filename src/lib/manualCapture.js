// 사용자가 직접 올린 전체 페이지 스크린샷을 분석용 캡처 객체로 바꾼다.
// (봇 차단 등으로 자동 캡처가 안 되는 페이지용)
const MAX_FILE_BYTES = 30 * 1024 * 1024;
const MAX_WIDTH = 2560;
const MAX_HEIGHT = 16000;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 읽을 수 없습니다. PNG, JPG, WebP 파일을 올려 주세요.')); };
    img.src = url;
  });
}

// 이미지를 PNG 로 정규화하고(필요하면 축소) Blob + base64 를 돌려준다.
export async function prepareManualScreenshot(file) {
  if (!file) throw new Error('파일을 선택해 주세요.');
  if (!/^image\/(png|jpeg|jpg|webp)$/i.test(file.type)) throw new Error('PNG, JPG, WebP 이미지만 올릴 수 있습니다.');
  if (file.size > MAX_FILE_BYTES) throw new Error('이미지가 너무 큽니다 (최대 30MB).');

  const img = await loadImage(file);
  const scale = Math.min(1, MAX_WIDTH / img.naturalWidth, MAX_HEIGHT / img.naturalHeight);
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height); // 투명 배경은 흰색으로
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('이미지 변환에 실패했습니다.'))), 'image/png'));
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('이미지 변환에 실패했습니다.'));
    reader.readAsDataURL(blob);
  });
  return { blob, base64, width, height, scaled: scale < 1, originalWidth: img.naturalWidth, originalHeight: img.naturalHeight };
}

// 분석 파이프라인이 기대하는 capture 객체 (DOM 랜드마크 없음)
export function buildManualCapture({ url, file, image, screenshot }) {
  const title = (() => {
    try { return url ? new URL(url).hostname.replace(/^www\./, '') : ''; } catch { return ''; }
  })() || file.name.replace(/\.[a-z0-9]+$/i, '') || '직접 올린 스크린샷';
  return {
    url: url || '',
    requestedUrl: url || '',
    title,
    capturedAt: new Date().toISOString(),
    manual: true,
    landmarks: {
      url: url || '',
      title,
      description: '',
      lang: '',
      viewport: { width: image.width, height: Math.min(image.height, 900) },
      page: { width: image.width, height: image.height, capturedHeight: image.height, truncated: false, manual: true },
      headingOutline: [],
      style: {},
      landmarks: [],
      totalLandmarks: 0,
    },
    screenshot: {
      mimeType: 'image/png',
      width: image.width,
      height: image.height,
      cssWidth: image.width,
      cssHeight: image.height,
      ...screenshot, // { base64 } (데스크톱) 또는 { path, url } (웹: 서버가 내려받음)
    },
  };
}

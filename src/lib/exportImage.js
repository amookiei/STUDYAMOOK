// 스크린샷 + (AI 블록) + 내 도형을 캔버스에 합성해 PNG Blob 으로 만든다.
import { styleOf } from './blockTypes';

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('스크린샷 이미지를 불러오지 못했습니다. (CORS 또는 네트워크)'));
    img.src = src;
  });
}

function hexA(hex, alpha) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return `rgba(134,142,150,${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function label(ctx, text, x, y, font, color) {
  ctx.font = `600 ${font}px Pretendard, "Noto Sans KR", sans-serif`;
  const w = ctx.measureText(text).width;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(x, y, w + 10, font + 8);
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  ctx.fillText(text, x + 5, y + 4);
}

export async function renderStudyImage({
  screenshotUrl, width, height, shapes = [], pins = [], aiBlocks = [],
  screenshotOpacity = 1, maxWidth = 1600,
}) {
  const baseW = width || 1200;
  const baseH = height || Math.round(baseW * 2);
  const scale = Math.min(1, maxWidth / baseW);
  const W = Math.round(baseW * scale);
  const H = Math.round(baseH * scale);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  if (screenshotUrl && screenshotOpacity > 0) {
    const img = await loadImage(screenshotUrl);
    ctx.globalAlpha = screenshotOpacity;
    ctx.drawImage(img, 0, 0, W, H);
    ctx.globalAlpha = 1;
  }
  const px = (v) => (v / 100) * W;
  const py = (v) => (v / 100) * H;
  const font = Math.max(11, Math.round(W / 85));

  for (const b of aiBlocks) {
    const c = styleOf(b.type).color;
    ctx.fillStyle = hexA(c, 0.22);
    ctx.fillRect(px(b.x), py(b.y), px(b.w), py(b.h));
    ctx.strokeStyle = c;
    ctx.lineWidth = 2;
    ctx.setLineDash(b.source === 'estimate' ? [8, 6] : []);
    ctx.strokeRect(px(b.x), py(b.y), px(b.w), py(b.h));
    ctx.setLineDash([]);
    label(ctx, `AI · ${b.label}`, px(b.x) + 4, py(b.y) + 4, font, c);
  }

  for (const s of shapes) {
    if (s.kind === 'block') {
      const c = styleOf(s.type).color;
      ctx.fillStyle = hexA(c, aiBlocks.length ? 0.08 : 0.16);
      ctx.fillRect(px(s.x), py(s.y), px(s.w), py(s.h));
      ctx.strokeStyle = '#1b1f24';
      ctx.lineWidth = 3;
      ctx.strokeRect(px(s.x), py(s.y), px(s.w), py(s.h));
      const y = aiBlocks.length ? py(s.y) + py(s.h) - font - 12 : py(s.y) + 4;
      label(ctx, `${s.role === 'component' ? '[컴포넌트] ' : ''}${s.label || ''}${s.content ? ` — ${s.content}` : ''}`.slice(0, 80), px(s.x) + 4, Math.max(py(s.y) + 4, y), font, '#1b1f24');
    } else if (s.kind === 'text') {
      ctx.font = `500 ${font}px Pretendard, "Noto Sans KR", sans-serif`;
      ctx.fillStyle = '#c92a2a';
      ctx.textBaseline = 'top';
      const lines = String(s.text || '').split('\n');
      lines.forEach((t, i) => ctx.fillText(t, px(s.x) + 2, py(s.y) + 2 + i * (font + 4)));
    } else if (s.kind === 'pen' && s.points && s.points.length > 1) {
      ctx.strokeStyle = s.color || '#e03131';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      s.points.forEach(([x, y], i) => (i ? ctx.lineTo(px(x), py(y)) : ctx.moveTo(px(x), py(y))));
      ctx.stroke();
    }
  }

  pins.forEach((pin, i) => {
    const r = Math.max(10, font);
    ctx.beginPath();
    ctx.arc(px(pin.x), py(pin.y), r, 0, Math.PI * 2);
    ctx.fillStyle = '#e03131';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${Math.round(r * 1.1)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), px(pin.x), py(pin.y) + 1);
    ctx.textAlign = 'start';
  });

  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG 생성에 실패했습니다.'))), 'image/png');
    } catch (err) {
      reject(new Error(`PNG 생성에 실패했습니다: ${err.message}`));
    }
  });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const safeFilename = (s) => String(s || 'study').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'study';

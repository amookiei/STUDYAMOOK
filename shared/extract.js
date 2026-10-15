// 캡처에 쓰이는 브라우저 측 스크립트와 URL 검사.
// Electron(electron/capture.js)과 Vercel 서버리스(api/capture.js)가 함께 쓰므로 Node 내장 모듈만 사용한다.
const net = require('net');

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


// 서버(Vercel)에서 캡처할 때 내부망/로컬 주소로의 요청을 막는다 (SSRF 방지).
function assertPublicUrl(url) {
  const { hostname } = new URL(url);
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('로컬/내부 주소는 캡처할 수 없습니다.');
  }
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error('사설 IP 주소는 캡처할 수 없습니다.');
  }
  return url;
}

function isPrivateIp(ip) {
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    return lower === '::1' || lower === '::' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80') || lower.startsWith('::ffff:');
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

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

module.exports = {
  USER_AGENT,
  EXTRACT_SCRIPT,
  HIDE_FIXED_SCRIPT,
  RESTORE_FIXED_SCRIPT,
  HIDE_SCROLLBAR_CSS,
  normalizeUrl,
  assertPublicUrl,
  isPrivateIp,
};

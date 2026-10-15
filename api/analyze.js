// POST /api/analyze
// body: { capture: { url, title, landmarks, screenshot: { url, width, height } }, model? }
// 캡처 결과의 스크린샷을 내려받아 타일로 자르고, Anthropic API(서버 환경 변수 ANTHROPIC_API_KEY)로 분석한다.
const { readJson, send, fail, requireAccess, methodNotAllowed } = require('./_lib/http');
const { tileWithSharp } = require('./_lib/tiles');
const analyzer = require('../electron/analyzer');

const MAX_SCREENSHOT_BYTES = 40 * 1024 * 1024;

async function downloadScreenshot(url) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('스크린샷 URL 이 올바르지 않습니다.'); }
  // 로컬 개발(UX_ALLOW_HTTP_SCREENSHOT=1)에서만 http 허용
  if (parsed.protocol !== 'https:' && !(process.env.UX_ALLOW_HTTP_SCREENSHOT === '1' && parsed.protocol === 'http:')) {
    throw new Error('스크린샷 URL 은 https 여야 합니다.');
  }
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`스크린샷을 내려받지 못했습니다 (${resp.status}). Supabase screenshots 버킷이 public 인지 확인해 주세요.`);
  const buf = Buffer.from(await resp.arrayBuffer());
  if (buf.length > MAX_SCREENSHOT_BYTES) throw new Error('스크린샷이 너무 큽니다.');
  return buf;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  if (!requireAccess(req, res)) return undefined;

  if (!analyzer.hasDefaultCredentials()) {
    return fail(res, 503, '서버에 ANTHROPIC_API_KEY 환경 변수가 설정되지 않았습니다. Vercel 프로젝트 설정 → Environment Variables 에 추가한 뒤 다시 배포해 주세요.');
  }

  const body = await readJson(req);
  const capture = body.capture;
  if (!capture || !capture.screenshot || !capture.screenshot.url) return fail(res, 400, '분석할 캡처 데이터가 없습니다.');
  const model = analyzer.MODEL_OPTIONS.some((m) => m.id === body.model) ? body.model : analyzer.DEFAULT_MODEL;

  try {
    const png = await downloadScreenshot(capture.screenshot.url);
    const tiles = await tileWithSharp(png);
    const result = await analyzer.analyzeReference(
      { apiKey: '', model, capture: { ...capture, screenshot: { ...capture.screenshot, base64: '' } } },
      { tiles },
    );
    return send(res, 200, { ok: true, ...result });
  } catch (err) {
    console.error('[api/analyze]', err);
    return fail(res, 500, err.message || String(err));
  }
};

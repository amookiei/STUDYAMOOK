// Vercel Node 서버리스 함수 공용 헬퍼 (요청 파싱, 응답, 입장 코드 검사)
const crypto = require('crypto');

const CODE_HEADER = 'x-studio-code';
const CODE_ENV = 'STUDIO_CODE';

async function readJson(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
    return req.body;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function fail(res, status, message, extra) {
  send(res, status, { ok: false, error: message, ...(extra || {}) });
}

function isCodeConfigured() {
  return Boolean((process.env[CODE_ENV] || '').trim());
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a)); const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// 입장 코드 검사. 통과하면 true, 아니면 응답을 보내고 false.
function requireAccess(req, res) {
  const expected = (process.env[CODE_ENV] || '').trim();
  if (!expected) {
    fail(res, 503, `서버에 입장 코드(${CODE_ENV} 환경 변수)가 설정되지 않았습니다. Vercel 프로젝트 설정에서 추가한 뒤 다시 배포해 주세요.`, { code: 'code_not_configured' });
    return false;
  }
  const given = String(req.headers[CODE_HEADER] || '').trim();
  if (!given || !safeEqual(given, expected)) {
    fail(res, 401, '입장 코드가 올바르지 않습니다.', { code: 'invalid_code' });
    return false;
  }
  return true;
}

function methodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed.join(', '));
  fail(res, 405, `허용되지 않은 메서드입니다 (${allowed.join(', ')} 만 가능)`);
}

module.exports = { readJson, send, fail, requireAccess, isCodeConfigured, methodNotAllowed, CODE_HEADER, CODE_ENV };

// Vercel Node 서버리스 함수 공용 헬퍼 (요청 파싱, 응답, 접근 비밀번호 검사)
const crypto = require('crypto');

const PASSWORD_HEADER = 'x-app-password';

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

function isPasswordConfigured() {
  return Boolean((process.env.APP_ACCESS_PASSWORD || '').trim());
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a)); const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// 접근 비밀번호 검사. 통과하면 true, 아니면 응답을 보내고 false.
function requireAccess(req, res) {
  const expected = (process.env.APP_ACCESS_PASSWORD || '').trim();
  if (!expected) {
    fail(res, 503, '서버에 접근 비밀번호(APP_ACCESS_PASSWORD 환경 변수)가 설정되지 않았습니다. Vercel 프로젝트 설정에서 추가한 뒤 다시 배포해 주세요.');
    return false;
  }
  const given = String(req.headers[PASSWORD_HEADER] || '').trim();
  if (!given || !safeEqual(given, expected)) {
    fail(res, 401, '접근 비밀번호가 올바르지 않습니다. 설정(⚙)에서 비밀번호를 확인해 주세요.');
    return false;
  }
  return true;
}

function methodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed.join(', '));
  fail(res, 405, `허용되지 않은 메서드입니다 (${allowed.join(', ')} 만 가능)`);
}

module.exports = { readJson, send, fail, requireAccess, isPasswordConfigured, methodNotAllowed, PASSWORD_HEADER };

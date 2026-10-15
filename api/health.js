// GET  /api/health → 서버 설정 상태(비밀 값 없음)와 모델 목록
// POST /api/health (입장 코드 필요)
//   { action: 'verify' } → 입장 코드 확인만
//   { model }            → Anthropic 연결 테스트
const { send, requireAccess, isCodeConfigured, methodNotAllowed, readJson } = require('./_lib/http');
const analyzer = require('../electron/analyzer');

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    return send(res, 200, {
      ok: true,
      version: process.env.VERCEL_GIT_COMMIT_SHA ? process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7) : 'web',
      platform: 'web',
      defaultModel: analyzer.DEFAULT_MODEL,
      modelOptions: analyzer.MODEL_OPTIONS,
      server: {
        anthropicConfigured: analyzer.hasDefaultCredentials(),
        codeConfigured: isCodeConfigured(),
      },
    });
  }
  if (req.method === 'POST') {
    if (!requireAccess(req, res)) return undefined;
    const body = await readJson(req);
    if (body.action === 'verify') return send(res, 200, { ok: true, verified: true });
    try {
      const info = await analyzer.testConnection({ apiKey: '', model: body.model || analyzer.DEFAULT_MODEL });
      return send(res, 200, { ok: true, ...info });
    } catch (err) {
      return send(res, 200, { ok: false, error: err.message });
    }
  }
  return methodNotAllowed(res, ['GET', 'POST']);
};

// preload(contextBridge)로 노출된 window.uxStudio 를 감싼다.
// Electron 밖(Vercel 웹 배포 등)에서는 "웹 모드"로 동작한다:
//  - 설정(Supabase 정보, 접근 비밀번호, 모델)은 localStorage 에 저장
//  - 캡처/분석은 Vercel 서버리스 함수(/api/capture, /api/analyze)를 호출. Anthropic 키는 서버 환경 변수에만 있다.
const WEB_SETTINGS_KEY = 'ux-reference-studio.settings';
const PASSWORD_HEADER = 'x-app-password';

function readWebSettings() {
  try {
    const raw = window.localStorage.getItem(WEB_SETTINGS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

const progressListeners = new Set();
const emitProgress = (payload) => { for (const fn of progressListeners) fn(payload); };

async function callApi(path, { method = 'GET', body, settings, timeoutMs = 320000 } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const password = (settings?.accessPassword || readWebSettings().accessPassword || '').trim();
  if (password) headers[PASSWORD_HEADER] = password;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let resp;
  try {
    resp = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('서버 응답이 너무 오래 걸려 중단했습니다. Vercel 함수 실행 시간 제한을 확인해 주세요.');
    throw new Error(`서버에 연결하지 못했습니다: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
  let data = null;
  try { data = await resp.json(); } catch { /* 본문 없음 */ }
  if (!resp.ok || (data && data.ok === false)) {
    throw new Error((data && data.error) || `서버 오류 (${resp.status})`);
  }
  return data;
}

const fallback = {
  isElectron: false,
  getSettings: async () => readWebSettings(),
  saveSettings: async (next) => {
    const merged = { ...readWebSettings(), ...(next || {}) };
    // 웹에서는 Anthropic 키를 브라우저에 두지 않는다 (서버 환경 변수 사용).
    delete merged.anthropicApiKey;
    try { window.localStorage.setItem(WEB_SETTINGS_KEY, JSON.stringify(merged)); } catch { /* private mode 등 */ }
    return merged;
  },
  testAnthropic: async ({ model } = {}) => {
    const data = await callApi('/api/health', { method: 'POST', body: { model }, timeoutMs: 30000 });
    if (!data.ok) throw new Error(data.error || '연결 실패');
    return data;
  },
  capturePage: async (url, options = {}) => {
    const settings = readWebSettings();
    if (!settings.supabaseUrl || !settings.supabaseAnonKey) {
      throw new Error('웹에서 분석하려면 설정(⚙)에서 Supabase URL 과 anon key 를 먼저 입력해 주세요. 스크린샷이 Supabase 스토리지에 저장됩니다.');
    }
    emitProgress({ stage: 'capture', message: '서버에서 페이지를 렌더링하고 스크린샷을 찍는 중… (10~40초)' });
    const data = await callApi('/api/capture', {
      method: 'POST',
      body: {
        url,
        supabase: { url: settings.supabaseUrl, anonKey: settings.supabaseAnonKey },
        width: options.width || settings.captureWidth,
        maxHeight: options.maxHeight || settings.captureMaxHeight,
      },
      settings,
      timeoutMs: 150000,
    });
    const { ok, ...capture } = data;
    return capture;
  },
  analyzeReference: async ({ capture, model } = {}) => {
    const settings = readWebSettings();
    emitProgress({ stage: 'analyze', message: `Claude(${model || settings.anthropicModel || '기본 모델'})가 페이지를 분석 중… 1~3분 정도 걸릴 수 있습니다.` });
    const data = await callApi('/api/analyze', { method: 'POST', body: { capture, model: model || settings.anthropicModel }, settings });
    return { analysis: data.analysis, meta: data.meta };
  },
  cancelAnalysis: async () => false,
  onProgress: (callback) => {
    progressListeners.add(callback);
    return () => progressListeners.delete(callback);
  },
  openExternal: async (url) => { window.open(url, '_blank', 'noopener'); return true; },
  getAppInfo: async () => {
    try {
      const data = await callApi('/api/health', { timeoutMs: 15000 });
      return { ...data, platform: 'web' };
    } catch (err) {
      return { version: 'web', platform: 'web', modelOptions: [], defaultModel: '', server: null, serverError: err.message };
    }
  },
};

const bridge = typeof window !== 'undefined' && window.uxStudio
  ? { isElectron: true, ...window.uxStudio }
  : fallback;

export default bridge;

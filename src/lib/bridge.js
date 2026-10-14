// preload(contextBridge)로 노출된 window.uxStudio 를 감싼다.
// 브라우저에서만 열었을 때(Vercel 웹 배포 등 Electron 밖)는 "웹 뷰어 모드"로 동작한다:
//  - 설정은 localStorage 에 저장 (Supabase 연결용)
//  - 캡처/Claude 분석은 데스크톱 앱 전용이라 안내 메시지만 띄운다
const WEB_SETTINGS_KEY = 'ux-reference-studio.settings';
const WEB_ONLY_MESSAGE = '페이지 캡처와 Claude 분석은 데스크톱 앱(Electron)에서만 동작합니다. 웹에서는 저장된 레퍼런스를 보고 코멘트를 남길 수 있습니다.';

const desktopOnly = () => async () => { throw new Error(WEB_ONLY_MESSAGE); };

function readWebSettings() {
  try {
    const raw = window.localStorage.getItem(WEB_SETTINGS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

const fallback = {
  isElectron: false,
  webOnlyMessage: WEB_ONLY_MESSAGE,
  getSettings: async () => readWebSettings(),
  saveSettings: async (next) => {
    const merged = { ...readWebSettings(), ...(next || {}) };
    // 웹에서는 Anthropic 키를 쓸 곳이 없으므로 저장하지 않는다.
    delete merged.anthropicApiKey;
    try { window.localStorage.setItem(WEB_SETTINGS_KEY, JSON.stringify(merged)); } catch { /* private mode 등 */ }
    return merged;
  },
  testAnthropic: desktopOnly(),
  capturePage: desktopOnly(),
  analyzeReference: desktopOnly(),
  cancelAnalysis: async () => false,
  onProgress: () => () => {},
  openExternal: async (url) => { window.open(url, '_blank', 'noopener'); return true; },
  getAppInfo: async () => ({ version: 'web', platform: 'web', modelOptions: [], defaultModel: '' }),
};

const bridge = typeof window !== 'undefined' && window.uxStudio
  ? { isElectron: true, ...window.uxStudio }
  : fallback;

export default bridge;

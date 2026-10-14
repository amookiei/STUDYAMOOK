// preload(contextBridge)로 노출된 window.uxStudio 를 감싼다.
// 브라우저에서만 열었을 때(Electron 밖)도 앱이 깨지지 않도록 안내용 더미를 제공한다.
const missing = (name) => async () => {
  throw new Error(`Electron 환경이 아닙니다 (${name}). npm run dev 로 실행해 주세요.`);
};

const fallback = {
  isElectron: false,
  getSettings: async () => ({}),
  saveSettings: async (s) => s,
  testAnthropic: missing('testAnthropic'),
  capturePage: missing('capturePage'),
  analyzeReference: missing('analyzeReference'),
  cancelAnalysis: async () => false,
  onProgress: () => () => {},
  openExternal: async (url) => { window.open(url, '_blank', 'noopener'); return true; },
  getAppInfo: async () => ({ version: 'web', modelOptions: [], defaultModel: '' }),
};

const bridge = typeof window !== 'undefined' && window.uxStudio
  ? { isElectron: true, ...window.uxStudio }
  : fallback;

export default bridge;

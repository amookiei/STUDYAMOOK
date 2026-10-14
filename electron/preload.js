// 렌더러(React)에서 쓸 수 있는 안전한 API만 contextBridge로 노출한다.
// 채널 이름은 electron/main.js의 ipcMain.handle 이름과 1:1로 맞춰야 한다.
const { contextBridge, ipcRenderer } = require('electron');

const api = {
  // 설정
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  testAnthropic: (settings) => ipcRenderer.invoke('settings:test-anthropic', settings),

  // 캡처 → 분석
  capturePage: (url, options) => ipcRenderer.invoke('capture:page', { url, options }),
  analyzeReference: (payload) => ipcRenderer.invoke('analysis:run', payload),
  cancelAnalysis: () => ipcRenderer.invoke('analysis:cancel'),

  // 진행 상황(캡처 중, 분석 중 …) 구독
  onProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('progress', listener);
    return () => ipcRenderer.removeListener('progress', listener);
  },

  // 기타
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  getAppInfo: () => ipcRenderer.invoke('app:info'),
};

contextBridge.exposeInMainWorld('uxStudio', api);

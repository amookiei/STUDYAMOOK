// Electron 메인 프로세스: 창 생성, IPC 핸들러, 캡처/분석 파이프라인 연결
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const { loadSettings, saveSettings } = require('./settings');
const { capturePage } = require('./capture');
const analyzer = require('./analyzer');

const isDev = !app.isPackaged;
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || '';

let mainWindow = null;
let activeAnalysis = null; // { controller: AbortController }

function sendProgress(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('progress', payload);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1100,
    minHeight: 680,
    title: 'UX Reference Studio',
    backgroundColor: '#f5f6f8',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // 렌더러에서 외부 링크는 기본 브라우저로 연다.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow.webContents.getURL();
    if (url !== current && !url.startsWith(DEV_SERVER_URL || 'file://')) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });

  if (DEV_SERVER_URL) {
    mainWindow.loadURL(DEV_SERVER_URL);
    if (isDev && process.env.UX_OPEN_DEVTOOLS === '1') mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // vite build 결과물(dist/index.html). vite.config.js 의 base: './' 덕분에 file:// 에서도 에셋이 로드된다.
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[main] 렌더러 로드 실패 (${code} ${desc}) ${url}`);
    if (DEV_SERVER_URL) {
      dialog.showErrorBox('개발 서버 연결 실패', `${DEV_SERVER_URL} 에 연결하지 못했습니다.\n\`npm run dev\` 로 Vite 개발 서버가 떠 있는지 확인해 주세요.`);
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function registerIpc() {
  ipcMain.handle('settings:get', () => loadSettings());
  ipcMain.handle('settings:save', (_e, settings) => saveSettings(settings));
  ipcMain.handle('settings:test-anthropic', async (_e, { apiKey, model } = {}) => {
    const stored = loadSettings();
    return analyzer.testConnection({ apiKey: apiKey || stored.anthropicApiKey, model: model || stored.anthropicModel });
  });

  ipcMain.handle('capture:page', async (_e, { url, options } = {}) => {
    const settings = loadSettings();
    sendProgress({ stage: 'capture', message: '캡처 준비 중…' });
    return capturePage(url, {
      width: options?.width || settings.captureWidth,
      maxHeight: options?.maxHeight || settings.captureMaxHeight,
      onProgress: (message) => sendProgress({ stage: 'capture', message }),
    });
  });

  ipcMain.handle('analysis:run', async (_e, { capture, model } = {}) => {
    const settings = loadSettings();
    if (activeAnalysis) activeAnalysis.controller.abort();
    const controller = new AbortController();
    activeAnalysis = { controller };
    try {
      return await analyzer.analyzeReference(
        { apiKey: settings.anthropicApiKey, model: model || settings.anthropicModel, capture },
        { signal: controller.signal, onProgress: (message) => sendProgress({ stage: 'analyze', message }) },
      );
    } finally {
      if (activeAnalysis && activeAnalysis.controller === controller) activeAnalysis = null;
    }
  });

  ipcMain.handle('analysis:cancel', () => {
    if (activeAnalysis) { activeAnalysis.controller.abort(); activeAnalysis = null; return true; }
    return false;
  });

  ipcMain.handle('shell:open-external', async (_e, url) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) { await shell.openExternal(url); return true; }
    return false;
  });

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    platform: process.platform,
    userData: app.getPath('userData'),
    defaultModel: analyzer.DEFAULT_MODEL,
    modelOptions: analyzer.MODEL_OPTIONS,
  }));
}

// 단일 인스턴스
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
  });

  app.whenReady().then(() => {
    registerIpc();
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

process.on('unhandledRejection', (reason) => {
  console.error('[main] unhandledRejection', reason);
});

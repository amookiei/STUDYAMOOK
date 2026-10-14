// 설정(API 키, Supabase 정보 등)을 userData 폴더에 저장/로드한다.
// safeStorage(OS 키체인/DPAPI)를 쓸 수 있으면 민감한 값은 암호화해서 저장한다.
const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');

const SECRET_KEYS = ['anthropicApiKey', 'supabaseAnonKey'];

const DEFAULT_SETTINGS = {
  anthropicApiKey: '',
  anthropicModel: 'claude-opus-5-5',
  supabaseUrl: '',
  supabaseAnonKey: '',
  captureWidth: 1440,
  captureMaxHeight: 12000,
};

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function canEncrypt() {
  try {
    return safeStorage && safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function encrypt(value) {
  if (!value) return '';
  if (!canEncrypt()) return `plain:${value}`;
  return `enc:${safeStorage.encryptString(value).toString('base64')}`;
}

function decrypt(stored) {
  if (!stored) return '';
  if (stored.startsWith('plain:')) return stored.slice(6);
  if (stored.startsWith('enc:')) {
    if (!canEncrypt()) return '';
    try {
      return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'));
    } catch {
      return '';
    }
  }
  return stored;
}

function loadSettings() {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf8');
    const parsed = JSON.parse(raw);
    const merged = { ...DEFAULT_SETTINGS, ...parsed };
    for (const key of SECRET_KEYS) merged[key] = decrypt(parsed[key] || '');
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(next) {
  const current = loadSettings();
  const merged = { ...current, ...(next || {}) };
  const toWrite = { ...merged };
  for (const key of SECRET_KEYS) toWrite[key] = encrypt(String(merged[key] || '').trim());
  toWrite.anthropicModel = String(merged.anthropicModel || DEFAULT_SETTINGS.anthropicModel).trim();
  toWrite.supabaseUrl = String(merged.supabaseUrl || '').trim().replace(/\/+$/, '');
  toWrite.captureWidth = clampInt(merged.captureWidth, 800, 2560, DEFAULT_SETTINGS.captureWidth);
  toWrite.captureMaxHeight = clampInt(merged.captureMaxHeight, 2000, 30000, DEFAULT_SETTINGS.captureMaxHeight);
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(toWrite, null, 2), 'utf8');
  return loadSettings();
}

function clampInt(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

module.exports = { loadSettings, saveSettings, DEFAULT_SETTINGS, settingsPath };

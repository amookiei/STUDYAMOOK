// 빌드 시점 환경 변수로 미리 넣어 둔 설정 (Vite 는 VITE_ 접두사 변수만 번들에 포함한다).
//  - Vercel: Settings → Environment Variables 에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
//  - Windows 설치 파일: GitHub Actions 의 vars / secrets (.github/workflows/windows-installer.yml)
// 사용자가 설정 화면에 직접 입력한 값이 있으면 그 값이 우선한다.
// 어떤 형태로 붙여 넣어도 https://<ref>.supabase.co 로 맞춘다.
//  - 대시보드 주소(https://supabase.com/dashboard/project/<ref>/...)
//  - 경로가 붙은 주소(https://<ref>.supabase.co/rest/v1, /storage/v1/s3, 끝의 / 등)
//  - 프로젝트 ref 만 입력한 경우
export function normalizeSupabaseUrl(input) {
  let value = String(input || '').trim().replace(/^["']|["']$/g, '');
  if (!value) return '';
  const dashboard = /supabase\.com\/dashboard\/project\/([a-z0-9-]+)/i.exec(value);
  if (dashboard) return `https://${dashboard[1].toLowerCase()}.supabase.co`;
  if (/^[a-z0-9]{15,30}$/i.test(value)) return `https://${value.toLowerCase()}.supabase.co`;
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return value.replace(/\/+$/, '');
  }
}

export function normalizeSupabaseKey(input) {
  return String(input || '').trim().replace(/^["']|["']$/g, '').replace(/^Bearer\s+/i, '');
}

export const PRESET = {
  supabaseUrl: normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: normalizeSupabaseKey(import.meta.env.VITE_SUPABASE_ANON_KEY),
};

export const hasPresetSupabase = Boolean(PRESET.supabaseUrl && PRESET.supabaseAnonKey);

// 설정값과 프리셋을 합쳐 실제로 쓸 Supabase 접속 정보를 돌려준다.
export function resolveSupabase(settings) {
  const url = normalizeSupabaseUrl(settings?.supabaseUrl);
  const anonKey = normalizeSupabaseKey(settings?.supabaseAnonKey);
  if (url && anonKey) return { url, anonKey, source: 'settings' };
  if (hasPresetSupabase) return { url: PRESET.supabaseUrl, anonKey: PRESET.supabaseAnonKey, source: 'preset' };
  return null;
}

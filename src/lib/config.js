// 빌드 시점 환경 변수로 미리 넣어 둔 설정 (Vite 는 VITE_ 접두사 변수만 번들에 포함한다).
//  - Vercel: Settings → Environment Variables 에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
//  - Windows 설치 파일: GitHub Actions 의 vars / secrets (.github/workflows/windows-installer.yml)
// 사용자가 설정 화면에 직접 입력한 값이 있으면 그 값이 우선한다.
export const PRESET = {
  supabaseUrl: String(import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, ''),
  supabaseAnonKey: String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim(),
};

export const hasPresetSupabase = Boolean(PRESET.supabaseUrl && PRESET.supabaseAnonKey);

// 설정값과 프리셋을 합쳐 실제로 쓸 Supabase 접속 정보를 돌려준다.
export function resolveSupabase(settings) {
  const url = String(settings?.supabaseUrl || '').trim().replace(/\/+$/, '');
  const anonKey = String(settings?.supabaseAnonKey || '').trim();
  if (url && anonKey) return { url, anonKey, source: 'settings' };
  if (hasPresetSupabase) return { url: PRESET.supabaseUrl, anonKey: PRESET.supabaseAnonKey, source: 'preset' };
  return null;
}

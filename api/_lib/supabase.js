// 서버에서 Supabase 스토리지에 스크린샷을 올린다. 클라이언트가 보낸 anon key 를 그대로 사용한다.
const { createClient } = require('@supabase/supabase-js');

const BUCKET = 'screenshots';

// src/lib/config.js 의 normalizeSupabaseUrl 과 같은 규칙 (서버는 CommonJS 라 복제)
function normalizeSupabaseUrl(input) {
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

function createServerClient(config) {
  const url = normalizeSupabaseUrl(config?.url);
  const anonKey = String(config?.anonKey || '').trim().replace(/^["']|["']$/g, '').replace(/^Bearer\s+/i, '');
  if (!/^https?:\/\//i.test(url)) throw new Error('Supabase URL 형식이 올바르지 않습니다.');
  if (!anonKey) throw new Error('Supabase anon key 가 필요합니다.');
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function uploadScreenshot(client, id, pngBuffer) {
  const path = `${id}.png`;
  const { error } = await client.storage.from(BUCKET).upload(path, pngBuffer, { contentType: 'image/png', upsert: true });
  if (error) throw new Error(`스크린샷 업로드 실패: ${error.message}`);
  const { data } = client.storage.from(BUCKET).getPublicUrl(path);
  return { path, url: data.publicUrl };
}

module.exports = { createServerClient, uploadScreenshot, normalizeSupabaseUrl, BUCKET };

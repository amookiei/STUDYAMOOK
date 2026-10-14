// 서버에서 Supabase 스토리지에 스크린샷을 올린다. 클라이언트가 보낸 anon key 를 그대로 사용한다.
const { createClient } = require('@supabase/supabase-js');

const BUCKET = 'screenshots';

function createServerClient(config) {
  const url = String(config?.url || '').trim().replace(/\/+$/, '');
  const anonKey = String(config?.anonKey || '').trim();
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(url) && !/^https?:\/\//i.test(url)) {
    throw new Error('Supabase URL 형식이 올바르지 않습니다.');
  }
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

module.exports = { createServerClient, uploadScreenshot, BUCKET };

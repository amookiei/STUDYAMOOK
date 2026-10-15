// Supabase 데이터 접근 계층.
// 테이블: references, notes, studies, flows / 스토리지 버킷: screenshots (supabase/schema.sql 참고)
import { createClient } from '@supabase/supabase-js';
import { resolveSupabase } from './config';

export const SCREENSHOT_BUCKET = 'screenshots';

let cached = { key: '', client: null, url: '' };

export function isSupabaseConfigured(settings) {
  return Boolean(resolveSupabase(settings));
}

export function getSupabaseClient(settings) {
  const resolved = resolveSupabase(settings);
  if (!resolved) return null;
  const key = `${resolved.url}::${resolved.anonKey}`;
  if (cached.key === key && cached.client) return cached.client;
  const client = createClient(resolved.url, resolved.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  cached = { key, client, url: resolved.url };
  return client;
}

function throwIf(error, context) {
  if (error) {
    const host = (() => { try { return new URL(cached.url).host; } catch { return ''; } })();
    const hint = /relation .* does not exist|Could not find the table/i.test(error.message || '')
      ? ` — 연결 중인 프로젝트(${host || '알 수 없음'})에 테이블이 없습니다. 이 프로젝트의 SQL Editor 에서 supabase/schema.sql 전체를 실행했는지, Table Editor 에 references/notes 테이블이 보이는지 확인해 주세요. 테이블이 있는데도 이 오류가 나면 SQL Editor 에서 notify pgrst, 'reload schema'; 를 실행해 보세요.`
      : '';
    throw new Error(`${context}: ${error.message || error}${hint}`);
  }
}

function base64ToBlob(base64, mimeType = 'image/png') {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

// ---------------- references ----------------
export async function listReferences(client) {
  const { data, error } = await client
    .from('references')
    .select('id, url, title, site_type, summary, tags, screenshot_url, screenshot_width, screenshot_height, model, created_at, updated_at')
    .order('created_at', { ascending: false });
  throwIf(error, '레퍼런스 목록을 불러오지 못했습니다');
  return data || [];
}

export async function getReference(client, id) {
  const { data, error } = await client.from('references').select('*').eq('id', id).single();
  throwIf(error, '레퍼런스를 불러오지 못했습니다');
  return data;
}

export async function uploadScreenshot(client, id, screenshot) {
  const path = `${id}.png`;
  const blob = base64ToBlob(screenshot.base64, screenshot.mimeType || 'image/png');
  const { error } = await client.storage.from(SCREENSHOT_BUCKET).upload(path, blob, {
    contentType: screenshot.mimeType || 'image/png',
    upsert: true,
  });
  throwIf(error, '스크린샷 업로드에 실패했습니다');
  const { data } = client.storage.from(SCREENSHOT_BUCKET).getPublicUrl(path);
  return { path, url: data.publicUrl };
}

// 사용자가 직접 올린 스크린샷(Blob)을 스토리지에 올린다 (웹 모드: 서버가 이 URL 에서 내려받아 분석)
export async function uploadScreenshotBlob(client, id, blob) {
  const path = `${id}.png`;
  const { error } = await client.storage.from(SCREENSHOT_BUCKET).upload(path, blob, { contentType: 'image/png', upsert: true });
  throwIf(error, '스크린샷 업로드에 실패했습니다');
  const { data } = client.storage.from(SCREENSHOT_BUCKET).getPublicUrl(path);
  return { path, url: data.publicUrl };
}

export async function saveReference(client, { id, capture, analysis, meta }) {
  // 웹 모드에서는 서버(api/capture)가 이미 스토리지에 올렸으므로 그 경로를 그대로 쓴다.
  const shot = capture.screenshot.path && capture.screenshot.url
    ? { path: capture.screenshot.path, url: capture.screenshot.url }
    : await uploadScreenshot(client, id, capture.screenshot);
  const row = {
    id,
    url: capture.url,
    title: capture.title || capture.url,
    site_type: analysis.site_type || '',
    summary: analysis.summary || '',
    tags: analysis.tags || [],
    analysis,
    landmarks: capture.landmarks,
    screenshot_path: shot.path,
    screenshot_url: shot.url,
    screenshot_width: capture.screenshot.width,
    screenshot_height: capture.screenshot.height,
    model: meta?.model || null,
  };
  const { data, error } = await client.from('references').insert(row).select().single();
  throwIf(error, '레퍼런스 저장에 실패했습니다');
  return data;
}

export async function deleteReference(client, reference) {
  const { error } = await client.from('references').delete().eq('id', reference.id);
  throwIf(error, '레퍼런스 삭제에 실패했습니다');
  if (reference.screenshot_path) {
    await client.storage.from(SCREENSHOT_BUCKET).remove([reference.screenshot_path]).catch(() => {});
  }
}

// ---------------- notes ----------------
export async function listNotes(client, referenceId) {
  const { data, error } = await client
    .from('notes')
    .select('*')
    .eq('reference_id', referenceId)
    .order('created_at', { ascending: true });
  throwIf(error, '코멘트를 불러오지 못했습니다');
  return data || [];
}

export async function addNote(client, { referenceId, sectionId, sectionLabel, body }) {
  const { data, error } = await client
    .from('notes')
    .insert({ reference_id: referenceId, section_id: sectionId, section_label: sectionLabel, body })
    .select()
    .single();
  throwIf(error, '코멘트 추가에 실패했습니다');
  return data;
}

export async function updateNote(client, id, body) {
  const { data, error } = await client
    .from('notes')
    .update({ body, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  throwIf(error, '코멘트 수정에 실패했습니다');
  return data;
}

export async function deleteNote(client, id) {
  const { error } = await client.from('notes').delete().eq('id', id);
  throwIf(error, '코멘트 삭제에 실패했습니다');
}

// ---------------- studies (학습 기록: 내 와이어프레임 / IA / 비교 글) ----------------
export async function getStudy(client, referenceId) {
  const { data, error } = await client.from('studies').select('data, updated_at').eq('reference_id', referenceId).maybeSingle();
  throwIf(error, '학습 기록을 불러오지 못했습니다');
  return data ? data.data : null;
}

export async function saveStudy(client, referenceId, study) {
  const { data, error } = await client
    .from('studies')
    .upsert({ reference_id: referenceId, data: study, updated_at: new Date().toISOString() }, { onConflict: 'reference_id' })
    .select('data')
    .single();
  throwIf(error, '학습 기록 저장에 실패했습니다');
  return data ? data.data : study;
}

// ---------------- flows (여러 페이지를 잇는 화면 흐름) ----------------
export async function listFlows(client) {
  const { data, error } = await client.from('flows').select('id, name, data, created_at, updated_at').order('updated_at', { ascending: false });
  throwIf(error, '플로우 목록을 불러오지 못했습니다');
  return (data || []).map((row) => ({ ...row.data, id: row.id, name: row.name, created_at: row.created_at, updated_at: row.updated_at }));
}

export async function saveFlow(client, flow) {
  const { id, created_at, updated_at, ...data } = flow;
  const { data: row, error } = await client
    .from('flows')
    .upsert({ id, name: flow.name || '', data, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    .select('id, name, data, created_at, updated_at')
    .single();
  throwIf(error, '플로우 저장에 실패했습니다');
  return { ...row.data, id: row.id, name: row.name, created_at: row.created_at, updated_at: row.updated_at };
}

export async function deleteFlow(client, id) {
  const { error } = await client.from('flows').delete().eq('id', id);
  throwIf(error, '플로우 삭제에 실패했습니다');
}

export async function testSupabase(settings) {
  const client = getSupabaseClient(settings);
  if (!client) throw new Error('Supabase URL 과 anon key 를 모두 입력하거나, 환경 변수(VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)로 미리 설정해 주세요.');
  const { error } = await client.from('references').select('id', { count: 'exact', head: true });
  throwIf(error, 'Supabase 연결 실패');
  const { error: studiesError } = await client.from('studies').select('reference_id', { count: 'exact', head: true });
  throwIf(studiesError, 'studies 테이블 확인 실패 (schema.sql 을 다시 실행하면 추가됩니다)');
  const { error: flowsError } = await client.from('flows').select('id', { count: 'exact', head: true });
  throwIf(flowsError, 'flows 테이블 확인 실패 (schema.sql 을 다시 실행하면 추가됩니다)');
  const { error: bucketError } = await client.storage.from(SCREENSHOT_BUCKET).list('', { limit: 1 });
  if (bucketError) throw new Error(`"${SCREENSHOT_BUCKET}" 버킷에 접근할 수 없습니다: ${bucketError.message}`);
  return true;
}

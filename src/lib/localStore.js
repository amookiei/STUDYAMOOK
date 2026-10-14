// Supabase 가 설정되지 않았을 때 쓰는 로컬(IndexedDB) 저장소.
// 같은 PC 안에서만 유지되며, Supabase 를 설정하면 그쪽이 우선된다.
const DB_NAME = 'ux-reference-studio';
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('references')) db.createObjectStore('references', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('notes')) {
        const notes = db.createObjectStore('notes', { keyPath: 'id' });
        notes.createIndex('reference_id', 'reference_id', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB 를 열 수 없습니다.'));
  });
}

function tx(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    try { result = fn(s); } catch (e) { reject(e); return; }
    t.oncomplete = () => resolve(result && 'result' in result ? result.result : result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export async function listReferences() {
  const db = await openDb();
  const all = await tx(db, 'references', 'readonly', (s) => s.getAll());
  return (all || [])
    .map(({ analysis, landmarks, screenshot_base64, ...rest }) => rest)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export async function getReference(id) {
  const db = await openDb();
  const row = await tx(db, 'references', 'readonly', (s) => s.get(id));
  if (!row) throw new Error('레퍼런스를 찾을 수 없습니다.');
  return row;
}

export async function saveReference({ id, capture, analysis, meta }) {
  const db = await openDb();
  const now = new Date().toISOString();
  const row = {
    id,
    url: capture.url,
    title: capture.title || capture.url,
    site_type: analysis.site_type || '',
    summary: analysis.summary || '',
    tags: analysis.tags || [],
    analysis,
    landmarks: capture.landmarks,
    screenshot_path: null,
    screenshot_url: `data:${capture.screenshot.mimeType || 'image/png'};base64,${capture.screenshot.base64}`,
    screenshot_width: capture.screenshot.width,
    screenshot_height: capture.screenshot.height,
    model: meta?.model || null,
    created_at: now,
    updated_at: now,
    storage: 'local',
  };
  await tx(db, 'references', 'readwrite', (s) => s.put(row));
  return row;
}

export async function deleteReference(reference) {
  const db = await openDb();
  await tx(db, 'references', 'readwrite', (s) => s.delete(reference.id));
  const notes = await listNotes(reference.id);
  await tx(db, 'notes', 'readwrite', (s) => { notes.forEach((n) => s.delete(n.id)); });
}

export async function listNotes(referenceId) {
  const db = await openDb();
  const all = await tx(db, 'notes', 'readonly', (s) => s.index('reference_id').getAll(referenceId));
  return (all || []).sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
}

export async function addNote({ referenceId, sectionId, sectionLabel, body }) {
  const db = await openDb();
  const now = new Date().toISOString();
  const row = { id: uuid(), reference_id: referenceId, section_id: sectionId, section_label: sectionLabel, body, created_at: now, updated_at: now };
  await tx(db, 'notes', 'readwrite', (s) => s.put(row));
  return row;
}

export async function updateNote(id, body) {
  const db = await openDb();
  const row = await tx(db, 'notes', 'readonly', (s) => s.get(id));
  if (!row) throw new Error('코멘트를 찾을 수 없습니다.');
  const next = { ...row, body, updated_at: new Date().toISOString() };
  await tx(db, 'notes', 'readwrite', (s) => s.put(next));
  return next;
}

export async function deleteNote(id) {
  const db = await openDb();
  await tx(db, 'notes', 'readwrite', (s) => s.delete(id));
}

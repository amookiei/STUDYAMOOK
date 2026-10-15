// 설정에 따라 Supabase 또는 로컬(IndexedDB) 백엔드를 고르는 얇은 레이어.
import * as supa from './supabase';
import * as local from './localStore';

export function createStore(settings) {
  const client = supa.getSupabaseClient(settings);
  if (client) {
    return {
      kind: 'supabase',
      listReferences: () => supa.listReferences(client),
      getReference: (id) => supa.getReference(client, id),
      saveReference: (input) => supa.saveReference(client, input),
      deleteReference: (ref) => supa.deleteReference(client, ref),
      listNotes: (refId) => supa.listNotes(client, refId),
      addNote: (input) => supa.addNote(client, input),
      updateNote: (id, body) => supa.updateNote(client, id, body),
      deleteNote: (id) => supa.deleteNote(client, id),
      uploadScreenshotBlob: (id, blob) => supa.uploadScreenshotBlob(client, id, blob),
    };
  }
  return {
    kind: 'local',
    listReferences: local.listReferences,
    getReference: local.getReference,
    saveReference: local.saveReference,
    deleteReference: local.deleteReference,
    listNotes: local.listNotes,
    addNote: local.addNote,
    updateNote: local.updateNote,
    deleteNote: local.deleteNote,
  };
}

export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

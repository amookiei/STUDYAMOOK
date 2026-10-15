import React, { useEffect, useMemo, useState } from 'react';

export const GENERAL_SECTION = { id: '__general__', name: '전체 (일반 코멘트)' };

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function NoteItem({ note, onUpdate, onDelete, busy }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.body);

  useEffect(() => { if (!editing) setDraft(note.body); }, [note.body, editing]);

  const save = async () => {
    const body = draft.trim();
    if (!body || body === note.body) { setEditing(false); return; }
    await onUpdate(note.id, body);
    setEditing(false);
  };

  return (
    <div className="note">
      {editing ? (
        <>
          <textarea className="input note__edit" value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} autoFocus />
          <div className="note__actions">
            <button type="button" className="btn btn--sm btn--primary" onClick={save} disabled={busy}>저장</button>
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => { setEditing(false); setDraft(note.body); }}>취소</button>
          </div>
        </>
      ) : (
        <>
          <p className="note__body">{note.body}</p>
          <div className="note__foot">
            <span className="muted">{formatTime(note.updated_at || note.created_at)}{note.updated_at && note.updated_at !== note.created_at ? ' (수정됨)' : ''}</span>
            <div className="note__actions">
              <button type="button" className="link" onClick={() => setEditing(true)} disabled={busy}>수정</button>
              <button type="button" className="link link--danger" onClick={() => onDelete(note)} disabled={busy}>삭제</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function Comments({ reference, sections: sectionsProp, notes, selectedSectionId, onSelectSection, onAdd, onUpdate, onDelete, busy }) {
  const [draft, setDraft] = useState('');

  // sections: [{ id, name, level, group }] — App 에서 내 IA 노드와 (공개된) AI 섹션을 합쳐 넘긴다.
  const sections = useMemo(() => {
    const list = sectionsProp && sectionsProp.length ? sectionsProp : [GENERAL_SECTION];
    return list.some((s) => s.id === GENERAL_SECTION.id) ? list : [GENERAL_SECTION, ...list];
  }, [sectionsProp]);
  const groups = useMemo(() => {
    const map = new Map();
    for (const s of sections) {
      const key = s.group || '';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(s);
    }
    return Array.from(map.entries());
  }, [sections]);

  const currentId = sections.some((s) => s.id === selectedSectionId) ? selectedSectionId : GENERAL_SECTION.id;
  const current = sections.find((s) => s.id === currentId) || GENERAL_SECTION;

  const grouped = useMemo(() => {
    const map = new Map();
    for (const n of notes) {
      const key = n.section_id || GENERAL_SECTION.id;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(n);
    }
    return map;
  }, [notes]);

  const sectionNotes = grouped.get(currentId) || [];

  if (!reference) {
    return (
      <aside className="comments">
        <h2>코멘트</h2>
        <p className="muted">레퍼런스를 선택하거나 새로 분석하면 섹션별로 코멘트를 남길 수 있습니다. 내 IA 노드와 (공개 후) AI 섹션별로 메모가 묶이고, LinkedIn 초안에 함께 들어갑니다.</p>
      </aside>
    );
  }

  const submit = async () => {
    const body = draft.trim();
    if (!body) return;
    await onAdd({ sectionId: currentId, sectionLabel: current.name, body });
    setDraft('');
  };

  return (
    <aside className="comments">
      <div className="comments__header">
        <h2>코멘트</h2>
        <span className="muted">{notes.length}개</span>
      </div>

      <label className="field">
        <span className="field__label">섹션</span>
        <select className="input" value={currentId} onChange={(e) => onSelectSection(e.target.value)}>
          {groups.map(([group, list]) => {
            const options = list.map((s) => (
              <option key={s.id} value={s.id}>
                {s.level ? `${'　'.repeat(Math.max(0, s.level - 1))}${s.name}` : s.name}
                {grouped.get(s.id)?.length ? ` (${grouped.get(s.id).length})` : ''}
              </option>
            ));
            return group ? <optgroup key={group} label={group}>{options}</optgroup> : options;
          })}
        </select>
      </label>

      <div className="comments__compose">
        <textarea
          className="input"
          rows={3}
          placeholder={`"${current.name}" 에 대한 메모를 남겨 보세요 (Ctrl+Enter 로 추가)`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') submit(); }}
          disabled={busy}
        />
        <button type="button" className="btn btn--primary" onClick={submit} disabled={busy || !draft.trim()}>코멘트 추가</button>
      </div>

      <div className="comments__list">
        {sectionNotes.length === 0 && <p className="muted">이 섹션에는 아직 코멘트가 없습니다.</p>}
        {sectionNotes.map((n) => (
          <NoteItem key={n.id} note={n} onUpdate={onUpdate} onDelete={onDelete} busy={busy} />
        ))}
      </div>

      {notes.length > sectionNotes.length && (
        <div className="comments__others">
          <h4>다른 섹션의 코멘트</h4>
          {sections.filter((s) => s.id !== currentId && grouped.get(s.id)?.length).map((s) => (
            <button key={s.id} type="button" className="link" onClick={() => onSelectSection(s.id)}>
              {s.name} ({grouped.get(s.id).length})
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}

import React, { useMemo, useState } from 'react';

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export default function Library({ references, selectedId, loading, storeKind, onSelect, onDelete, onRefresh, flows = [], currentFlowId, onOpenFlow, onNewFlow, onCloseFlow }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return references;
    return references.filter((r) =>
      [r.title, r.url, r.site_type, r.summary, ...(r.tags || [])].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [references, query]);

  return (
    <aside className="library">
      <div className="library__header">
        <h2>레퍼런스 라이브러리</h2>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onRefresh} disabled={loading} title="새로고침">
          {loading ? '불러오는 중…' : '새로고침'}
        </button>
      </div>
      <div className="library__storage">
        {storeKind === 'supabase' ? (
          <span className="pill pill--ok">Supabase 연결됨</span>
        ) : (
          <span className="pill pill--warn" title="설정에서 Supabase 를 연결하면 클라우드에 저장됩니다">로컬 저장 (Supabase 미설정)</span>
        )}
      </div>
      <div className="flows">
        <div className="flows__head">
          <h2>플로우</h2>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onNewFlow} title="여러 페이지를 노드로 잇는 화면 흐름">+ 새 플로우</button>
        </div>
        {flows.length === 0 && <p className="muted small flows__empty">페이지들을 노드로 놓고 기능 단위에서 다음 페이지로 잇는 흐름을 만들 수 있습니다.</p>}
        {flows.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`flow-item${f.id === currentFlowId ? ' flow-item--active' : ''}`}
            onClick={() => (f.id === currentFlowId ? onCloseFlow() : onOpenFlow(f))}
            title={f.id === currentFlowId ? '클릭하면 플로우를 닫습니다' : '플로우 열기'}
          >
            <span className="flow-item__name">{f.name || '이름 없음'}</span>
            <span className="muted small">{(f.nodes || []).length}p · {(f.edges || []).length}↗</span>
          </button>
        ))}
      </div>
      <input
        className="input library__search"
        placeholder="제목, URL, 태그 검색"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="library__list">
        {filtered.length === 0 && (
          <p className="muted library__empty">
            {references.length === 0 ? '아직 저장된 레퍼런스가 없습니다. 위에 URL 을 입력하고 분석을 시작해 보세요.' : '검색 결과가 없습니다.'}
          </p>
        )}
        {filtered.map((ref) => (
          <div
            key={ref.id}
            className={`ref-card${ref.id === selectedId ? ' ref-card--active' : ''}`}
            onClick={() => onSelect(ref)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') onSelect(ref); }}
          >
            <div className="ref-card__thumb">
              {ref.screenshot_url ? <img src={ref.screenshot_url} alt="" loading="lazy" /> : <div className="ref-card__thumb-empty">이미지 없음</div>}
            </div>
            <div className="ref-card__body">
              <div className="ref-card__title" title={ref.title}>{ref.title || ref.url}</div>
              <div className="ref-card__meta">
                <span>{hostOf(ref.url)}</span>
                <span>·</span>
                <span>{formatDate(ref.created_at)}</span>
              </div>
              {ref.site_type && <div className="ref-card__type">{ref.site_type}</div>}
              {ref.tags && ref.tags.length > 0 && (
                <div className="ref-card__tags">
                  {ref.tags.slice(0, 4).map((t) => <span key={t} className="tag">{t}</span>)}
                </div>
              )}
            </div>
            <button
              type="button"
              className="ref-card__delete"
              title="삭제"
              onClick={(e) => { e.stopPropagation(); onDelete(ref); }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}

import React from 'react';

// electron/analyzer.js 의 PATTERN_CATEGORIES / EVALUATIONS 와 맞춘다.
const CATEGORY_LABEL = {
  navigation: '내비게이션', layout: '레이아웃', content: '콘텐츠', conversion: '전환',
  interaction: '인터랙션', trust: '신뢰', accessibility: '접근성', other: '기타',
};
const EVAL_LABEL = { strength: '강점', neutral: '관찰', improvement: '개선 여지' };

function Chips({ items }) {
  if (!items || items.length === 0) return <span className="muted">없음</span>;
  return <div className="chips">{items.map((t, i) => <span key={`${t}-${i}`} className="chip">{t}</span>)}</div>;
}

export default function Analysis({ analysis, meta, selectedSectionId, onSelectSection }) {
  if (!analysis) {
    return <div className="empty-state">분석 결과가 없습니다. URL 을 입력하고 분석을 실행해 주세요.</div>;
  }
  const ia = analysis.information_architecture || {};
  const hierarchy = ia.hierarchy || [];
  const nav = ia.navigation || {};
  const insights = analysis.insights || {};
  const patterns = analysis.ux_patterns || [];
  const sectionName = Object.fromEntries(hierarchy.map((s) => [s.id, s.name]));

  return (
    <div className="analysis">
      <section className="card">
        <div className="card__head">
          <h3>요약</h3>
          {meta?.model && <span className="muted">모델: {meta.model}</span>}
        </div>
        <p className="analysis__summary">{analysis.summary}</p>
        <dl className="kv">
          <dt>사이트 유형</dt><dd>{analysis.site_type || '-'}</dd>
          <dt>타깃 사용자</dt><dd>{analysis.target_audience || '-'}</dd>
          <dt>태그</dt><dd><Chips items={analysis.tags} /></dd>
        </dl>
      </section>

      <section className="card">
        <h3>정보 구조</h3>
        {hierarchy.length === 0 ? <p className="muted">정보 구조 데이터가 없습니다.</p> : (
          <ul className="ia-tree">
            {hierarchy.map((s) => (
              <li
                key={s.id}
                className={`ia-tree__item ia-tree__item--l${s.level}${selectedSectionId === s.id ? ' ia-tree__item--active' : ''}`}
                onClick={() => onSelectSection && onSelectSection(s.id)}
                title="클릭하면 코멘트 패널에서 이 섹션이 선택됩니다"
              >
                <div className="ia-tree__name">{s.name}</div>
                {s.purpose && <div className="ia-tree__purpose">{s.purpose}</div>}
                {s.landmark_ids && s.landmark_ids.length > 0 && (
                  <div className="ia-tree__landmarks">{s.landmark_ids.join(', ')}</div>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="nav-groups">
          <div><h4>주 내비게이션</h4><Chips items={nav.primary} /></div>
          <div><h4>보조 내비게이션</h4><Chips items={nav.secondary} /></div>
          <div><h4>유틸리티</h4><Chips items={nav.utility} /></div>
          <div><h4>푸터</h4><Chips items={nav.footer} /></div>
        </div>
        {ia.content_priority && ia.content_priority.length > 0 && (
          <>
            <h4>콘텐츠 우선순위</h4>
            <ol className="priority-list">{ia.content_priority.map((c, i) => <li key={i}>{c}</li>)}</ol>
          </>
        )}
      </section>

      <section className="card">
        <h3>UX 패턴 <span className="muted">({patterns.length})</span></h3>
        {patterns.length === 0 ? <p className="muted">패턴 데이터가 없습니다.</p> : (
          <div className="pattern-grid">
            {patterns.map((p, i) => (
              <div key={`${p.name}-${i}`} className={`pattern pattern--${p.evaluation}`}>
                <div className="pattern__head">
                  <strong>{p.name}</strong>
                  <span className={`badge badge--${p.evaluation}`}>{EVAL_LABEL[p.evaluation] || p.evaluation}</span>
                </div>
                <div className="pattern__meta">
                  <span className="chip chip--soft">{CATEGORY_LABEL[p.category] || p.category}</span>
                  {p.location && <span className="muted">{p.location}</span>}
                  {p.section_id && sectionName[p.section_id] && (
                    <button type="button" className="link" onClick={() => onSelectSection && onSelectSection(p.section_id)}>
                      {sectionName[p.section_id]}
                    </button>
                  )}
                </div>
                <p>{p.description}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h3>인사이트</h3>
        <div className="insights">
          <div><h4>강점</h4><ul>{(insights.strengths || []).map((s, i) => <li key={i}>{s}</li>)}</ul></div>
          <div><h4>개선 여지</h4><ul>{(insights.improvements || []).map((s, i) => <li key={i}>{s}</li>)}</ul></div>
          <div><h4>가져갈 포인트</h4><ul>{(insights.takeaways || []).map((s, i) => <li key={i}>{s}</li>)}</ul></div>
        </div>
      </section>
    </div>
  );
}

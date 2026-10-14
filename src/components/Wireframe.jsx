import React, { useMemo, useState } from 'react';

// electron/analyzer.js 의 BLOCK_TYPES 와 맞춘다.
export const BLOCK_STYLE = {
  header: { label: '헤더', color: '#4c6ef5' },
  nav: { label: '내비게이션', color: '#5c7cfa' },
  hero: { label: '히어로', color: '#f76707' },
  content: { label: '콘텐츠', color: '#868e96' },
  feature: { label: '기능 소개', color: '#2f9e44' },
  sidebar: { label: '사이드바', color: '#ae3ec9' },
  cta: { label: 'CTA', color: '#e03131' },
  form: { label: '폼', color: '#0c8599' },
  footer: { label: '푸터', color: '#495057' },
  media: { label: '미디어', color: '#f59f00' },
  'card-grid': { label: '카드 그리드', color: '#1098ad' },
  testimonial: { label: '고객 후기', color: '#e8590c' },
  pricing: { label: '가격', color: '#7048e8' },
  faq: { label: 'FAQ', color: '#099268' },
  table: { label: '표', color: '#6741d9' },
  list: { label: '목록', color: '#3b5bdb' },
  other: { label: '기타', color: '#adb5bd' },
};

const styleOf = (type) => BLOCK_STYLE[type] || BLOCK_STYLE.other;

export default function Wireframe({ analysis, screenshotUrl, pageWidth, pageHeight, selectedSectionId, onSelectSection }) {
  const [overlay, setOverlay] = useState(false);
  const [hovered, setHovered] = useState(null);

  const blocks = analysis?.wireframe?.blocks || [];
  const sections = analysis?.information_architecture?.hierarchy || [];
  const sectionName = useMemo(() => Object.fromEntries(sections.map((s) => [s.id, s.name])), [sections]);

  if (blocks.length === 0) {
    return <div className="empty-state">와이어프레임 데이터가 없습니다. 분석을 먼저 실행해 주세요.</div>;
  }

  // 좌표는 페이지 기준 퍼센트. SVG 는 가로 100, 세로는 페이지 비율에 맞춘다.
  const ratio = pageWidth && pageHeight ? pageHeight / pageWidth : 2;
  const H = 100 * ratio;
  const usedTypes = Array.from(new Set(blocks.map((b) => b.type)));

  return (
    <div className="wireframe">
      <div className="toolbar">
        <span className="muted">{blocks.length}개 블록 · 클릭하면 오른쪽 코멘트 패널에서 해당 섹션이 선택됩니다</span>
        <div className="toolbar__spacer" />
        <label className="checkbox">
          <input type="checkbox" checked={overlay} onChange={(e) => setOverlay(e.target.checked)} disabled={!screenshotUrl} />
          스크린샷 위에 겹쳐 보기
        </label>
      </div>
      <div className="wireframe__body">
        <div className="wireframe__canvas-wrap">
          <div className="wireframe__canvas" style={{ aspectRatio: `${100} / ${H}` }}>
            {overlay && screenshotUrl && <img src={screenshotUrl} alt="" className="wireframe__bg" />}
            <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="wireframe__svg">
              <rect x="0" y="0" width="100" height={H} fill={overlay ? 'rgba(255,255,255,0.15)' : '#ffffff'} />
              {blocks.map((b) => {
                const s = styleOf(b.type);
                const selected = selectedSectionId && b.section_id === selectedSectionId;
                const isHover = hovered === b.id;
                return (
                  <g
                    key={b.id}
                    className="wf-block"
                    onClick={() => onSelectSection && onSelectSection(b.section_id)}
                    onMouseEnter={() => setHovered(b.id)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    <rect
                      x={b.x}
                      y={(b.y / 100) * H}
                      width={b.w}
                      height={(b.h / 100) * H}
                      fill={s.color}
                      fillOpacity={selected ? 0.45 : isHover ? 0.35 : overlay ? 0.18 : 0.22}
                      stroke={s.color}
                      strokeWidth={selected ? 0.6 : 0.3}
                      vectorEffect="non-scaling-stroke"
                      rx="0.4"
                    />
                    <text
                      x={b.x + 1}
                      y={(b.y / 100) * H + 2.2}
                      fontSize="1.6"
                      fill="#1b1f24"
                      fontWeight="600"
                      style={{ pointerEvents: 'none' }}
                    >
                      {b.label}
                    </text>
                    <title>{`${b.label} (${s.label})\n${b.description || ''}`}</title>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
        <div className="wireframe__side">
          <h4>범례</h4>
          <div className="legend">
            {usedTypes.map((t) => (
              <span key={t} className="legend__item">
                <i style={{ background: styleOf(t).color }} />
                {styleOf(t).label}
              </span>
            ))}
          </div>
          <h4>블록 목록</h4>
          <ol className="block-list">
            {blocks.map((b) => (
              <li
                key={b.id}
                className={`block-list__item${selectedSectionId === b.section_id ? ' block-list__item--active' : ''}${hovered === b.id ? ' block-list__item--hover' : ''}`}
                onClick={() => onSelectSection && onSelectSection(b.section_id)}
                onMouseEnter={() => setHovered(b.id)}
                onMouseLeave={() => setHovered(null)}
              >
                <span className="block-list__swatch" style={{ background: styleOf(b.type).color }} />
                <div>
                  <div className="block-list__label">{b.label} <span className="muted">· {styleOf(b.type).label}</span></div>
                  {b.description && <div className="block-list__desc">{b.description}</div>}
                  {sectionName[b.section_id] && <div className="block-list__section">섹션: {sectionName[b.section_id]}</div>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

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
  const [overlayOpacity, setOverlayOpacity] = useState(0.35); // 블록 채움 투명도 (오버레이 모드)
  const [showLabels, setShowLabels] = useState(true);
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
  const domCount = blocks.filter((b) => b.source === 'dom').length;

  return (
    <div className="wireframe">
      <div className="toolbar">
        <span className="muted">
          {blocks.length}개 블록
          {domCount > 0 && <> · 실측 {domCount}개 / 추정 {blocks.length - domCount}개</>}
          {' '}· 클릭하면 오른쪽 코멘트 패널에서 해당 섹션이 선택됩니다
        </span>
        <div className="toolbar__spacer" />
        <label className="checkbox">
          <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
          라벨
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={overlay} onChange={(e) => setOverlay(e.target.checked)} disabled={!screenshotUrl} />
          스크린샷 위에 겹쳐 보기
        </label>
        {overlay && (
          <label className="checkbox" title="블록 채움 투명도">
            <input type="range" min="0" max="0.8" step="0.05" value={overlayOpacity} onChange={(e) => setOverlayOpacity(parseFloat(e.target.value))} />
            {Math.round(overlayOpacity * 100)}%
          </label>
        )}
      </div>
      <div className="wireframe__body">
        <div className="wireframe__canvas-wrap">
          <div className="wireframe__canvas" style={{ aspectRatio: `${100} / ${H}` }}>
            {overlay && screenshotUrl && <img src={screenshotUrl} alt="" className="wireframe__bg" />}
            <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="wireframe__svg">
              <rect x="0" y="0" width="100" height={H} fill={overlay ? 'rgba(255,255,255,0)' : '#ffffff'} />
              {blocks.map((b) => {
                const s = styleOf(b.type);
                const selected = selectedSectionId && b.section_id === selectedSectionId;
                const isHover = hovered === b.id;
                const estimated = b.source === 'estimate'; // DOM 실측이 아닌 추정 블록은 점선
                const baseOpacity = overlay ? overlayOpacity : 0.22;
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
                      fillOpacity={selected ? Math.min(0.9, baseOpacity + 0.25) : isHover ? Math.min(0.9, baseOpacity + 0.15) : baseOpacity}
                      stroke={s.color}
                      strokeWidth={selected ? 0.6 : 0.3}
                      strokeDasharray={estimated ? '1 0.6' : undefined}
                      vectorEffect="non-scaling-stroke"
                      rx="0.4"
                    />
                    {showLabels && (
                      <text
                        x={b.x + 1}
                        y={(b.y / 100) * H + 2.2}
                        fontSize="1.6"
                        fill="#1b1f24"
                        fontWeight="600"
                        stroke="#ffffff"
                        strokeWidth="0.25"
                        paintOrder="stroke"
                        style={{ pointerEvents: 'none' }}
                      >
                        {b.label}{estimated ? ' ·추정' : ''}
                      </text>
                    )}
                    <title>{`${b.label} (${s.label})${estimated ? ' · 모델 추정 위치' : ' · DOM 실측 위치'}\n${b.description || ''}`}</title>
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
          <p className="muted small">실선: DOM 에서 실측한 위치 · 점선: 스크린샷만 보고 추정한 위치</p>
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
                  <div className="block-list__label">{b.label} <span className="muted">· {styleOf(b.type).label}{b.source === 'estimate' ? ' · 추정' : ''}</span></div>
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

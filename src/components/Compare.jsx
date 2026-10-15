import React, { useMemo, useState } from 'react';
import { styleOf } from '../lib/blockTypes';
import { compareBlocks, compareIa, checklist, buildLinkedInDraft } from '../lib/study';
import { renderStudyImage, downloadBlob, safeFilename } from '../lib/exportImage';

// 내 분석(와이어프레임·IA)과 AI 분석을 겹쳐 보고, 비교 글을 쓰고, LinkedIn 초안으로 내보낸다.
const COMPARE_FIELDS = [
  { key: 'ai_traits', label: 'AI 가 분석한 화면은 …', hint: '예: 섹션을 크게 8개로 나누고 CTA 를 반복 배치한 점을 강점으로 봤다. 디자인 시스템 관점의 일관성은 언급하지 않았다.' },
  { key: 'my_view', label: '내 분석과 비교해 보면 …', hint: '예: 나는 가격/혜택 정보를 한 묶음으로 봤는데 AI 는 블록 단위로만 나눴다. 상태 케이스(재고 없음, 비로그인)는 AI 가 전혀 다루지 않았다.' },
  { key: 'improvement', label: '그래서 개선할 여지는 …', hint: '예: 비로그인 상태의 CTA 문구를 분리하고, 가격 정보를 상단 묶음으로 올리면 전환율에 도움이 될 것이다.' },
  { key: 'evidence', label: '근거 (데이터/원칙)', hint: '예: 주문 완료 페이지 체류 시간이 짧다는 로그, "버튼은 정보가 아니다" 원칙' },
];

export default function Compare({ reference, analysis, study, notes, onChange, onToast }) {
  const [showAi, setShowAi] = useState(true);
  const [showMine, setShowMine] = useState(true);
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const aiBlocks = analysis?.wireframe?.blocks || [];
  const aiHier = analysis?.information_architecture?.hierarchy || [];
  const bc = useMemo(() => compareBlocks(study.drawing.shapes, aiBlocks), [study.drawing.shapes, aiBlocks]);
  const ic = useMemo(() => compareIa(study.ia.nodes, aiHier), [study.ia.nodes, aiHier]);
  const checks = useMemo(() => checklist(study, analysis), [study, analysis]);
  const draft = useMemo(() => buildLinkedInDraft({ reference, study, analysis, notes }), [reference, study, analysis, notes]);

  const ratio = reference?.screenshot_width && reference?.screenshot_height ? reference.screenshot_height / reference.screenshot_width : 2;
  const H = 100 * ratio;
  const matchedMine = new Set(bc.matches.map((m) => m.mine.id));
  const matchedAi = new Set(bc.matches.map((m) => m.ai.id));
  const visibleAi = aiBlocks.filter((b) => !onlyDiff || !matchedAi.has(b.id));
  const visibleMine = bc.mine.filter((b) => !onlyDiff || !matchedMine.has(b.id));
  const doneCount = checks.filter((c) => c.ok).length;

  const copyDraft = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      onToast && onToast(`복사에 실패했습니다: ${err.message}`, 'error');
    }
  };
  const downloadDraft = () => {
    downloadBlob(new Blob([draft], { type: 'text/markdown;charset=utf-8' }), `${safeFilename(reference?.title)} - 학습 기록.md`);
  };
  const exportImage = async () => {
    setBusy(true);
    try {
      const blob = await renderStudyImage({
        screenshotUrl: reference?.screenshot_url, width: reference?.screenshot_width, height: reference?.screenshot_height,
        shapes: showMine ? study.drawing.shapes : [], pins: showMine ? study.drawing.pins : [], aiBlocks: showAi ? aiBlocks : [], screenshotOpacity: 0.55,
      });
      downloadBlob(blob, `${safeFilename(reference?.title)} - AI 비교.png`);
    } catch (err) {
      onToast && onToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="compare">
      <section className="card">
        <div className="card__head">
          <h3>와이어프레임 비교</h3>
          <span className="muted small">
            일치 <strong>{bc.matches.length}</strong> · 내가 더 본 것 <strong>{bc.onlyMine.length}</strong> · AI 만 본 것 <strong>{bc.onlyAi.length}</strong>
            {' '}(내 블록 {bc.mine.length} / AI 블록 {aiBlocks.length}, 겹침 40% 이상이면 일치)
          </span>
        </div>
        <div className="toolbar compare__toolbar">
          <label className="checkbox"><input type="checkbox" checked={showAi} onChange={(e) => setShowAi(e.target.checked)} /> AI 블록 (색)</label>
          <label className="checkbox"><input type="checkbox" checked={showMine} onChange={(e) => setShowMine(e.target.checked)} /> 내 블록 (검정 테두리)</label>
          <label className="checkbox"><input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} /> 다른 부분만</label>
          <div className="toolbar__spacer" />
          <button type="button" className="btn btn--sm" onClick={exportImage} disabled={busy}>{busy ? '내보내는 중…' : '비교 이미지 PNG'}</button>
        </div>
        <div className="compare__body">
          <div className="compare__canvas-wrap">
            <div className="compare__canvas" style={{ aspectRatio: `100 / ${H}` }}>
              {reference?.screenshot_url && <img src={reference.screenshot_url} alt="" className="wireframe__bg" style={{ opacity: 0.55 }} />}
              <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="wireframe__svg">
                {showAi && visibleAi.map((b) => {
                  const c = styleOf(b.type).color;
                  return (
                    <g key={b.id}>
                      <rect x={b.x} y={(b.y / 100) * H} width={b.w} height={(b.h / 100) * H} fill={c} fillOpacity={0.28} stroke={c} strokeWidth={0.3} strokeDasharray={b.source === 'estimate' ? '1 0.6' : undefined} vectorEffect="non-scaling-stroke" />
                      <text x={b.x + 1} y={(b.y / 100) * H + 2.2} fontSize="1.5" fill={c} fontWeight="700" stroke="#fff" strokeWidth="0.25" paintOrder="stroke">AI · {b.label}</text>
                      <title>{`AI · ${b.label}${matchedAi.has(b.id) ? ' (내 블록과 일치)' : ' (나는 놓침)'}`}</title>
                    </g>
                  );
                })}
                {showMine && visibleMine.map((b) => (
                  <g key={b.id}>
                    <rect x={b.x} y={(b.y / 100) * H} width={b.w} height={(b.h / 100) * H} fill="none" stroke="#1b1f24" strokeWidth={0.7} vectorEffect="non-scaling-stroke" />
                    <text x={b.x + 1} y={(b.y / 100) * H + (b.h / 100) * H - 1} fontSize="1.5" fill="#1b1f24" fontWeight="700" stroke="#fff" strokeWidth="0.25" paintOrder="stroke">나 · {b.label}</text>
                    <title>{`나 · ${b.label}${matchedMine.has(b.id) ? ' (AI 블록과 일치)' : ' (AI 는 놓침)'}`}</title>
                  </g>
                ))}
              </svg>
            </div>
          </div>
          <div className="compare__lists">
            <h4>일치 ({bc.matches.length})</h4>
            <ul className="small">
              {bc.matches.map((m) => <li key={m.mine.id}><strong>{m.mine.label}</strong> ↔ {m.ai.label} <span className="muted">({Math.round(m.iou * 100)}%)</span></li>)}
              {bc.matches.length === 0 && <li className="muted">없음</li>}
            </ul>
            <h4>내가 잡았지만 AI 는 놓친 것 ({bc.onlyMine.length})</h4>
            <ul className="small">
              {bc.onlyMine.map((b) => <li key={b.id}><strong>{b.label}</strong>{b.role === 'component' ? ' · 컴포넌트' : ''}{b.states ? <span className="muted"> · 상태 {b.states.split('\n').filter(Boolean).length}개</span> : null}</li>)}
              {bc.onlyMine.length === 0 && <li className="muted">없음</li>}
            </ul>
            <h4>AI 는 잡았지만 내가 놓친 것 ({bc.onlyAi.length})</h4>
            <ul className="small">
              {bc.onlyAi.map((b) => <li key={b.id}><strong>{b.label}</strong> <span className="muted">· {styleOf(b.type).label}</span>{b.description ? <div className="muted">{b.description}</div> : null}</li>)}
              {bc.onlyAi.length === 0 && <li className="muted">없음</li>}
            </ul>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card__head">
          <h3>IA 비교</h3>
          <span className="muted small">일치 <strong>{ic.matches.length}</strong> · 내 IA 에만 <strong>{ic.onlyMine.length}</strong> · AI IA 에만 <strong>{ic.onlyAi.length}</strong></span>
        </div>
        <div className="compare__ia">
          <div>
            <h4>일치</h4>
            <ul className="small">{ic.matches.map((m) => <li key={m.mine.id}>{m.mine.name} ↔ {m.ai.name}</li>)}{ic.matches.length === 0 && <li className="muted">없음</li>}</ul>
          </div>
          <div>
            <h4>내 IA 에만</h4>
            <ul className="small">{ic.onlyMine.map((n) => <li key={n.id}>{n.name}</li>)}{ic.onlyMine.length === 0 && <li className="muted">없음</li>}</ul>
          </div>
          <div>
            <h4>AI IA 에만</h4>
            <ul className="small">{ic.onlyAi.map((h) => <li key={h.id}>{h.name}{h.purpose ? <span className="muted"> — {h.purpose}</span> : null}</li>)}{ic.onlyAi.length === 0 && <li className="muted">없음</li>}</ul>
          </div>
        </div>
        <p className="muted small">AI 의 hierarchy 에는 "헤더", "푸터" 같은 컴포넌트성 섹션이 섞여 있을 수 있습니다. 내 IA 는 정보만으로 묶였는지 확인하세요.</p>
      </section>

      <section className="card">
        <h3>비교 글 쓰기</h3>
        <p className="muted small">"AI 가 짜 준 화면은 ~한 특징이 있는데, 내 분석과 비교해 보면 ~게 개선할 여지가 있다" 구조로 적습니다. 그대로 LinkedIn 초안에 들어갑니다.</p>
        <div className="compare__fields">
          {COMPARE_FIELDS.map((f) => (
            <label key={f.key} className="field">
              <span className="field__label">{f.label}</span>
              <textarea className="input" rows={3} value={study.compare[f.key] || ''} onChange={(e) => onChange({ compare: { ...study.compare, [f.key]: e.target.value } })} placeholder={f.hint} />
            </label>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="card__head">
          <h3>원칙 체크리스트</h3>
          <span className="muted small">{doneCount} / {checks.length}</span>
        </div>
        <ul className="checks">
          {checks.map((c) => (
            <li key={c.id} className={`checks__item${c.ok ? ' checks__item--ok' : ''}`}>
              <span className="checks__mark">{c.ok ? '✓' : '○'}</span>
              <span>{c.label}</span>
              {c.detail && <span className="muted small">{c.detail}</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <div className="card__head">
          <h3>LinkedIn 초안</h3>
          <div className="inspector__actions">
            <button type="button" className="btn btn--sm btn--primary" onClick={copyDraft}>{copied ? '복사됨 ✓' : '복사'}</button>
            <button type="button" className="btn btn--sm" onClick={downloadDraft}>.md 저장</button>
          </div>
        </div>
        <textarea className="input export__draft" readOnly value={draft} rows={18} />
        <p className="muted small">문제 정의 · 내 IA · 블록 · 핀 · 비교 수치 · 비교 글 · 코멘트를 모아 만든 초안입니다. 글을 올릴 때는 "비교 이미지 PNG" 와 "내 와이어프레임 PNG" 를 함께 첨부하세요.</p>
      </section>
    </div>
  );
}

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BLOCK_STYLE, BLOCK_TYPE_IDS, styleOf } from '../lib/blockTypes';
import { uid, blockLint, orderedNodes } from '../lib/study';
import { renderStudyImage, downloadBlob, safeFilename } from '../lib/exportImage';

// 피그마처럼 스크린샷 위에 직접 와이어프레임을 그리는 캔버스.
// 좌표는 모두 스크린샷 기준 퍼센트(0~100)라서 AI 블록(analysis.wireframe.blocks)과 그대로 비교할 수 있다.

const TOOLS = [
  { id: 'select', label: '선택', key: 'V', hint: '클릭해서 선택, 드래그로 이동' },
  { id: 'block', label: '블록', key: 'R', hint: '드래그로 영역을 그립니다' },
  { id: 'text', label: '텍스트', key: 'T', hint: '클릭한 곳에 메모 텍스트' },
  { id: 'pen', label: '펜', key: 'P', hint: '자유롭게 선을 긋습니다' },
  { id: 'pin', label: '핀', key: 'C', hint: '클릭한 지점에 번호 핀을 꽂고 코멘트를 남깁니다' },
];
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round = (v) => Math.round(v * 100) / 100;

function moveItem(item, dx, dy) {
  if (item.kind === 'pen') {
    return { ...item, points: item.points.map(([x, y]) => [round(clamp(x + dx, 0, 100)), round(clamp(y + dy, 0, 100))]) };
  }
  if (item.kind === 'pin') {
    return { ...item, x: round(clamp(item.x + dx, 0, 100)), y: round(clamp(item.y + dy, 0, 100)) };
  }
  const x = clamp(item.x + dx, 0, 100 - item.w);
  const y = clamp(item.y + dy, 0, 100 - item.h);
  return { ...item, x: round(x), y: round(y) };
}

function resizeItem(item, handle, dx, dy) {
  let { x, y, w, h } = item;
  if (handle.includes('e')) w += dx;
  if (handle.includes('s')) h += dy;
  if (handle.includes('w')) { x += dx; w -= dx; }
  if (handle.includes('n')) { y += dy; h -= dy; }
  if (w < 1) { if (handle.includes('w')) x = item.x + item.w - 1; w = 1; }
  if (h < 1) { if (handle.includes('n')) y = item.y + item.h - 1; h = 1; }
  x = clamp(x, 0, 100 - 1); y = clamp(y, 0, 100 - 1);
  w = clamp(w, 1, 100 - x); h = clamp(h, 1, 100 - y);
  return { ...item, x: round(x), y: round(y), w: round(w), h: round(h) };
}

export default function Studio({ screenshotUrl, pageWidth, pageHeight, drawing, iaNodes, title, onChange, onToast }) {
  const shapes = drawing.shapes;
  const pins = drawing.pins;
  const [tool, setTool] = useState('select');
  const [selectedId, setSelectedId] = useState(null);
  const [preview, setPreview] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [shotOpacity, setShotOpacity] = useState(1);
  const [grid, setGrid] = useState(false);
  const [exporting, setExporting] = useState(false);
  const canvasRef = useRef(null);
  const dragRef = useRef(null);
  const previewRef = useRef(null);
  const labelRef = useRef(null);
  const past = useRef([]);
  const future = useRef([]);
  const [, bump] = useState(0);

  const ratio = pageWidth && pageHeight ? pageHeight / pageWidth : 2;
  const H = 100 * ratio;
  const infoNodes = useMemo(() => orderedNodes(iaNodes || []), [iaNodes]);

  const setPreviewBoth = (v) => {
    previewRef.current = typeof v === 'function' ? v(previewRef.current) : v;
    setPreview(previewRef.current);
  };

  // ---- 히스토리 ----
  const commit = useCallback((next) => {
    past.current.push(drawing);
    if (past.current.length > 60) past.current.shift();
    future.current = [];
    onChange(next);
    bump((n) => n + 1);
  }, [drawing, onChange]);
  const undo = useCallback(() => {
    if (!past.current.length) return;
    future.current.push(drawing);
    onChange(past.current.pop());
    setSelectedId(null);
    bump((n) => n + 1);
  }, [drawing, onChange]);
  const redo = useCallback(() => {
    if (!future.current.length) return;
    past.current.push(drawing);
    onChange(future.current.pop());
    setSelectedId(null);
    bump((n) => n + 1);
  }, [drawing, onChange]);

  const selectedShape = shapes.find((s) => s.id === selectedId) || null;
  const selectedPin = pins.find((p) => p.id === selectedId) || null;

  const patchShape = (id, patch) => onChange({ ...drawing, shapes: shapes.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const patchPin = (id, patch) => onChange({ ...drawing, pins: pins.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  const removeSelected = useCallback(() => {
    if (!selectedId) return;
    commit({ shapes: shapes.filter((s) => s.id !== selectedId), pins: pins.filter((p) => p.id !== selectedId) });
    setSelectedId(null);
  }, [selectedId, shapes, pins, commit]);
  const duplicateSelected = () => {
    if (!selectedShape) return;
    const copy = moveItem({ ...selectedShape, id: uid() }, 2, 2);
    commit({ ...drawing, shapes: [...shapes, copy] });
    setSelectedId(copy.id);
  };
  const clearAll = () => {
    if (!shapes.length && !pins.length) return;
    if (!window.confirm('그린 도형과 핀을 모두 지울까요? (실행 취소 가능)')) return;
    commit({ shapes: [], pins: [] });
    setSelectedId(null);
  };
  const focusLabel = () => setTimeout(() => labelRef.current && labelRef.current.focus(), 0);

  // ---- 포인터 ----
  const toPct = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: clamp(((e.clientX - r.left) / r.width) * 100, 0, 100), y: clamp(((e.clientY - r.top) / r.height) * 100, 0, 100) };
  };
  const capture = (e) => { try { canvasRef.current.setPointerCapture(e.pointerId); } catch { /* ignore */ } };

  const onCanvasDown = (e) => {
    if (e.button !== 0) return;
    const p = toPct(e);
    if (tool === 'block') {
      capture(e);
      dragRef.current = { mode: 'draw', start: p };
      setPreviewBoth({ id: 'new', kind: 'block', x: p.x, y: p.y, w: 0, h: 0, type: 'content' });
    } else if (tool === 'pen') {
      capture(e);
      dragRef.current = { mode: 'pen' };
      setPreviewBoth({ id: 'new', kind: 'pen', points: [[round(p.x), round(p.y)]], color: '#e03131' });
    } else if (tool === 'text') {
      const s = { id: uid(), kind: 'text', x: round(clamp(p.x, 0, 78)), y: round(clamp(p.y, 0, 96)), w: 22, h: 3.5, text: '메모를 입력하세요' };
      commit({ ...drawing, shapes: [...shapes, s] });
      setSelectedId(s.id); setTool('select'); focusLabel();
    } else if (tool === 'pin') {
      const pin = { id: uid(), x: round(p.x), y: round(p.y), text: '', created_at: new Date().toISOString() };
      commit({ ...drawing, pins: [...pins, pin] });
      setSelectedId(pin.id); setTool('select'); focusLabel();
    } else {
      setSelectedId(null);
    }
  };
  const onItemDown = (e, item) => {
    if (tool !== 'select' || e.button !== 0) return; // 다른 도구일 때는 캔버스가 처리(겹쳐 그리기)
    e.stopPropagation();
    capture(e);
    setSelectedId(item.id);
    dragRef.current = { mode: 'move', id: item.id, start: toPct(e), orig: item, moved: false };
  };
  const onHandleDown = (e, item, handle) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    capture(e);
    dragRef.current = { mode: 'resize', id: item.id, handle, start: toPct(e), orig: item };
  };
  const onMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const p = toPct(e);
    if (d.mode === 'draw') {
      setPreviewBoth({ id: 'new', kind: 'block', type: 'content', x: Math.min(d.start.x, p.x), y: Math.min(d.start.y, p.y), w: Math.abs(p.x - d.start.x), h: Math.abs(p.y - d.start.y) });
    } else if (d.mode === 'pen') {
      setPreviewBoth((pr) => ({ ...pr, points: [...pr.points, [round(p.x), round(p.y)]] }));
    } else if (d.mode === 'move') {
      const dx = p.x - d.start.x; const dy = p.y - d.start.y;
      if (Math.abs(dx) + Math.abs(dy) > 0.15) d.moved = true;
      setPreviewBoth(moveItem(d.orig, dx, dy));
    } else if (d.mode === 'resize') {
      setPreviewBoth(resizeItem(d.orig, d.handle, p.x - d.start.x, p.y - d.start.y));
    }
  };
  const onUp = (e) => {
    const d = dragRef.current;
    dragRef.current = null;
    try { canvasRef.current.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    const pr = previewRef.current;
    setPreviewBoth(null);
    if (!d || !pr) return;
    if (d.mode === 'draw') {
      if (pr.w >= 1 && pr.h >= 1) {
        const n = shapes.filter((s) => s.kind === 'block').length + 1;
        const s = { id: uid(), kind: 'block', x: round(pr.x), y: round(pr.y), w: round(pr.w), h: round(pr.h), label: `블록 ${n}`, type: 'content', role: 'info', content: '', states: '', ia_id: '', note: '' };
        commit({ ...drawing, shapes: [...shapes, s] });
        setSelectedId(s.id); setTool('select'); focusLabel();
      }
    } else if (d.mode === 'pen') {
      if (pr.points.length >= 2) commit({ ...drawing, shapes: [...shapes, { ...pr, id: uid() }] });
    } else if (d.mode === 'move' || d.mode === 'resize') {
      if (d.mode === 'move' && !d.moved) return;
      if (pr.kind === 'pin') commit({ ...drawing, pins: pins.map((p) => (p.id === pr.id ? { ...p, x: pr.x, y: pr.y } : p)) });
      else commit({ ...drawing, shapes: shapes.map((s) => (s.id === pr.id ? pr : s)) });
    }
  };

  // ---- 단축키 ----
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) {
        if (e.key === 'Escape') t.blur(); // 입력 중 Esc → 포커스를 캔버스로 돌려 단축키를 쓸 수 있게
        return;
      }
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { if (selectedId) { e.preventDefault(); removeSelected(); } return; }
      if (e.key === 'Escape') { setSelectedId(null); setTool('select'); return; }
      const found = TOOLS.find((x) => x.key.toLowerCase() === k);
      if (found) setTool(found.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, undo, redo, removeSelected]);

  const exportPng = async () => {
    setExporting(true);
    try {
      const blob = await renderStudyImage({ screenshotUrl, width: pageWidth, height: pageHeight, shapes, pins, screenshotOpacity: shotOpacity });
      downloadBlob(blob, `${safeFilename(title)} - 내 와이어프레임.png`);
    } catch (err) {
      onToast && onToast(err.message, 'error');
    } finally {
      setExporting(false);
    }
  };

  // ---- 렌더 ----
  const renderShapes = preview && preview.id !== 'new'
    ? shapes.map((s) => (s.id === preview.id ? preview : s))
    : preview && preview.kind !== 'pin' ? [...shapes, preview] : shapes;
  const renderPins = preview && preview.kind === 'pin' ? pins.map((p) => (p.id === preview.id ? preview : p)) : pins;
  const blocks = shapes.filter((s) => s.kind === 'block');
  const components = blocks.filter((b) => b.role === 'component');
  const lintRows = blocks.map((b) => ({ block: b, issues: blockLint(b) })).filter((r) => r.issues.length);
  const pxW = (w) => (pageWidth ? Math.round((w / 100) * pageWidth) : null);
  const pxH = (h) => (pageHeight ? Math.round((h / 100) * pageHeight) : null);
  const zoomIndex = ZOOMS.indexOf(zoom);

  return (
    <div className="studio">
      <div className="toolbar studio__toolbar">
        <div className="segmented">
          {TOOLS.map((t) => (
            <button key={t.id} type="button" className={tool === t.id ? 'active' : ''} title={`${t.hint} (${t.key})`} onClick={() => setTool(t.id)}>{t.label}</button>
          ))}
        </div>
        <button type="button" className="btn btn--sm" onClick={undo} disabled={!past.current.length} title="실행 취소 (Ctrl+Z)">↶</button>
        <button type="button" className="btn btn--sm" onClick={redo} disabled={!future.current.length} title="다시 실행 (Ctrl+Shift+Z)">↷</button>
        <span className="muted small studio__hint">{TOOLS.find((t) => t.id === tool)?.hint}</span>
        <div className="toolbar__spacer" />
        <label className="checkbox" title="스크린샷 투명도 (0 이면 와이어프레임만 보입니다)">
          스크린샷
          <input type="range" min="0" max="1" step="0.05" value={shotOpacity} onChange={(e) => setShotOpacity(parseFloat(e.target.value))} />
        </label>
        <label className="checkbox" title="12 컬럼 그리드">
          <input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} />
          그리드
        </label>
        <div className="segmented" title="확대/축소">
          <button type="button" onClick={() => setZoom(ZOOMS[Math.max(0, zoomIndex - 1)])} disabled={zoomIndex <= 0}>−</button>
          <button type="button" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
          <button type="button" onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, zoomIndex + 1)])} disabled={zoomIndex >= ZOOMS.length - 1}>+</button>
        </div>
        <button type="button" className="btn btn--sm" onClick={exportPng} disabled={exporting}>{exporting ? '내보내는 중…' : 'PNG 내보내기'}</button>
        <button type="button" className="btn btn--sm btn--ghost" onClick={clearAll} disabled={!shapes.length && !pins.length}>전체 지우기</button>
      </div>

      <div className="studio__body">
        <div className="studio__canvas-wrap">
          <div
            ref={canvasRef}
            className={`studio__canvas studio__canvas--${tool}`}
            style={{ width: `${zoom * 100}%`, aspectRatio: `100 / ${H}` }}
            onPointerDown={onCanvasDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            {screenshotUrl && <img src={screenshotUrl} alt="" className="studio__bg" style={{ opacity: shotOpacity }} draggable={false} />}
            {grid && <div className="studio__grid" />}

            {renderShapes.filter((s) => s.kind === 'block' || s.kind === 'text').map((s) => {
              const sel = s.id === selectedId;
              const st = styleOf(s.type);
              const isBlock = s.kind === 'block';
              return (
                <div
                  key={s.id}
                  className={`shape shape--${s.kind}${sel ? ' shape--selected' : ''}${s.role === 'component' ? ' shape--component' : ''}`}
                  style={{
                    left: `${s.x}%`, top: `${s.y}%`, width: `${s.w}%`, height: `${s.h}%`,
                    ...(isBlock ? { borderColor: st.color, background: `${st.color}1f` } : {}),
                  }}
                  onPointerDown={(e) => onItemDown(e, s)}
                  onDoubleClick={(e) => { e.stopPropagation(); setSelectedId(s.id); focusLabel(); }}
                  title={isBlock ? `${s.label} · ${st.label}` : s.text}
                >
                  {isBlock ? (
                    <div className="shape__inner">
                      <div className="shape__label">
                        <span className={`role role--${s.role || 'info'}`}>{s.role === 'component' ? '컴포넌트' : '정보'}</span>
                        <span>{s.label || '(라벨 없음)'}</span>
                      </div>
                      {s.content && <div className="shape__content">{s.content}</div>}
                    </div>
                  ) : (
                    <div className="shape__text">{s.text}</div>
                  )}
                  {sel && HANDLES.map((h) => (
                    <i key={h} className={`handle handle--${h}`} onPointerDown={(e) => onHandleDown(e, s, h)} />
                  ))}
                </div>
              );
            })}

            <svg className="studio__ink" viewBox={`0 0 100 ${H}`} preserveAspectRatio="none">
              {renderShapes.filter((s) => s.kind === 'pen').map((s) => (
                <polyline
                  key={s.id}
                  points={s.points.map(([x, y]) => `${x},${y * ratio}`).join(' ')}
                  fill="none"
                  stroke={s.color || '#e03131'}
                  strokeWidth={s.id === selectedId ? 4 : 2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  style={{ pointerEvents: tool === 'select' ? 'visibleStroke' : 'none', cursor: 'move' }}
                  onPointerDown={(e) => onItemDown(e, s)}
                />
              ))}
            </svg>

            {renderPins.map((pin, i) => (
              <div
                key={pin.id}
                className={`pin${pin.id === selectedId ? ' pin--selected' : ''}`}
                style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                onPointerDown={(e) => onItemDown(e, { ...pin, kind: 'pin' })}
                onDoubleClick={(e) => { e.stopPropagation(); setSelectedId(pin.id); focusLabel(); }}
                title={pin.text || '핀 코멘트'}
              >
                {i + 1}
              </div>
            ))}
          </div>
        </div>

        <aside className="studio__side">
          {selectedShape && selectedShape.kind === 'block' && (
            <div className="inspector">
              <div className="inspector__head">
                <h4>블록 속성</h4>
                <span className="muted small">{pxW(selectedShape.w)}×{pxH(selectedShape.h)}px · x {pxW(selectedShape.x)} / y {pxH(selectedShape.y)}</span>
              </div>
              <label className="field"><span className="field__label">라벨</span>
                <input ref={labelRef} className="input" value={selectedShape.label || ''} onChange={(e) => patchShape(selectedShape.id, { label: e.target.value })} placeholder="예: 상단 내비게이션" />
              </label>
              <div className="field__grid">
                <label className="field"><span className="field__label">종류</span>
                  <select className="input" value={selectedShape.type || 'content'} onChange={(e) => patchShape(selectedShape.id, { type: e.target.value })}>
                    {BLOCK_TYPE_IDS.map((t) => <option key={t} value={t}>{BLOCK_STYLE[t].label}</option>)}
                  </select>
                </label>
                <div className="field"><span className="field__label">역할</span>
                  <div className="segmented">
                    <button type="button" className={selectedShape.role !== 'component' ? 'active' : ''} onClick={() => patchShape(selectedShape.id, { role: 'info' })} title="사용자에게 전달하는 정보">정보</button>
                    <button type="button" className={selectedShape.role === 'component' ? 'active' : ''} onClick={() => patchShape(selectedShape.id, { role: 'component' })} title="버튼·탭·입력창 같은 UI 부품">컴포넌트</button>
                  </div>
                </div>
              </div>
              <label className="field"><span className="field__label">실제 문구 <span className="muted">(더미 금지)</span></span>
                <textarea className="input" rows={2} value={selectedShape.content || ''} onChange={(e) => patchShape(selectedShape.id, { content: e.target.value })} placeholder="화면에 실제로 보이는 문장·숫자·라벨을 그대로 적으세요" />
              </label>
              <label className="field"><span className="field__label">노출 조건 / 상태 케이스 <span className="muted">(한 줄에 하나)</span></span>
                <textarea className="input" rows={3} value={selectedShape.states || ''} onChange={(e) => patchShape(selectedShape.id, { states: e.target.value })} placeholder={'예:\n로그인 시에만 노출\n재고 없음 → 버튼 disabled\n모바일에서는 숨김'} />
              </label>
              <label className="field"><span className="field__label">연결할 내 IA 노드</span>
                <select className="input" value={selectedShape.ia_id || ''} onChange={(e) => patchShape(selectedShape.id, { ia_id: e.target.value })}>
                  <option value="">(없음)</option>
                  {infoNodes.map(({ node, depth }) => <option key={node.id} value={node.id}>{'　'.repeat(depth - 1)}{node.name || '(이름 없음)'}</option>)}
                </select>
              </label>
              <label className="field"><span className="field__label">메모</span>
                <textarea className="input" rows={2} value={selectedShape.note || ''} onChange={(e) => patchShape(selectedShape.id, { note: e.target.value })} placeholder="왜 이렇게 나눴는지, 궁금한 점" />
              </label>
              {blockLint(selectedShape).map((i) => <p key={i.code} className="lint">{i.message}</p>)}
              <div className="inspector__actions">
                <button type="button" className="btn btn--sm" onClick={duplicateSelected}>복제</button>
                <button type="button" className="btn btn--sm btn--ghost link--danger" onClick={removeSelected}>삭제</button>
              </div>
            </div>
          )}

          {selectedShape && selectedShape.kind === 'text' && (
            <div className="inspector">
              <h4>텍스트</h4>
              <textarea ref={labelRef} className="input" rows={4} value={selectedShape.text || ''} onChange={(e) => patchShape(selectedShape.id, { text: e.target.value })} />
              <div className="inspector__actions">
                <button type="button" className="btn btn--sm" onClick={duplicateSelected}>복제</button>
                <button type="button" className="btn btn--sm btn--ghost link--danger" onClick={removeSelected}>삭제</button>
              </div>
            </div>
          )}

          {selectedShape && selectedShape.kind === 'pen' && (
            <div className="inspector">
              <h4>펜 선</h4>
              <label className="field"><span className="field__label">색</span>
                <div className="swatches">
                  {['#e03131', '#1b1f24', '#4c6ef5', '#2f9e44', '#f59f00'].map((c) => (
                    <button key={c} type="button" className={`swatch${(selectedShape.color || '#e03131') === c ? ' swatch--active' : ''}`} style={{ background: c }} onClick={() => patchShape(selectedShape.id, { color: c })} />
                  ))}
                </div>
              </label>
              <div className="inspector__actions">
                <button type="button" className="btn btn--sm btn--ghost link--danger" onClick={removeSelected}>삭제</button>
              </div>
            </div>
          )}

          {selectedPin && (
            <div className="inspector">
              <h4>핀 {pins.indexOf(selectedPin) + 1} 코멘트</h4>
              <textarea ref={labelRef} className="input" rows={5} value={selectedPin.text || ''} onChange={(e) => patchPin(selectedPin.id, { text: e.target.value })} placeholder="이 지점에서 관찰한 것, 질문, 개선 아이디어" />
              <div className="inspector__actions">
                <button type="button" className="btn btn--sm btn--ghost link--danger" onClick={removeSelected}>삭제</button>
              </div>
            </div>
          )}

          {!selectedShape && !selectedPin && (
            <div className="inspector">
              <h4>내 와이어프레임</h4>
              <p className="small">
                블록 {blocks.length}개 (정보 {blocks.length - components.length} / 컴포넌트 {components.length}) · 핀 {pins.length}개
                {pageWidth ? <> · 캡처 폭 {pageWidth}px</> : null}
              </p>
              {blocks.length === 0 && (
                <p className="muted small">
                  <strong>블록(R)</strong> 도구로 스크린샷 위에 영역을 드래그하세요. 컴포넌트가 보이도록 버튼·입력창까지 그리고, 더미 대신 실제 문구를 적는 것이 연습의 핵심입니다.
                </p>
              )}
              {lintRows.length > 0 && (
                <div className="lint-list">
                  {lintRows.map(({ block, issues }) => (
                    <button key={block.id} type="button" className="lint lint--btn" onClick={() => setSelectedId(block.id)}>
                      <strong>{block.label}</strong> · {issues.map((i) => i.message).join(' ')}
                    </button>
                  ))}
                </div>
              )}
              {blocks.length > 0 && (
                <ol className="block-list">
                  {blocks.map((b) => (
                    <li key={b.id} className="block-list__item" onClick={() => setSelectedId(b.id)}>
                      <span className="block-list__swatch" style={{ background: styleOf(b.type).color }} />
                      <div>
                        <div className="block-list__label">{b.label} <span className="muted">· {styleOf(b.type).label} · {b.role === 'component' ? '컴포넌트' : '정보'}</span></div>
                        {b.content && <div className="block-list__desc">{b.content}</div>}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              {pins.length > 0 && (
                <>
                  <h4>핀 코멘트</h4>
                  <ol className="pin-list">
                    {pins.map((p, i) => (
                      <li key={p.id} onClick={() => setSelectedId(p.id)}><strong>{i + 1}</strong> {p.text || <span className="muted">(비어 있음)</span>}</li>
                    ))}
                  </ol>
                </>
              )}
              <p className="muted small">단축키: V 선택 · R 블록 · T 텍스트 · P 펜 · C 핀 · Delete 삭제 · Ctrl+Z 실행 취소</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

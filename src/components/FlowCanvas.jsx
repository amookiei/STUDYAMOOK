import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { uid } from '../lib/study';
import { NODE_W, functionUnitsOf, unitLabel, nextNodePosition, buildFlowMarkdown } from '../lib/flow';

// 여러 페이지(레퍼런스)를 노드로 놓고, 기능 단위 블록에서 다음 페이지로 연결선을 긋는 캔버스.
// 연결은 "정보/기능 단위" 블록에서만 출발한다. 컴포넌트(버튼 등)는 연결 지점이 아니다.
//
// 마우스 조작은 피그마와 같게 맞춘다:
//   휠 = 위아래 이동 · Shift+휠 = 좌우 이동 · Ctrl/⌘+휠(핀치) = 커서 기준 확대/축소
//   Space+드래그 / 가운데 버튼 드래그 = 손 도구(화면 이동) · 빈 곳 드래그 = 범위 선택
//   클릭 = 선택 · Shift+클릭 = 추가/해제 · 선택한 노드 드래그 = 함께 이동 · 더블클릭 = 상세 열기
//   Delete/Backspace = 삭제 · Esc = 선택 해제 · Ctrl+A = 전체 선택
//   Ctrl+0 = 100% · Ctrl+(+)/(-) = 확대/축소 · Shift+1 = 전체 맞춤 · Shift+2 = 선택 맞춤
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;
const ZOOM_STEPS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url || ''; } }

export default function FlowCanvas({ flow, refsById, studiesById, allReferences, saveState, onChange, onOpenNode, onDeleteFlow, onToast }) {
  const canvasRef = useRef(null); // 뷰포트 (스크롤 대신 transform 으로 이동/확대)
  const portRefs = useRef(new Map());
  const nodeRefs = useRef(new Map());
  const dragRef = useRef(null);
  const viewRef = useRef({ x: 40, y: 40, z: 1 });
  const [view, setViewState] = useState(viewRef.current); // { x, y, z }: 화면 = 월드 * z + (x, y)
  const [geom, setGeom] = useState({ ports: {}, nodes: {} });
  const [selectedIds, setSelectedIds] = useState([]); // 선택한 노드 id 들
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [connecting, setConnecting] = useState(null); // { fromNode, block, source, x1, y1, x2, y2 } (월드 좌표)
  const [marquee, setMarquee] = useState(null); // { x0, y0, x1, y1 } (월드 좌표)
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);
  const [dragTick, setDragTick] = useState(0);
  const [addRefId, setAddRefId] = useState('');
  const [copied, setCopied] = useState(false);

  const setView = useCallback((next) => {
    const v = typeof next === 'function' ? next(viewRef.current) : next;
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.z));
    viewRef.current = { x: v.x, y: v.y, z };
    setViewState(viewRef.current);
  }, []);
  const selected = selectedEdgeId ? { type: 'edge', id: selectedEdgeId } : selectedIds.length === 1 ? { type: 'node', id: selectedIds[0] } : null;
  const setSelected = (sel) => {
    if (!sel) { setSelectedIds([]); setSelectedEdgeId(null); }
    else if (sel.type === 'edge') { setSelectedIds([]); setSelectedEdgeId(sel.id); }
    else { setSelectedIds([sel.id]); setSelectedEdgeId(null); }
  };

  const nodeById = useMemo(() => Object.fromEntries(flow.nodes.map((n) => [n.id, n])), [flow.nodes]);
  const units = useMemo(() => {
    const map = {};
    for (const n of flow.nodes) map[n.id] = functionUnitsOf(refsById[n.reference_id], studiesById[n.reference_id]);
    return map;
  }, [flow.nodes, refsById, studiesById]);
  const usedRefIds = new Set(flow.nodes.map((n) => n.reference_id));
  const addable = (allReferences || []).filter((r) => !usedRefIds.has(r.id));

  // 포트/노드 위치 측정 (엣지는 SVG 로 그리므로 DOM 좌표가 필요하다)
  useLayoutEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const cr = c.getBoundingClientRect();
    const { x: vx, y: vy, z } = viewRef.current;
    const ports = {};
    const nodes = {};
    portRefs.current.forEach((el, key) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      ports[key] = { x: (r.left + r.width / 2 - cr.left - vx) / z, y: (r.top + r.height / 2 - cr.top - vy) / z };
    });
    nodeRefs.current.forEach((el, key) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      nodes[key] = { x: (r.left - cr.left - vx) / z, y: (r.top - cr.top - vy) / z, w: r.width / z, h: r.height / z };
    });
    setGeom((g) => (JSON.stringify(g.ports) === JSON.stringify(ports) && JSON.stringify(g.nodes) === JSON.stringify(nodes) ? g : { ports, nodes }));
  }, [flow.nodes, flow.edges, units, dragTick, view]);

  // 화면 좌표 → 월드 좌표
  const toCanvas = (e) => {
    const cr = canvasRef.current.getBoundingClientRect();
    const { x, y, z } = viewRef.current;
    return { x: (e.clientX - cr.left - x) / z, y: (e.clientY - cr.top - y) / z };
  };

  // ---- 확대/축소/이동 ----
  const zoomAt = useCallback((factor, clientX, clientY) => {
    const cr = canvasRef.current.getBoundingClientRect();
    const cx = clientX == null ? cr.width / 2 : clientX - cr.left;
    const cy = clientY == null ? cr.height / 2 : clientY - cr.top;
    setView((v) => {
      const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.z * factor));
      const k = z / v.z;
      return { x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k, z };
    });
  }, [setView]);
  const zoomTo = useCallback((z) => zoomAt(z / viewRef.current.z), [zoomAt]);
  const fitTo = useCallback((ids) => {
    const boxes = Object.entries(geom.nodes).filter(([id]) => !ids || ids.includes(id)).map(([, b]) => b);
    const c = canvasRef.current;
    if (!boxes.length || !c) return;
    const minX = Math.min(...boxes.map((b) => b.x)); const minY = Math.min(...boxes.map((b) => b.y));
    const maxX = Math.max(...boxes.map((b) => b.x + b.w)); const maxY = Math.max(...boxes.map((b) => b.y + b.h));
    const cr = c.getBoundingClientRect();
    const pad = 60;
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min((cr.width - pad * 2) / (maxX - minX), (cr.height - pad * 2) / (maxY - minY), 1.5)));
    setView({ z, x: (cr.width - (maxX - minX) * z) / 2 - minX * z, y: (cr.height - (maxY - minY) * z) / 2 - minY * z });
  }, [geom.nodes, setView]);

  // 휠: 이동 / Shift+휠: 좌우 / Ctrl(⌘)+휠·핀치: 커서 기준 확대. (React 의 onWheel 은 passive 라 preventDefault 가 안 되므로 직접 붙인다)
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0025));
        zoomAt(factor, e.clientX, e.clientY);
        return;
      }
      const dx = e.shiftKey && e.deltaX === 0 ? e.deltaY : e.deltaX;
      const dy = e.shiftKey && e.deltaX === 0 ? 0 : e.deltaY;
      setView((v) => ({ ...v, x: v.x - dx, y: v.y - dy }));
    };
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  }, [zoomAt, setView]);

  const startPan = (e) => {
    dragRef.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, ox: viewRef.current.x, oy: viewRef.current.y };
    setPanning(true);
    canvasRef.current.setPointerCapture(e.pointerId);
  };

  // ---- 노드 선택/드래그 ----
  const onNodeDown = (e, node) => {
    if (e.button === 1 || (e.button === 0 && spaceHeld)) { e.stopPropagation(); e.preventDefault(); startPan(e); return; }
    if (e.button !== 0) return;
    if (e.target.closest('button, a, .port')) return;
    e.stopPropagation();
    let ids;
    if (e.shiftKey) {
      ids = selectedIds.includes(node.id) ? selectedIds.filter((id) => id !== node.id) : [...selectedIds, node.id];
      setSelectedIds(ids); setSelectedEdgeId(null);
      if (!ids.includes(node.id)) return; // 해제만 하고 드래그는 시작하지 않는다
    } else {
      ids = selectedIds.includes(node.id) ? selectedIds : [node.id];
      setSelectedIds(ids); setSelectedEdgeId(null);
    }
    const p = toCanvas(e);
    const orig = Object.fromEntries(flow.nodes.filter((n) => ids.includes(n.id)).map((n) => [n.id, { x: n.x, y: n.y }]));
    dragRef.current = { mode: 'node', ids, start: p, orig, moved: false };
    canvasRef.current.setPointerCapture(e.pointerId);
  };
  // 빈 캔버스: 손 도구(Space/가운데 버튼) 또는 범위 선택
  const onCanvasDown = (e) => {
    if (e.target.closest('.flow-node, .flow-edge, .flow__zoom')) return;
    if (e.button === 1 || (e.button === 0 && spaceHeld)) { e.preventDefault(); startPan(e); return; }
    if (e.button !== 0) return;
    const p = toCanvas(e);
    dragRef.current = { mode: 'marquee', start: p, additive: e.shiftKey, base: e.shiftKey ? selectedIds : [] };
    if (!e.shiftKey) { setSelectedIds([]); setSelectedEdgeId(null); }
    canvasRef.current.setPointerCapture(e.pointerId);
  };
  // ---- 포트에서 연결선 끌기 ----
  const onPortDown = (e, node, unit) => {
    if (e.button !== 0 || spaceHeld) return;
    e.stopPropagation();
    const p = toCanvas(e);
    dragRef.current = { mode: 'connect' };
    setConnecting({ fromNode: node.id, block: unit.id, source: unit.source, x1: p.x, y1: p.y, x2: p.x, y2: p.y });
    canvasRef.current.setPointerCapture(e.pointerId);
  };
  const onMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    if (d.mode === 'pan') {
      setView((v) => ({ ...v, x: d.ox + (e.clientX - d.sx), y: d.oy + (e.clientY - d.sy) }));
      return;
    }
    const p = toCanvas(e);
    if (d.mode === 'node') {
      const dx = p.x - d.start.x; const dy = p.y - d.start.y;
      if (Math.abs(dx) + Math.abs(dy) > 1) d.moved = true;
      if (!d.moved) return;
      onChange({ ...flow, nodes: flow.nodes.map((n) => (d.orig[n.id] ? { ...n, x: Math.round(d.orig[n.id].x + dx), y: Math.round(d.orig[n.id].y + dy) } : n)) }, { silent: true });
      setDragTick((t) => t + 1);
    } else if (d.mode === 'connect') {
      setConnecting((c) => (c ? { ...c, x2: p.x, y2: p.y } : c));
    } else if (d.mode === 'marquee') {
      const box = { x0: Math.min(d.start.x, p.x), y0: Math.min(d.start.y, p.y), x1: Math.max(d.start.x, p.x), y1: Math.max(d.start.y, p.y) };
      setMarquee(box);
      const hit = Object.entries(geom.nodes).filter(([, b]) => b.x < box.x1 && b.x + b.w > box.x0 && b.y < box.y1 && b.y + b.h > box.y0).map(([id]) => id);
      setSelectedIds(Array.from(new Set([...d.base, ...hit])));
    }
  };
  const onUp = (e) => {
    const d = dragRef.current;
    dragRef.current = null;
    try { canvasRef.current.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (!d) return;
    if (d.mode === 'pan') { setPanning(false); return; }
    if (d.mode === 'marquee') { setMarquee(null); return; }
    if (d.mode === 'node') {
      if (d.moved) onChange({ ...flow }); // 이동 결과 저장
      return;
    }
    if (d.mode === 'connect' && connecting) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const target = el && el.closest('[data-node-id]');
      const toId = target && target.getAttribute('data-node-id');
      const c = connecting;
      setConnecting(null);
      if (!toId) return;
      if (toId === c.fromNode) { onToast && onToast('같은 페이지로는 연결할 수 없습니다.', 'error'); return; }
      if (flow.edges.some((x) => x.from.node === c.fromNode && x.from.block === c.block && x.to.node === toId)) return;
      const from = nodeById[c.fromNode];
      const label = unitLabel(refsById[from.reference_id], studiesById[from.reference_id], { block: c.block, source: c.source });
      const edge = { id: uid(), from: { node: c.fromNode, block: c.block, source: c.source }, to: { node: toId }, label, condition: '' };
      onChange({ ...flow, edges: [...flow.edges, edge] });
      setSelected({ type: 'edge', id: edge.id });
    }
  };

  // ---- 편집 ----
  const addNode = (refId) => {
    if (!refId || usedRefIds.has(refId)) return;
    const node = { id: uid(), reference_id: refId, ...nextNodePosition(flow.nodes) };
    onChange({ ...flow, nodes: [...flow.nodes, node] });
    setAddRefId('');
    setSelected({ type: 'node', id: node.id });
  };
  const removeNodes = (ids) => {
    if (!ids.length) return;
    const names = ids.map((id) => { const r = refsById[nodeById[id]?.reference_id]; return r ? (r.title || r.url) : '이 페이지'; });
    const label = ids.length === 1 ? `"${names[0]}" 노드와 연결선을` : `노드 ${ids.length}개와 연결선을`;
    if (!window.confirm(`${label} 플로우에서 뺄까요? (레퍼런스 자체는 남습니다)`)) return;
    const gone = new Set(ids);
    onChange({ ...flow, nodes: flow.nodes.filter((n) => !gone.has(n.id)), edges: flow.edges.filter((e) => !gone.has(e.from.node) && !gone.has(e.to.node)) });
    setSelected(null);
  };
  const removeNode = (id) => removeNodes([id]);
  const patchEdge = (id, patch) => onChange({ ...flow, edges: flow.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  const removeEdge = (id) => { onChange({ ...flow, edges: flow.edges.filter((e) => e.id !== id) }); setSelected(null); };
  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(buildFlowMarkdown(flow, refsById, studiesById));
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch (err) { onToast && onToast(`복사 실패: ${err.message}`, 'error'); }
  };

  // ---- 단축키 (입력창 밖에서만) ----
  useEffect(() => {
    const inField = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    const onKeyDown = (e) => {
      if (inField(e.target)) { if (e.key === 'Escape') e.target.blur(); return; }
      if (e.code === 'Space') { if (!e.repeat) setSpaceHeld(true); e.preventDefault(); return; }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === '0') { e.preventDefault(); zoomTo(1); return; }
      if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomAt(1.25); return; }
      if (mod && e.key === '-') { e.preventDefault(); zoomAt(0.8); return; }
      if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); setSelectedIds(flow.nodes.map((n) => n.id)); setSelectedEdgeId(null); return; }
      if (e.shiftKey && (e.key === '1' || e.key === '!')) { e.preventDefault(); fitTo(null); return; }
      if (e.shiftKey && (e.key === '2' || e.key === '@')) { e.preventDefault(); if (selectedIds.length) fitTo(selectedIds); return; }
      if (e.key === 'Escape') { setSelected(null); setConnecting(null); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (selectedEdgeId) removeEdge(selectedEdgeId);
        else if (selectedIds.length) removeNodes(selectedIds);
      }
    };
    const onKeyUp = (e) => { if (e.code === 'Space') setSpaceHeld(false); };
    const onBlur = () => setSpaceHeld(false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('blur', onBlur); };
  });

  const edgePath = (e) => {
    const p1 = geom.ports[`${e.from.node}:${e.from.block}`] || (geom.nodes[e.from.node] && { x: geom.nodes[e.from.node].x + geom.nodes[e.from.node].w, y: geom.nodes[e.from.node].y + 40 });
    const n2 = geom.nodes[e.to.node];
    if (!p1 || !n2) return null;
    const x2 = n2.x; const y2 = n2.y + Math.min(60, n2.h / 2);
    const dx = Math.max(60, Math.abs(x2 - p1.x) / 2);
    return { d: `M ${p1.x} ${p1.y} C ${p1.x + dx} ${p1.y}, ${x2 - dx} ${y2}, ${x2} ${y2}`, mx: (p1.x + x2) / 2, my: (p1.y + y2) / 2 };
  };

  const selNode = selected?.type === 'node' ? nodeById[selected.id] : null;
  const selEdge = selected?.type === 'edge' ? flow.edges.find((e) => e.id === selected.id) : null;
  const titleOf = (nodeId) => { const n = nodeById[nodeId]; const r = n && refsById[n.reference_id]; return r ? (r.title || r.url) : '(삭제된 페이지)'; };

  return (
    <div className="flow">
      <div className="toolbar flow__toolbar">
        <input className="input flow__name" value={flow.name} onChange={(e) => onChange({ ...flow, name: e.target.value })} placeholder="플로우 이름 (예: 회원가입 → 첫 결제)" />
        <span className="muted small">페이지 {flow.nodes.length} · 연결 {flow.edges.length}</span>
        <span className={`save-state${saveState ? ` save-state--${saveState.state}` : ''}`}>{saveState ? saveState.label : ''}</span>
        <div className="toolbar__spacer" />
        <select className="input flow__add" value={addRefId} onChange={(e) => addNode(e.target.value)}>
          <option value="">+ 라이브러리에서 페이지 추가…</option>
          {addable.map((r) => <option key={r.id} value={r.id}>{r.title || r.url}</option>)}
        </select>
        <button type="button" className="btn btn--sm" onClick={copySummary}>{copied ? '복사됨 ✓' : '요약 Markdown 복사'}</button>
        <button type="button" className="btn btn--sm btn--ghost link--danger" onClick={onDeleteFlow}>플로우 삭제</button>
      </div>
      <div className="flow__body">
        <div
          ref={canvasRef}
          className={`flow__canvas-wrap${spaceHeld || panning ? ' flow__canvas-wrap--hand' : ''}${panning ? ' flow__canvas-wrap--panning' : ''}`}
          style={{ backgroundSize: `${24 * view.z}px ${24 * view.z}px`, backgroundPosition: `${view.x}px ${view.y}px` }}
          onPointerDown={onCanvasDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="flow__canvas" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}>
            <svg className="flow__edges" width="1" height="1" style={{ overflow: 'visible' }}>
              <defs>
                <marker id="flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#4c6ef5" />
                </marker>
              </defs>
              {flow.edges.map((e) => {
                const g = edgePath(e);
                if (!g) return null;
                const sel = selEdge?.id === e.id;
                return (
                  <g key={e.id} className="flow-edge" onPointerDown={(ev) => { ev.stopPropagation(); setSelected({ type: 'edge', id: e.id }); }}>
                    <path d={g.d} fill="none" stroke="transparent" strokeWidth="14" />
                    <path d={g.d} fill="none" stroke={sel ? '#e03131' : '#4c6ef5'} strokeWidth={sel ? 3 : 2} markerEnd="url(#flow-arrow)" strokeDasharray={e.from.source === 'ai' ? '6 4' : undefined} />
                    <text x={g.mx} y={g.my - 6} fontSize="12" fontWeight="600" textAnchor="middle" fill={sel ? '#e03131' : '#1b1f24'} stroke="#fff" strokeWidth="3" paintOrder="stroke">
                      {e.label}{e.condition ? ` · ${e.condition}` : ''}
                    </text>
                  </g>
                );
              })}
              {connecting && (
                <path d={`M ${connecting.x1} ${connecting.y1} L ${connecting.x2} ${connecting.y2}`} fill="none" stroke="#e03131" strokeWidth="2" strokeDasharray="6 4" />
              )}
              {marquee && (
                <rect x={marquee.x0} y={marquee.y0} width={marquee.x1 - marquee.x0} height={marquee.y1 - marquee.y0} fill="rgba(76,110,245,0.12)" stroke="#4c6ef5" strokeWidth={1 / view.z} />
              )}
            </svg>

            {flow.nodes.map((n) => {
              const r = refsById[n.reference_id];
              const s = studiesById[n.reference_id];
              const u = units[n.id] || { units: [], components: [], fallback: false };
              const sel = selectedIds.includes(n.id);
              const outCount = flow.edges.filter((e) => e.from.node === n.id).length;
              return (
                <div
                  key={n.id}
                  ref={(el) => { if (el) nodeRefs.current.set(n.id, el); else nodeRefs.current.delete(n.id); }}
                  data-node-id={n.id}
                  className={`flow-node${sel ? ' flow-node--selected' : ''}${connecting && connecting.fromNode !== n.id ? ' flow-node--target' : ''}`}
                  style={{ left: n.x, top: n.y, width: NODE_W }}
                  onPointerDown={(e) => onNodeDown(e, n)}
                  onDoubleClick={() => r && onOpenNode(r)}
                >
                  <div className="flow-node__head">
                    <div className="flow-node__title" title={r?.title}>{r ? (r.title || r.url) : '(삭제된 페이지)'}</div>
                    <div className="flow-node__meta muted">{r ? hostOf(r.url) : ''}</div>
                  </div>
                  <div className="flow-node__thumb">
                    {r?.screenshot_url ? <img src={r.screenshot_url} alt="" draggable={false} /> : <div className="muted small">이미지 없음</div>}
                  </div>
                  <div className="flow-node__badges">
                    <span className={`pill ${r?.analysis ? 'pill--ok' : 'pill--warn'}`}>{r?.analysis ? (s?.revealed ? 'AI 분석' : '🔒 AI 분석') : 'AI 분석 없음'}</span>
                    <span className="muted small">내 블록 {(s?.drawing?.shapes || []).filter((x) => x.kind === 'block').length} · 연결 {outCount}</span>
                  </div>
                  <div className="flow-node__units">
                    <div className="flow-node__units-head">{u.fallback ? '기능 단위 (AI 블록, 임시)' : '기능 단위'}</div>
                    {u.units.length === 0 && <div className="muted small flow-node__empty">블록이 없습니다. 상세에서 먼저 그리세요.</div>}
                    {u.units.map((unit) => (
                      <div key={unit.id} className="flow-unit" title={unit.content || unit.label}>
                        <span className="flow-unit__label">{unit.label}</span>
                        <span
                          className={`port${unit.source === 'ai' ? ' port--ai' : ''}`}
                          ref={(el) => { const key = `${n.id}:${unit.id}`; if (el) portRefs.current.set(key, el); else portRefs.current.delete(key); }}
                          onPointerDown={(e) => onPortDown(e, n, unit)}
                          title="끌어서 다음 페이지에 놓으면 연결됩니다"
                        />
                      </div>
                    ))}
                    {u.components.length > 0 && (
                      <div className="flow-node__components muted small" title="버튼은 정보가 아니다 — 컴포넌트는 연결 지점이 아닙니다">
                        컴포넌트 {u.components.length}개 (연결 지점 아님)
                      </div>
                    )}
                  </div>
                  <button type="button" className="btn btn--sm flow-node__open" onClick={() => r && onOpenNode(r)} disabled={!r}>상세 학습 열기</button>
                </div>
              );
            })}

          </div>
          <div className="flow__zoom" onPointerDown={(e) => e.stopPropagation()}>
            <button type="button" title="축소 (Ctrl+-)" onClick={() => zoomAt(0.8)}>−</button>
            <button type="button" title="100% (Ctrl+0)" onClick={() => zoomTo(1)}>{Math.round(view.z * 100)}%</button>
            <button type="button" title="확대 (Ctrl++)" onClick={() => zoomAt(1.25)}>+</button>
            <button type="button" title="전체 맞춤 (Shift+1)" onClick={() => fitTo(null)} disabled={!flow.nodes.length}>맞춤</button>
          </div>
          <div className="flow__hint muted small">휠 이동 · Shift+휠 좌우 · Ctrl+휠 확대 · Space+드래그 이동 · 빈 곳 드래그 범위 선택 · Shift+클릭 다중 선택 · Delete 삭제</div>
          <div className="flow__overlay">
            {flow.nodes.length === 0 && (
              <div className="flow__empty">
                <h2>페이지를 노드로 놓고 흐름을 그려 보세요</h2>
                <p>위의 "라이브러리에서 페이지 추가"로 분석한 페이지를 올리거나, 상단에 URL 을 넣고 <strong>분석 시작</strong>을 누르면 이 플로우에 노드로 추가됩니다.</p>
                <p className="muted">연결선은 각 노드의 <strong>기능 단위</strong>(내 와이어프레임에서 정보 역할로 그린 블록)에서 끌어서 다음 페이지에 놓습니다. 버튼 같은 컴포넌트는 연결 지점이 아닙니다.</p>
              </div>
            )}
          </div>
        </div>

        <aside className="flow__side">
          {selNode && (() => {
            const r = refsById[selNode.reference_id];
            const s = studiesById[selNode.reference_id];
            const u = units[selNode.id];
            const outs = flow.edges.filter((e) => e.from.node === selNode.id);
            const ins = flow.edges.filter((e) => e.to.node === selNode.id);
            return (
              <div className="inspector">
                <h4>페이지</h4>
                <strong>{r ? (r.title || r.url) : '(삭제된 페이지)'}</strong>
                {r?.url && <span className="muted small">{r.url}</span>}
                <div className="inspector__actions">
                  <button type="button" className="btn btn--sm btn--primary" onClick={() => r && onOpenNode(r)} disabled={!r}>상세 학습 열기</button>
                  <button type="button" className="btn btn--sm btn--ghost link--danger" onClick={() => removeNode(selNode.id)}>플로우에서 빼기</button>
                </div>
                <p className="muted small">상세에서 내 와이어프레임을 그리고 AI 분석을 공개할 수 있습니다. 여기 기능 단위 목록은 거기서 그린 정보 블록입니다.</p>
                <h4>기능 단위 (연결 출발점) {u.fallback && <span className="muted">· AI 블록 임시 사용</span>}</h4>
                <ul className="small">
                  {u.units.map((x) => <li key={x.id}>{x.label}</li>)}
                  {u.units.length === 0 && <li className="muted">없음</li>}
                </ul>
                {u.components.length > 0 && (
                  <>
                    <h4>컴포넌트 (연결 지점 아님)</h4>
                    <ul className="small muted">{u.components.map((x) => <li key={x.id}>{x.label}</li>)}</ul>
                    <p className="lint">버튼은 정보가 아닙니다. 흐름은 "어떤 정보/기능에서 다음 화면으로 가는가"로 잇고, 버튼은 그 기능 단위 안의 부품으로 둡니다.</p>
                  </>
                )}
                <h4>나가는 연결 ({outs.length})</h4>
                <ul className="small">{outs.map((e) => <li key={e.id}><button type="button" className="link" onClick={() => setSelected({ type: 'edge', id: e.id })}>{unitLabel(r, s, e.from)} → {titleOf(e.to.node)}</button></li>)}{outs.length === 0 && <li className="muted">없음</li>}</ul>
                <h4>들어오는 연결 ({ins.length})</h4>
                <ul className="small">{ins.map((e) => <li key={e.id}><button type="button" className="link" onClick={() => setSelected({ type: 'edge', id: e.id })}>{titleOf(e.from.node)} → {e.label}</button></li>)}{ins.length === 0 && <li className="muted">없음</li>}</ul>
              </div>
            );
          })()}

          {selEdge && (
            <div className="inspector">
              <h4>연결</h4>
              <p className="small"><strong>{titleOf(selEdge.from.node)}</strong> 의 "{unitLabel(refsById[nodeById[selEdge.from.node]?.reference_id], studiesById[nodeById[selEdge.from.node]?.reference_id], selEdge.from)}" → <strong>{titleOf(selEdge.to.node)}</strong>{selEdge.from.source === 'ai' ? <span className="muted"> (AI 블록 기준, 점선)</span> : null}</p>
              <label className="field"><span className="field__label">라벨</span>
                <input className="input" value={selEdge.label} onChange={(e) => patchEdge(selEdge.id, { label: e.target.value })} />
              </label>
              <label className="field"><span className="field__label">전환 조건 / 트리거</span>
                <input className="input" value={selEdge.condition} onChange={(e) => patchEdge(selEdge.id, { condition: e.target.value })} placeholder="예: 상품 선택 시, 로그인 성공 후, 결제 완료" />
              </label>
              <div className="inspector__actions">
                <button type="button" className="btn btn--sm btn--ghost link--danger" onClick={() => removeEdge(selEdge.id)}>연결 삭제</button>
              </div>
            </div>
          )}

          {!selNode && !selEdge && selectedIds.length > 1 && (
            <div className="inspector">
              <h4>노드 {selectedIds.length}개 선택</h4>
              <ul className="small">{selectedIds.map((id) => <li key={id}>{titleOf(id)}</li>)}</ul>
              <div className="inspector__actions">
                <button type="button" className="btn btn--sm" onClick={() => fitTo(selectedIds)}>선택 맞춤 (Shift+2)</button>
                <button type="button" className="btn btn--sm btn--ghost link--danger" onClick={() => removeNodes(selectedIds)}>플로우에서 빼기</button>
              </div>
              <p className="muted small">드래그하면 함께 이동합니다. Shift+클릭으로 선택을 더하거나 뺄 수 있습니다.</p>
            </div>
          )}

          {!selNode && !selEdge && selectedIds.length <= 1 && (
            <div className="inspector">
              <h4>플로우</h4>
              <label className="field"><span className="field__label">설명</span>
                <textarea className="input" rows={3} value={flow.description} onChange={(e) => onChange({ ...flow, description: e.target.value })} placeholder="이 흐름이 해결하려는 문제, 시작점과 끝점" />
              </label>
              <p className="small">페이지 {flow.nodes.length}개 · 연결 {flow.edges.length}개</p>
              <h4>사용법</h4>
              <ol className="small">
                <li>페이지를 추가합니다 (라이브러리에서 고르거나 URL 분석).</li>
                <li>노드를 더블클릭하거나 "상세 학습 열기"로 들어가 내 와이어프레임에서 기능 단위 블록을 그립니다.</li>
                <li>노드의 기능 단위 옆 점(●)을 끌어 다음 페이지에 놓으면 연결됩니다. 연결을 클릭해 전환 조건을 적습니다.</li>
              </ol>
              <h4>마우스·단축키 (피그마와 같음)</h4>
              <ul className="small">
                <li>휠: 위아래 이동 · Shift+휠: 좌우 이동 · Ctrl(⌘)+휠 / 핀치: 커서 기준 확대·축소</li>
                <li>Space+드래그 또는 가운데 버튼 드래그: 화면 이동</li>
                <li>빈 곳 드래그: 범위 선택 · Shift+클릭: 다중 선택 · 선택 드래그: 함께 이동</li>
                <li>Delete: 삭제 · Esc: 선택 해제 · Ctrl+A: 전체 선택</li>
                <li>Ctrl+0: 100% · Ctrl+(+/-): 확대·축소 · Shift+1: 전체 맞춤 · Shift+2: 선택 맞춤</li>
              </ul>
              <p className="lint">원칙: 버튼은 정보가 아니다. 연결은 컴포넌트가 아니라 정보/기능 단위에서 출발합니다.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

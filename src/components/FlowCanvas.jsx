import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { uid } from '../lib/study';
import { NODE_W, functionUnitsOf, unitLabel, nextNodePosition, buildFlowMarkdown } from '../lib/flow';

// 여러 페이지(레퍼런스)를 노드로 놓고, 기능 단위 블록에서 다음 페이지로 연결선을 긋는 캔버스.
// 연결은 "정보/기능 단위" 블록에서만 출발한다. 컴포넌트(버튼 등)는 연결 지점이 아니다.
const CANVAS_W = 2600;
const CANVAS_H = 1800;

function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url || ''; } }

export default function FlowCanvas({ flow, refsById, studiesById, allReferences, onChange, onOpenNode, onDeleteFlow, onToast }) {
  const canvasRef = useRef(null);
  const portRefs = useRef(new Map());
  const nodeRefs = useRef(new Map());
  const dragRef = useRef(null);
  const [geom, setGeom] = useState({ ports: {}, nodes: {} });
  const [selected, setSelected] = useState(null); // { type: 'node'|'edge', id }
  const [connecting, setConnecting] = useState(null); // { fromNode, block, source, x1, y1, x2, y2 }
  const [dragTick, setDragTick] = useState(0);
  const [addRefId, setAddRefId] = useState('');
  const [copied, setCopied] = useState(false);

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
    const ports = {};
    const nodes = {};
    portRefs.current.forEach((el, key) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      ports[key] = { x: r.left + r.width / 2 - cr.left + c.scrollLeft, y: r.top + r.height / 2 - cr.top + c.scrollTop };
    });
    nodeRefs.current.forEach((el, key) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      nodes[key] = { x: r.left - cr.left + c.scrollLeft, y: r.top - cr.top + c.scrollTop, w: r.width, h: r.height };
    });
    setGeom((g) => (JSON.stringify(g.ports) === JSON.stringify(ports) && JSON.stringify(g.nodes) === JSON.stringify(nodes) ? g : { ports, nodes }));
  }, [flow.nodes, flow.edges, units, dragTick]);

  const toCanvas = (e) => {
    const c = canvasRef.current;
    const cr = c.getBoundingClientRect();
    return { x: e.clientX - cr.left + c.scrollLeft, y: e.clientY - cr.top + c.scrollTop };
  };

  // ---- 노드 드래그 ----
  const onNodeDown = (e, node) => {
    if (e.button !== 0) return;
    if (e.target.closest('button, a, .port')) return;
    e.stopPropagation();
    setSelected({ type: 'node', id: node.id });
    const p = toCanvas(e);
    dragRef.current = { mode: 'node', id: node.id, dx: p.x - node.x, dy: p.y - node.y, moved: false };
    canvasRef.current.setPointerCapture(e.pointerId);
  };
  // ---- 포트에서 연결선 끌기 ----
  const onPortDown = (e, node, unit) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const p = toCanvas(e);
    dragRef.current = { mode: 'connect' };
    setConnecting({ fromNode: node.id, block: unit.id, source: unit.source, x1: p.x, y1: p.y, x2: p.x, y2: p.y });
    canvasRef.current.setPointerCapture(e.pointerId);
  };
  const onMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const p = toCanvas(e);
    if (d.mode === 'node') {
      d.moved = true;
      const x = Math.max(0, Math.min(CANVAS_W - NODE_W, p.x - d.dx));
      const y = Math.max(0, Math.min(CANVAS_H - 100, p.y - d.dy));
      onChange({ ...flow, nodes: flow.nodes.map((n) => (n.id === d.id ? { ...n, x: Math.round(x), y: Math.round(y) } : n)) }, { silent: true });
      setDragTick((t) => t + 1);
    } else if (d.mode === 'connect') {
      setConnecting((c) => (c ? { ...c, x2: p.x, y2: p.y } : c));
    }
  };
  const onUp = (e) => {
    const d = dragRef.current;
    dragRef.current = null;
    try { canvasRef.current.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (!d) return;
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
  const removeNode = (id) => {
    const node = nodeById[id];
    const r = refsById[node?.reference_id];
    if (!window.confirm(`"${r ? (r.title || r.url) : '이 페이지'}" 노드와 연결선을 플로우에서 뺄까요? (레퍼런스 자체는 남습니다)`)) return;
    onChange({ ...flow, nodes: flow.nodes.filter((n) => n.id !== id), edges: flow.edges.filter((e) => e.from.node !== id && e.to.node !== id) });
    setSelected(null);
  };
  const patchEdge = (id, patch) => onChange({ ...flow, edges: flow.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  const removeEdge = (id) => { onChange({ ...flow, edges: flow.edges.filter((e) => e.id !== id) }); setSelected(null); };
  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(buildFlowMarkdown(flow, refsById, studiesById));
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch (err) { onToast && onToast(`복사 실패: ${err.message}`, 'error'); }
  };

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
          className="flow__canvas-wrap"
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerDown={(e) => { if (e.target === e.currentTarget || e.target.classList.contains('flow__canvas')) setSelected(null); }}
        >
          <div className="flow__canvas" style={{ width: CANVAS_W, height: CANVAS_H }}>
            <svg className="flow__edges" width={CANVAS_W} height={CANVAS_H}>
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
            </svg>

            {flow.nodes.map((n) => {
              const r = refsById[n.reference_id];
              const s = studiesById[n.reference_id];
              const u = units[n.id] || { units: [], components: [], fallback: false };
              const sel = selNode?.id === n.id;
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

          {!selNode && !selEdge && (
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
              <p className="lint">원칙: 버튼은 정보가 아니다. 연결은 컴포넌트가 아니라 정보/기능 단위에서 출발합니다.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

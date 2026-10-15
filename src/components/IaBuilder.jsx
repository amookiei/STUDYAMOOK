import React, { useEffect, useMemo, useState } from 'react';
import { uid, iaLint, orderedNodes, subtreeIds, depthOf } from '../lib/study';
import { styleOf } from '../lib/blockTypes';

// 내 IA(정보 구조) 편집기. 원칙: IA 에는 "정보"만 넣고 버튼·탭 같은 "컴포넌트"는 보관함으로 뺀다.
// nodes 배열의 순서가 형제 순서이고 parent_id 로 부모를 가리킨다. depth 는 최대 3.
const MAX_DEPTH = 3;

const PLAN_FIELDS = [
  { key: 'problem', label: '문제', hint: '어떤 사용자가 어떤 상황에서 무엇 때문에 막히는가 (데이터가 아니라 문제에서 시작)' },
  { key: 'hypothesis', label: '가설', hint: '이 화면/구조가 그 문제를 어떻게 푼다고 보는가' },
  { key: 'target', label: '타깃 사용자', hint: '예: 가격 비교 사이트를 통해 처음 들어온 구매자' },
  { key: 'kpi', label: 'KPI', hint: '고객 획득 또는 매출과 연결되는 지표 (예: 회원가입 전환율, 재방문 구매율)' },
  { key: 'evidence', label: '근거 데이터', hint: '로그/리서치/벤치마크 중 무엇을 보면 확인할 수 있는가' },
];

function insertAfter(nodes, afterIndex, items) {
  const next = nodes.slice();
  next.splice(afterIndex + 1, 0, ...items);
  return next;
}

function subtreeEndIndex(nodes, id) {
  const ids = new Set(subtreeIds(nodes, id));
  let last = nodes.findIndex((n) => n.id === id);
  nodes.forEach((n, i) => { if (ids.has(n.id)) last = Math.max(last, i); });
  return last;
}

function subtreeHeight(nodes, id) {
  let h = 1;
  for (const n of nodes) if (n.parent_id === id) h = Math.max(h, 1 + subtreeHeight(nodes, n.id));
  return h;
}

export default function IaBuilder({ nodes, onChange, plan, onPlanChange, blocks }) {
  const [focusId, setFocusId] = useState(null);
  const rows = useMemo(() => orderedNodes(nodes), [nodes]);
  const components = nodes.filter((n) => n.kind === 'component');
  const componentBlocks = (blocks || []).filter((b) => b.kind === 'block' && b.role === 'component');

  useEffect(() => {
    if (!focusId) return;
    const el = document.querySelector(`[data-ia-input="${focusId}"]`);
    if (el) el.focus();
    setFocusId(null);
  }, [focusId, rows]);

  const patch = (id, p) => onChange(nodes.map((n) => (n.id === id ? { ...n, ...p } : n)));

  const addRoot = () => {
    const n = { id: uid(), name: '', kind: 'info', parent_id: null, condition: '', note: '' };
    onChange([...nodes, n]);
    setFocusId(n.id);
  };
  const addSibling = (id) => {
    const cur = nodes.find((n) => n.id === id);
    const n = { id: uid(), name: '', kind: 'info', parent_id: cur.parent_id, condition: '', note: '' };
    onChange(insertAfter(nodes, subtreeEndIndex(nodes, id), [n]));
    setFocusId(n.id);
  };
  const addChild = (id) => {
    if (depthOf(nodes, id) >= MAX_DEPTH) return;
    const n = { id: uid(), name: '', kind: 'info', parent_id: id, condition: '', note: '' };
    onChange(insertAfter(nodes, subtreeEndIndex(nodes, id), [n]));
    setFocusId(n.id);
  };
  const remove = (id) => {
    const ids = new Set(subtreeIds(nodes, id));
    const cur = nodes.find((n) => n.id === id);
    if (ids.size > 1 && !window.confirm(`"${cur?.name || '이 항목'}" 과 하위 ${ids.size - 1}개를 함께 삭제할까요?`)) return;
    onChange(nodes.filter((n) => !ids.has(n.id)));
  };
  const siblingsOf = (id) => {
    const cur = nodes.find((n) => n.id === id);
    return nodes.filter((n) => n.kind !== 'component' && (n.parent_id || null) === (cur.parent_id || null));
  };
  const moveSubtree = (id, targetIndexFn) => {
    const ids = new Set(subtreeIds(nodes, id));
    const moving = nodes.filter((n) => ids.has(n.id));
    const rest = nodes.filter((n) => !ids.has(n.id));
    const at = targetIndexFn(rest);
    const next = rest.slice();
    next.splice(at, 0, ...moving);
    onChange(next);
  };
  const moveUp = (id) => {
    const sib = siblingsOf(id);
    const i = sib.findIndex((n) => n.id === id);
    if (i <= 0) return;
    const prev = sib[i - 1];
    moveSubtree(id, (rest) => rest.findIndex((n) => n.id === prev.id));
  };
  const moveDown = (id) => {
    const sib = siblingsOf(id);
    const i = sib.findIndex((n) => n.id === id);
    if (i < 0 || i >= sib.length - 1) return;
    const nextSib = sib[i + 1];
    moveSubtree(id, (rest) => subtreeEndIndex(rest, nextSib.id) + 1);
  };
  const indent = (id) => {
    const sib = siblingsOf(id);
    const i = sib.findIndex((n) => n.id === id);
    if (i <= 0) return;
    const prev = sib[i - 1];
    if (depthOf(nodes, prev.id) + subtreeHeight(nodes, id) > MAX_DEPTH) return;
    const ids = new Set(subtreeIds(nodes, id));
    const moving = nodes.filter((n) => ids.has(n.id)).map((n) => (n.id === id ? { ...n, parent_id: prev.id } : n));
    const rest = nodes.filter((n) => !ids.has(n.id));
    const at = subtreeEndIndex(rest, prev.id) + 1;
    const next = rest.slice();
    next.splice(at, 0, ...moving);
    onChange(next);
  };
  const outdent = (id) => {
    const cur = nodes.find((n) => n.id === id);
    if (!cur?.parent_id) return;
    const parent = nodes.find((n) => n.id === cur.parent_id);
    const ids = new Set(subtreeIds(nodes, id));
    const moving = nodes.filter((n) => ids.has(n.id)).map((n) => (n.id === id ? { ...n, parent_id: parent?.parent_id || null } : n));
    const rest = nodes.filter((n) => !ids.has(n.id));
    const at = parent ? subtreeEndIndex(rest, parent.id) + 1 : rest.length;
    const next = rest.slice();
    next.splice(at, 0, ...moving);
    onChange(next);
  };
  const toComponent = (id) => {
    const cur = nodes.find((n) => n.id === id);
    onChange(nodes.map((n) => {
      if (n.id === id) return { ...n, kind: 'component', parent_id: null };
      if (n.parent_id === id) return { ...n, parent_id: cur.parent_id || null }; // 하위 노드는 상위로 붙인다
      return n;
    }));
  };
  const toInfo = (id) => patch(id, { kind: 'info', parent_id: null });

  const onKey = (e, id) => {
    if (e.key === 'Enter') { e.preventDefault(); addSibling(id); }
    else if (e.key === 'Tab') { e.preventDefault(); if (e.shiftKey) outdent(id); else indent(id); }
    else if ((e.altKey || e.metaKey) && e.key === 'ArrowUp') { e.preventDefault(); moveUp(id); }
    else if ((e.altKey || e.metaKey) && e.key === 'ArrowDown') { e.preventDefault(); moveDown(id); }
  };

  return (
    <div className="ia-builder">
      <section className="card">
        <div className="card__head">
          <h3>0. 문제 정의</h3>
          <span className="muted small">데이터에서 시작하지 말고 문제에서 시작합니다. KPI 는 고객 획득·매출과 연결하세요.</span>
        </div>
        <div className="plan">
          {PLAN_FIELDS.map((f) => (
            <label key={f.key} className="field">
              <span className="field__label">{f.label}</span>
              <textarea className="input" rows={f.key === 'problem' ? 2 : 1} value={plan[f.key] || ''} onChange={(e) => onPlanChange({ [f.key]: e.target.value })} placeholder={f.hint} />
            </label>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="card__head">
          <h3>1. 내 IA (정보 구조)</h3>
          <button type="button" className="btn btn--sm btn--primary" onClick={addRoot}>+ 1 depth 추가</button>
        </div>
        <p className="muted small">
          서랍 정리처럼, 넣으려는 <strong>정보</strong>를 특징으로 먼저 묶고 그 묶음을 넣습니다. 버튼·탭·모달 같은 <strong>컴포넌트는 IA 에 넣지 않습니다</strong>.
          Enter: 형제 추가 · Tab / Shift+Tab: 들여쓰기 / 내어쓰기 · Alt+↑↓: 순서 이동
        </p>
        {rows.length === 0 && <p className="muted">아직 노드가 없습니다. "1 depth 추가"로 최상위 정보 묶음부터 적어 보세요. (예: 상품 정보, 가격/혜택, 리뷰)</p>}
        <div className="ia-rows">
          {rows.map(({ node, depth }) => {
            const issues = iaLint(node);
            const sib = siblingsOf(node.id);
            const idx = sib.findIndex((n) => n.id === node.id);
            return (
              <div key={node.id} className={`ia-row ia-row--d${depth}${issues.length ? ' ia-row--warn' : ''}`} style={{ marginLeft: `${(depth - 1) * 26}px` }}>
                <span className="ia-row__depth">{depth}D</span>
                <input
                  className="input ia-row__name"
                  data-ia-input={node.id}
                  value={node.name}
                  placeholder={depth === 1 ? '정보 묶음 (예: 상품 정보)' : '하위 정보 (예: 가격, 할인율)'}
                  onChange={(e) => patch(node.id, { name: e.target.value })}
                  onKeyDown={(e) => onKey(e, node.id)}
                />
                <input
                  className="input ia-row__cond"
                  value={node.condition || ''}
                  placeholder="노출 조건 (예: 로그인 시에만)"
                  onChange={(e) => patch(node.id, { condition: e.target.value })}
                />
                <div className="ia-row__actions">
                  <button type="button" className="btn btn--sm btn--ghost" title="하위 추가" onClick={() => addChild(node.id)} disabled={depth >= MAX_DEPTH}>+하위</button>
                  <button type="button" className="btn btn--sm btn--ghost" title="들여쓰기 (Tab)" onClick={() => indent(node.id)} disabled={idx <= 0}>→</button>
                  <button type="button" className="btn btn--sm btn--ghost" title="내어쓰기 (Shift+Tab)" onClick={() => outdent(node.id)} disabled={depth <= 1}>←</button>
                  <button type="button" className="btn btn--sm btn--ghost" title="위로" onClick={() => moveUp(node.id)} disabled={idx <= 0}>↑</button>
                  <button type="button" className="btn btn--sm btn--ghost" title="아래로" onClick={() => moveDown(node.id)} disabled={idx >= sib.length - 1}>↓</button>
                  <button type="button" className="btn btn--sm btn--ghost link--danger" title="삭제" onClick={() => remove(node.id)}>×</button>
                </div>
                {issues.length > 0 && (
                  <div className="ia-row__lint">
                    {issues.map((i) => <span key={i.code} className="lint">{i.message}</span>)}
                    {issues.some((i) => i.code === 'component-in-ia') && (
                      <button type="button" className="btn btn--sm" onClick={() => toComponent(node.id)}>컴포넌트로 옮기기</button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h3>2. 컴포넌트 보관함 <span className="muted">(IA 밖)</span></h3>
        <p className="muted small">IA 에서 뺀 컴포넌트와, 와이어프레임에서 컴포넌트로 표시한 블록입니다. 컴포넌트는 정보가 아니라 정보를 다루는 부품입니다.</p>
        {components.length === 0 && componentBlocks.length === 0 && <p className="muted">아직 없습니다.</p>}
        <div className="chips">
          {components.map((n) => (
            <span key={n.id} className="chip chip--component">
              {n.name || '(이름 없음)'}
              <button type="button" className="link" onClick={() => toInfo(n.id)} title="정보로 되돌리기 (IA 최상위로 이동)">정보로</button>
              <button type="button" className="link link--danger" onClick={() => remove(n.id)}>×</button>
            </span>
          ))}
          {componentBlocks.map((b) => (
            <span key={b.id} className="chip chip--component" title={b.content || ''}>
              <i className="block-list__swatch" style={{ background: styleOf(b.type).color, marginTop: 0 }} />
              {b.label} <span className="muted">· 블록</span>
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

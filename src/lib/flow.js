// 플로우(여러 페이지를 잇는 화면 흐름) 모델.
// 노드 = 레퍼런스(페이지), 엣지 = "기능 단위 블록(정보 역할) → 다음 페이지".
// 원칙: 버튼은 정보가 아니다. 연결은 컴포넌트가 아니라 기능 단위(정보 블록)에서만 출발한다.
import { uid } from './study';

export const NODE_W = 220;

export function emptyFlow(name = '') {
  return { version: 1, name, description: '', nodes: [], edges: [] };
}

export function normalizeFlow(raw) {
  const base = emptyFlow();
  if (!raw || typeof raw !== 'object') return base;
  return {
    ...base,
    ...raw,
    name: raw.name || '',
    description: raw.description || '',
    nodes: Array.isArray(raw.nodes) ? raw.nodes.filter((n) => n && n.reference_id).map((n) => ({ id: n.id || uid(), reference_id: n.reference_id, x: Number(n.x) || 0, y: Number(n.y) || 0 })) : [],
    edges: Array.isArray(raw.edges) ? raw.edges.filter((e) => e && e.from && e.to).map((e) => ({
      id: e.id || uid(),
      from: { node: e.from.node, block: e.from.block || '', source: e.from.source === 'ai' ? 'ai' : 'mine' },
      to: { node: e.to.node },
      label: e.label || '',
      condition: e.condition || '',
    })) : [],
  };
}

// 노드가 연결선을 낼 수 있는 "기능 단위" 목록.
// 1순위: 내 와이어프레임 블록 중 역할이 정보(기능 단위)인 것. 컴포넌트는 제외된다(연결 지점이 아님).
// 내 블록이 없으면 AI 와이어프레임 블록을 임시로 쓴다(source:'ai').
export function functionUnitsOf(reference, study) {
  const mine = (study?.drawing?.shapes || []).filter((s) => s.kind === 'block');
  const units = mine.filter((b) => b.role !== 'component').map((b) => ({ id: b.id, label: b.label || '(라벨 없음)', source: 'mine', content: b.content || '' }));
  const components = mine.filter((b) => b.role === 'component').map((b) => ({ id: b.id, label: b.label || '(라벨 없음)', source: 'mine' }));
  if (units.length === 0 && mine.length === 0) {
    const ai = (reference?.analysis?.wireframe?.blocks || []).map((b) => ({ id: b.id, label: b.label, source: 'ai', content: b.description || '' }));
    return { units: ai, components, fallback: ai.length > 0 };
  }
  return { units, components, fallback: false };
}

export function unitLabel(reference, study, edgeFrom) {
  const { units } = functionUnitsOf(reference, study);
  const hit = units.find((u) => u.id === edgeFrom.block);
  if (hit) return hit.label;
  const comp = (study?.drawing?.shapes || []).find((s) => s.id === edgeFrom.block);
  if (comp) return `${comp.label} (컴포넌트로 바뀜)`;
  return '(삭제된 블록)';
}

// 새 노드를 놓을 자리: 마지막 노드 오른쪽, 넘치면 다음 줄
export function nextNodePosition(nodes) {
  if (!nodes.length) return { x: 40, y: 40 };
  const maxX = Math.max(...nodes.map((n) => n.x));
  const rowY = Math.max(...nodes.filter((n) => n.x === maxX).map((n) => n.y));
  if (maxX + NODE_W * 2 + 80 > 2400) return { x: 40, y: Math.max(...nodes.map((n) => n.y)) + 360 };
  return { x: maxX + NODE_W + 80, y: rowY };
}

export function buildFlowMarkdown(flow, refsById, studiesById) {
  const out = [`# [화면 흐름] ${flow.name || '플로우'}`, ''];
  if (flow.description) out.push(flow.description, '');
  out.push(`페이지 ${flow.nodes.length}개 · 연결 ${flow.edges.length}개`, '');
  const nodeById = Object.fromEntries(flow.nodes.map((n) => [n.id, n]));
  const title = (nodeId) => { const n = nodeById[nodeId]; const r = n && refsById[n.reference_id]; return r ? (r.title || r.url) : '(삭제된 페이지)'; };
  for (const n of flow.nodes) {
    const r = refsById[n.reference_id];
    const s = studiesById[n.reference_id];
    const { units, components } = functionUnitsOf(r, s);
    out.push(`## ${r ? (r.title || r.url) : '(삭제된 페이지)'}`);
    if (r?.url) out.push(r.url);
    out.push(`- 기능 단위 ${units.length}개${components.length ? ` · 컴포넌트 ${components.length}개 (연결 지점 아님)` : ''}`);
    const outs = flow.edges.filter((e) => e.from.node === n.id);
    for (const e of outs) out.push(`- ${unitLabel(r, s, e.from)} → ${title(e.to.node)}${e.condition ? ` (${e.condition})` : ''}${e.label && e.label !== unitLabel(r, s, e.from) ? ` — ${e.label}` : ''}`);
    out.push('');
  }
  out.push('원칙: 연결은 버튼(컴포넌트)이 아니라 정보/기능 단위에서 출발한다.');
  return out.join('\n');
}

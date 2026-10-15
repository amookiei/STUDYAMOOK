// 학습 기록(study) 모델: 직접 그린 와이어프레임, 내 IA, 문제 정의, AI 비교 글.
// 강의 원칙(정보 vs 컴포넌트, 더미 금지, 문제에서 시작)을 린트와 체크리스트로 옮긴다.
import { styleOf } from './blockTypes';

export const uid = () => (crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(16).slice(2, 10));

export const EMPTY_PLAN = { problem: '', hypothesis: '', target: '', kpi: '', evidence: '' };
export const EMPTY_COMPARE = { ai_traits: '', my_view: '', improvement: '', evidence: '' };

export function emptyStudy() {
  return {
    version: 1,
    revealed: false,
    drawing: { shapes: [], pins: [] },
    ia: { nodes: [] },
    plan: { ...EMPTY_PLAN },
    compare: { ...EMPTY_COMPARE },
  };
}

export function normalizeStudy(raw) {
  const base = emptyStudy();
  if (!raw || typeof raw !== 'object') return base;
  return {
    ...base,
    ...raw,
    revealed: Boolean(raw.revealed),
    drawing: {
      shapes: Array.isArray(raw.drawing?.shapes) ? raw.drawing.shapes : [],
      pins: Array.isArray(raw.drawing?.pins) ? raw.drawing.pins : [],
    },
    ia: { nodes: Array.isArray(raw.ia?.nodes) ? raw.ia.nodes : [] },
    plan: { ...EMPTY_PLAN, ...(raw.plan || {}) },
    compare: { ...EMPTY_COMPARE, ...(raw.compare || {}) },
  };
}

// ---------------------------------------------------------------------------
// 린트: "버튼은 정보가 아니다" / "더미 텍스트 넣지 말고 내용을 넣어라"
// ---------------------------------------------------------------------------
export const COMPONENT_WORDS = new RegExp(
  [
    '버튼', '\\bbtn\\b', '\\bbutton', '탭', '\\btabs?\\b', '모달', '\\bmodal', '팝업', '\\bpopup', '토글', '\\btoggle',
    '체크\\s?박스', '\\bcheckbox', '라디오', '\\bradio', '드롭\\s?다운', '\\bdropdown', '셀렉트', '\\bselect', '입력\\s?창',
    '\\binput', '텍스트\\s?필드', '\\btext\\s?field', '스위치', '\\bswitch', '슬라이더', '\\bslider', '아이콘', '\\bicon',
    '툴팁', '\\btooltip', '배지', '\\bbadge', '칩', '\\bchip', '캐러셀', '\\bcarousel', '배너', '\\bbanner', '헤더', '\\bheader',
    '푸터', '\\bfooter', '\\bgnb\\b', '\\blnb\\b', '\\bfnb\\b', '스낵바', '\\bsnackbar', '토스트', '\\btoast', '페이지네이션',
    '\\bpagination', '더보기', '바로가기', '숏컷', '\\bshortcut', '링크', '\\blink', '카드', '\\bcard', '아코디언', '\\baccordion',
    '스피너', '\\bspinner', '프로그레스', '\\bprogress', '드로어', '\\bdrawer', '바텀\\s?시트', '\\bsheet', '다이얼로그', '\\bdialog',
    '알럿', '\\balert', '썸네일', '\\bthumbnail', '검색창', '\\bsearch\\s?bar',
  ].join('|'),
  'i',
);

export const DUMMY_WORDS = /(lorem|ipsum|더미|dummy|placeholder|플레이스홀더|샘플\s?텍스트|텍스트\s?텍스트|내용\s?내용|asdf|qwer|ㅇㅇ|ㅁㅁ|ㅋㅋ|\btest\b|테스트\s?텍스트|xxx|aaa|1111)/i;

export function iaLint(node) {
  const issues = [];
  const name = (node.name || '').trim();
  if (!name) return issues;
  if (node.kind !== 'component' && COMPONENT_WORDS.test(name)) {
    issues.push({ code: 'component-in-ia', message: '컴포넌트로 보이는 이름입니다. IA 에는 정보만 넣고, 버튼·탭·모달 같은 컴포넌트는 와이어프레임 블록에 표시하세요.' });
  }
  if (/\bBTN\b/.test(name)) issues.push({ code: 'btn-case', message: 'btn 은 소문자로 씁니다.' });
  return issues;
}

export function blockLint(shape) {
  const issues = [];
  if (shape.kind !== 'block') return issues;
  const content = (shape.content || '').trim();
  if (!content) issues.push({ code: 'no-content', message: '실제 문구가 없습니다. 화면에 보이는 문장·숫자를 그대로 적으세요.' });
  else if (DUMMY_WORDS.test(content)) issues.push({ code: 'dummy-content', message: '더미 텍스트로 보입니다. 실제 내용을 넣으세요.' });
  if (/\bBTN\b/.test(shape.label || '')) issues.push({ code: 'btn-case', message: 'btn 은 소문자로 씁니다.' });
  return issues;
}

// ---------------------------------------------------------------------------
// IA 트리 유틸 (nodes 배열 순서 = 형제 순서, parent_id 로 부모를 가리킴)
// ---------------------------------------------------------------------------
export function orderedNodes(nodes, { includeComponents = false } = {}) {
  const list = nodes.filter((n) => includeComponents || n.kind !== 'component');
  const ids = new Set(list.map((n) => n.id));
  const byParent = new Map();
  for (const n of list) {
    const key = n.parent_id && ids.has(n.parent_id) ? n.parent_id : null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(n);
  }
  const out = [];
  const walk = (parent, depth) => {
    for (const n of byParent.get(parent) || []) {
      out.push({ node: n, depth });
      walk(n.id, depth + 1);
    }
  };
  walk(null, 1);
  return out;
}

export function subtreeIds(nodes, id) {
  const out = [id];
  for (let i = 0; i < out.length; i += 1) {
    for (const n of nodes) if (n.parent_id === out[i]) out.push(n.id);
  }
  return out;
}

export function depthOf(nodes, id) {
  let d = 1;
  let cur = nodes.find((n) => n.id === id);
  const seen = new Set();
  while (cur && cur.parent_id && !seen.has(cur.id)) {
    seen.add(cur.id);
    cur = nodes.find((n) => n.id === cur.parent_id);
    if (cur) d += 1;
  }
  return d;
}

// ---------------------------------------------------------------------------
// AI 결과와 비교
// ---------------------------------------------------------------------------
export function iou(a, b) {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

export function compareBlocks(shapes, aiBlocks, threshold = 0.4) {
  const mine = (shapes || []).filter((s) => s.kind === 'block');
  const used = new Set();
  const matches = [];
  for (const m of mine) {
    let best = null;
    let bestIou = 0;
    for (const a of aiBlocks || []) {
      if (used.has(a.id)) continue;
      const v = iou(m, a);
      if (v > bestIou) { bestIou = v; best = a; }
    }
    if (best && bestIou >= threshold) {
      used.add(best.id);
      matches.push({ mine: m, ai: best, iou: bestIou });
    }
  }
  const onlyMine = mine.filter((m) => !matches.some((x) => x.mine.id === m.id));
  const onlyAi = (aiBlocks || []).filter((a) => !used.has(a.id));
  return { mine, matches, onlyMine, onlyAi };
}

const norm = (s) => String(s || '').toLowerCase().replace(/[\s\-_/·,.()[\]{}'"!?:;]/g, '');

export function compareIa(nodes, aiHierarchy) {
  const mine = (nodes || []).filter((n) => n.kind !== 'component' && (n.name || '').trim());
  const ai = (aiHierarchy || []).filter((h) => (h.name || '').trim());
  const used = new Set();
  const matches = [];
  for (const m of mine) {
    const a = norm(m.name);
    if (a.length < 2) continue;
    const hit = ai.find((h) => {
      if (used.has(h.id)) return false;
      const b = norm(h.name);
      return b.length >= 2 && (a === b || a.includes(b) || b.includes(a));
    });
    if (hit) { used.add(hit.id); matches.push({ mine: m, ai: hit }); }
  }
  return {
    mine,
    matches,
    onlyMine: mine.filter((m) => !matches.some((x) => x.mine.id === m.id)),
    onlyAi: ai.filter((h) => !used.has(h.id)),
  };
}

// ---------------------------------------------------------------------------
// 원칙 체크리스트
// ---------------------------------------------------------------------------
export function checklist(study, analysis) {
  const blocks = study.drawing.shapes.filter((s) => s.kind === 'block');
  const infoNodes = study.ia.nodes.filter((n) => n.kind !== 'component');
  const maxDepth = infoNodes.reduce((m, n) => Math.max(m, depthOf(study.ia.nodes, n.id)), 0);
  const withStates = blocks.filter((b) => (b.states || '').trim()).length;
  const lintIssues = study.ia.nodes.flatMap(iaLint).filter((i) => i.code === 'component-in-ia').length;
  const noContent = blocks.filter((b) => blockLint(b).some((i) => i.code === 'no-content')).length;
  const dummy = blocks.filter((b) => blockLint(b).some((i) => i.code === 'dummy-content')).length;
  const comp = study.compare;
  return [
    { id: 'blocks', label: '블록을 5개 이상 그렸다', ok: blocks.length >= 5, detail: `${blocks.length}개` },
    { id: 'content', label: '모든 블록에 실제 문구를 적었다 (더미 금지)', ok: blocks.length > 0 && noContent === 0 && dummy === 0, detail: noContent ? `문구 없음 ${noContent}개` : dummy ? `더미 ${dummy}개` : '' },
    { id: 'component', label: '컴포넌트를 블록으로 표시했다', ok: blocks.some((b) => b.role === 'component'), detail: `${blocks.filter((b) => b.role === 'component').length}개` },
    { id: 'ia-info', label: 'IA 에 컴포넌트가 섞여 있지 않다', ok: infoNodes.length > 0 && lintIssues === 0, detail: lintIssues ? `경고 ${lintIssues}개` : infoNodes.length ? '' : 'IA 노드 없음' },
    { id: 'ia-depth', label: 'IA 를 2 depth 이상으로 묶었다', ok: maxDepth >= 2, detail: maxDepth ? `${maxDepth} depth` : '' },
    { id: 'states', label: '노출 조건/상태 케이스를 1개 이상 적었다', ok: withStates > 0, detail: `${withStates}개 블록` },
    { id: 'plan', label: '문제 정의와 KPI 를 적었다 (문제에서 시작)', ok: Boolean(study.plan.problem.trim() && study.plan.kpi.trim()) },
    { id: 'compare', label: 'AI 와 비교한 글을 썼다', ok: Boolean(analysis && comp.ai_traits.trim() && comp.my_view.trim() && comp.improvement.trim()) },
  ];
}

// ---------------------------------------------------------------------------
// LinkedIn 초안 (Markdown)
// ---------------------------------------------------------------------------
const line = (s) => String(s || '').trim();
const dateOf = (iso) => { const d = iso ? new Date(iso) : new Date(); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`; };

export function buildLinkedInDraft({ reference, study, analysis, notes = [] }) {
  const blocks = study.drawing.shapes.filter((s) => s.kind === 'block');
  const components = blocks.filter((b) => b.role === 'component');
  const aiBlocks = analysis?.wireframe?.blocks || [];
  const aiHier = analysis?.information_architecture?.hierarchy || [];
  const bc = compareBlocks(study.drawing.shapes, aiBlocks);
  const ic = compareIa(study.ia.nodes, aiHier);
  const checks = checklist(study, analysis);
  const out = [];

  out.push(`# [화면 분석 기록] ${line(reference?.title) || line(reference?.url) || '레퍼런스'}`);
  out.push(`${line(reference?.url)} · ${dateOf(reference?.created_at)}`);
  out.push('');
  out.push('AI 가 화면을 순식간에 만들어 주는 시대라서, 오히려 화면을 논리적으로 직접 뜯어보는 연습을 하고 있습니다. 이번에는 위 화면을 AI 결과를 보지 않고 먼저 그린 뒤 비교했습니다.');
  out.push('');

  const p = study.plan;
  if (line(p.problem) || line(p.kpi) || line(p.hypothesis)) {
    out.push('## 1. 문제에서 시작');
    if (line(p.problem)) out.push(`- 문제: ${line(p.problem)}`);
    if (line(p.hypothesis)) out.push(`- 가설: ${line(p.hypothesis)}`);
    if (line(p.target)) out.push(`- 타깃 사용자: ${line(p.target)}`);
    if (line(p.kpi)) out.push(`- KPI: ${line(p.kpi)}`);
    if (line(p.evidence)) out.push(`- 근거: ${line(p.evidence)}`);
    out.push('');
  }

  const rows = orderedNodes(study.ia.nodes);
  if (rows.length) {
    out.push('## 2. 내가 정리한 정보 구조 (정보만, 컴포넌트 제외)');
    for (const { node, depth } of rows) {
      out.push(`${'  '.repeat(depth - 1)}- ${line(node.name) || '(이름 없음)'}${line(node.condition) ? ` — ${line(node.condition)}` : ''}`);
    }
    out.push('');
  }

  if (blocks.length) {
    out.push('## 3. 직접 그린 와이어프레임');
    out.push(`- 블록 ${blocks.length}개 (정보 ${blocks.length - components.length} / 컴포넌트 ${components.length})`);
    for (const b of blocks) {
      const parts = [`${b.role === 'component' ? '[컴포넌트]' : '[정보]'} ${line(b.label)} (${styleOf(b.type).label})`];
      if (line(b.content)) parts.push(`문구: "${line(b.content)}"`);
      if (line(b.states)) parts.push(`상태: ${line(b.states).replace(/\n+/g, ' / ')}`);
      out.push(`- ${parts.join(' · ')}`);
    }
    out.push('');
  }

  if (study.drawing.pins.some((x) => line(x.text))) {
    out.push('## 4. 핀 코멘트');
    study.drawing.pins.forEach((pin, i) => { if (line(pin.text)) out.push(`- 핀 ${i + 1}: ${line(pin.text)}`); });
    out.push('');
  }

  if (analysis) {
    out.push('## 5. AI 분석과 비교');
    out.push(`- 블록: 일치 ${bc.matches.length} · 내가 더 본 것 ${bc.onlyMine.length} · AI 만 본 것 ${bc.onlyAi.length} (AI 블록 ${aiBlocks.length}개)`);
    out.push(`- IA: 일치 ${ic.matches.length} · 내 IA 에만 ${ic.onlyMine.length} · AI IA 에만 ${ic.onlyAi.length}`);
    if (bc.onlyMine.length) out.push(`- 내가 잡았지만 AI 는 놓친 영역: ${bc.onlyMine.map((b) => line(b.label)).join(', ')}`);
    if (bc.onlyAi.length) out.push(`- AI 는 잡았지만 내가 놓친 영역: ${bc.onlyAi.map((b) => line(b.label)).join(', ')}`);
    const c = study.compare;
    if (line(c.ai_traits)) out.push(`\nAI 가 분석한 화면은 ${line(c.ai_traits)}`);
    if (line(c.my_view)) out.push(`\n내 분석과 비교해 보면 ${line(c.my_view)}`);
    if (line(c.improvement)) out.push(`\n그래서 ${line(c.improvement)}`);
    if (line(c.evidence)) out.push(`\n근거: ${line(c.evidence)}`);
    out.push('');
  }

  const bodies = notes.map((n) => line(n.body)).filter(Boolean);
  if (bodies.length) {
    out.push('## 6. 배운 점 (섹션 코멘트)');
    for (const n of notes) if (line(n.body)) out.push(`- ${n.section_label && n.section_label !== '전체 (일반 코멘트)' ? `[${n.section_label}] ` : ''}${line(n.body)}`);
    out.push('');
  }

  out.push('## 체크리스트');
  for (const c of checks) out.push(`- [${c.ok ? 'x' : ' '}] ${c.label}${c.detail ? ` (${c.detail})` : ''}`);
  out.push('');
  out.push('#UX #서비스기획 #IA #와이어프레임 #AI시대의기획 #학습기록');
  return out.join('\n');
}

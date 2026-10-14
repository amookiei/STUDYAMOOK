// Anthropic Messages API로 캡처 결과(DOM 랜드마크 + 스크린샷)를 보내
// 정보구조 / 와이어프레임 / UX 패턴 분석을 구조화된 JSON으로 받는다.
//
// 이 파일의 ANALYSIS_SCHEMA 를 바꾸면 src/components/Analysis.jsx 와 Wireframe.jsx 렌더링도 함께 맞춰야 한다.
const Anthropic = require('@anthropic-ai/sdk');

const DEFAULT_MODEL = 'claude-opus-5-5';
const MODEL_OPTIONS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (기본, 가장 정확)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (빠름)' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (가장 저렴)' },
];

const BLOCK_TYPES = [
  'header', 'nav', 'hero', 'content', 'feature', 'sidebar', 'cta', 'form', 'footer',
  'media', 'card-grid', 'testimonial', 'pricing', 'faq', 'table', 'list', 'other',
];
const PATTERN_CATEGORIES = [
  'navigation', 'layout', 'content', 'conversion', 'interaction', 'trust', 'accessibility', 'other',
];
const EVALUATIONS = ['strength', 'neutral', 'improvement'];

// ---- 출력 스키마 (Structured Outputs: 모든 object 는 additionalProperties:false, 모든 속성 required) ----
const ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'site_type', 'target_audience', 'information_architecture', 'wireframe', 'ux_patterns', 'insights', 'tags'],
  properties: {
    summary: { type: 'string', description: '페이지가 무엇을 하는지와 전체 UX 인상을 2~3문장 한국어로 요약' },
    site_type: { type: 'string', description: '예: SaaS 랜딩 페이지, 커머스 상품 목록, 블로그, 대시보드' },
    target_audience: { type: 'string', description: '주요 타깃 사용자' },
    information_architecture: {
      type: 'object',
      additionalProperties: false,
      required: ['hierarchy', 'navigation', 'content_priority'],
      properties: {
        hierarchy: {
          type: 'array',
          description: '페이지의 정보 구조 트리. level 1 이 최상위 섹션, parent_id 로 상위 섹션을 가리킨다. 와이어프레임 블록의 section_id 가 이 id 를 참조한다.',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'name', 'level', 'parent_id', 'purpose', 'landmark_ids'],
            properties: {
              id: { type: 'string', description: '짧은 영문 slug, 예: sec-hero' },
              name: { type: 'string', description: '섹션 이름(한국어)' },
              level: { type: 'integer', description: '1(최상위) ~ 3' },
              parent_id: { type: ['string', 'null'], description: '상위 섹션 id, 최상위면 null' },
              purpose: { type: 'string', description: '이 섹션의 역할/목적(한국어, 1문장)' },
              landmark_ids: { type: 'array', items: { type: 'string' }, description: '대응되는 DOM 랜드마크 id 목록(lm-N)' },
            },
          },
        },
        navigation: {
          type: 'object',
          additionalProperties: false,
          required: ['primary', 'secondary', 'utility', 'footer'],
          properties: {
            primary: { type: 'array', items: { type: 'string' }, description: '주 내비게이션 메뉴 라벨' },
            secondary: { type: 'array', items: { type: 'string' }, description: '보조 내비게이션(서브메뉴, 탭 등)' },
            utility: { type: 'array', items: { type: 'string' }, description: '로그인, 검색, 언어 등 유틸리티' },
            footer: { type: 'array', items: { type: 'string' }, description: '푸터 링크 그룹' },
          },
        },
        content_priority: { type: 'array', items: { type: 'string' }, description: '시각적 우선순위가 높은 순서대로 콘텐츠 요소 나열' },
      },
    },
    wireframe: {
      type: 'object',
      additionalProperties: false,
      required: ['blocks'],
      properties: {
        blocks: {
          type: 'array',
          description: '로우파이 와이어프레임 블록. x,y,w,h 는 전체 페이지 기준 0~100 퍼센트. 겹치지 않게, 위에서 아래 순서로.',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'label', 'type', 'x', 'y', 'w', 'h', 'section_id', 'description'],
            properties: {
              id: { type: 'string', description: '예: wf-1' },
              label: { type: 'string', description: '블록에 표시할 짧은 라벨(한국어)' },
              type: { type: 'string', enum: BLOCK_TYPES },
              x: { type: 'number', description: '왼쪽 위치, 페이지 너비 기준 %' },
              y: { type: 'number', description: '위쪽 위치, 페이지 높이 기준 %' },
              w: { type: 'number', description: '너비 %' },
              h: { type: 'number', description: '높이 %' },
              section_id: { type: 'string', description: 'information_architecture.hierarchy 의 id' },
              description: { type: 'string', description: '블록 안에 어떤 요소가 있는지(한국어, 1문장)' },
            },
          },
        },
      },
    },
    ux_patterns: {
      type: 'array',
      description: '관찰된 UX 패턴 6~12개',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'category', 'description', 'location', 'evaluation', 'section_id'],
        properties: {
          name: { type: 'string', description: '패턴 이름, 예: 스티키 헤더, 소셜 프루프 로고 월' },
          category: { type: 'string', enum: PATTERN_CATEGORIES },
          description: { type: 'string', description: '패턴이 어떻게 적용됐고 왜 효과적인지(한국어)' },
          location: { type: 'string', description: '페이지 어디에서 보이는지' },
          evaluation: { type: 'string', enum: EVALUATIONS },
          section_id: { type: ['string', 'null'], description: '관련 섹션 id, 없으면 null' },
        },
      },
    },
    insights: {
      type: 'object',
      additionalProperties: false,
      required: ['strengths', 'improvements', 'takeaways'],
      properties: {
        strengths: { type: 'array', items: { type: 'string' }, description: '잘한 점' },
        improvements: { type: 'array', items: { type: 'string' }, description: '개선 여지' },
        takeaways: { type: 'array', items: { type: 'string' }, description: '내 프로젝트에 가져갈 만한 포인트' },
      },
    },
    tags: { type: 'array', items: { type: 'string' }, description: '라이브러리 분류용 태그 3~8개(한국어 또는 영문)' },
  },
};

const SYSTEM_PROMPT = `당신은 시니어 UX 리서처이자 정보 설계자입니다. 웹 페이지의 전체 스크린샷(세로로 잘라 여러 장으로 전달됨)과 DOM 랜드마크 구조 데이터를 함께 보고, 디자이너가 레퍼런스로 삼을 수 있도록 페이지를 분석합니다.

분석 원칙:
- 모든 설명 텍스트는 한국어로 작성합니다. 메뉴 라벨처럼 페이지에 실제로 쓰인 문구는 원문 그대로 둡니다.
- 정보구조(hierarchy)는 실제 페이지 순서와 포함 관계를 따릅니다. DOM 랜드마크 id(lm-N)를 landmark_ids 로 연결합니다.
- 와이어프레임 블록 좌표(x, y, w, h)는 전체 페이지 기준 퍼센트(0~100)입니다. 스크린샷 조각마다 "이 조각이 페이지의 몇 %~몇 % 구간인지"가 적혀 있으니 그 정보와 DOM 랜드마크의 yPct/hPct 를 활용해 위치를 추정하세요. 블록은 서로 겹치지 않게, 위에서 아래로 정렬하고 8~20개 정도로 만듭니다.
- 각 와이어프레임 블록의 section_id 는 반드시 hierarchy 에 있는 id 를 사용합니다.
- UX 패턴은 구체적으로: 무엇을, 어디에서, 왜 그렇게 했는지 적습니다. 좋은 점(strength)과 개선 여지(improvement)를 균형 있게 다룹니다.
- 추측이 필요한 부분은 단정하지 말고 "~로 보입니다"처럼 표현합니다.`;

// ---------------------------------------------------------------------------
// 이미지 준비: 전체 페이지 스크린샷을 모델이 보기 좋은 크기로 축소하고 세로로 잘라 여러 장으로 만든다.
// ---------------------------------------------------------------------------
const TILE_WIDTH = 1100;
const TILE_HEIGHT = 1500;
const MAX_TILES = 8;

function tileScreenshot(screenshot) {
  const { nativeImage } = require('electron');
  const buffer = Buffer.from(screenshot.base64, 'base64');
  let image = nativeImage.createFromBuffer(buffer);
  if (image.isEmpty()) throw new Error('스크린샷 이미지를 읽을 수 없습니다.');

  const original = image.getSize();
  let scale = TILE_WIDTH / original.width;
  // 너무 긴 페이지는 타일 수가 MAX_TILES 를 넘지 않도록 더 축소한다.
  const maxTotalHeight = TILE_HEIGHT * MAX_TILES;
  if (original.height * scale > maxTotalHeight) scale = maxTotalHeight / original.height;
  const targetWidth = Math.max(1, Math.round(original.width * scale));
  const targetHeight = Math.max(1, Math.round(original.height * scale));
  image = image.resize({ width: targetWidth, height: targetHeight, quality: 'good' });

  const tiles = [];
  for (let y = 0; y < targetHeight && tiles.length < MAX_TILES; y += TILE_HEIGHT) {
    const h = Math.min(TILE_HEIGHT, targetHeight - y);
    if (h < 24) break;
    const crop = image.crop({ x: 0, y, width: targetWidth, height: h });
    tiles.push({
      index: tiles.length + 1,
      fromPct: +((100 * y) / targetHeight).toFixed(1),
      toPct: +((100 * (y + h)) / targetHeight).toFixed(1),
      mediaType: 'image/jpeg',
      base64: crop.toJPEG(82).toString('base64'),
      width: targetWidth,
      height: h,
    });
  }
  return tiles;
}

// 모델에 보낼 랜드마크 데이터는 토큰을 아끼기 위해 필요한 필드만 남긴다.
function compactLandmarks(landmarks) {
  const list = (landmarks.landmarks || []).map((lm) => ({
    id: lm.id,
    tag: lm.tag,
    role: lm.role,
    label: lm.label || undefined,
    depth: lm.depth,
    box: { yPct: lm.box.yPct, hPct: lm.box.hPct, xPct: lm.box.xPct, wPct: lm.box.wPct },
    headings: lm.headings && lm.headings.length ? lm.headings.map((h) => `${h.level}: ${h.text}`) : undefined,
    links: lm.links && lm.links.length ? lm.links.slice(0, 15) : undefined,
    buttons: lm.buttons && lm.buttons.length ? lm.buttons.slice(0, 10) : undefined,
    counts: lm.counts,
    text: lm.textSnippet ? lm.textSnippet.slice(0, 160) : undefined,
  }));
  return {
    url: landmarks.url,
    title: landmarks.title,
    description: landmarks.description,
    lang: landmarks.lang,
    page: landmarks.page,
    headingOutline: landmarks.headingOutline,
    style: landmarks.style,
    landmarks: list,
  };
}

function buildUserContent(capture, tiles) {
  const content = [];
  for (const tile of tiles) {
    content.push({ type: 'text', text: `[스크린샷 ${tile.index}/${tiles.length}] 페이지 세로 ${tile.fromPct}% ~ ${tile.toPct}% 구간` });
    content.push({ type: 'image', source: { type: 'base64', media_type: tile.mediaType, data: tile.base64 } });
  }
  const compact = compactLandmarks(capture.landmarks || {});
  content.push({
    type: 'text',
    text: [
      `분석 대상 URL: ${capture.url}`,
      `페이지 제목: ${capture.title || '(없음)'}`,
      `캡처 크기: ${capture.screenshot.width} x ${capture.screenshot.height}px${capture.landmarks?.page?.truncated ? ' (너무 길어서 아래쪽은 잘림)' : ''}`,
      '',
      '아래는 DOM 에서 추출한 랜드마크 구조 데이터(JSON)입니다. box 의 yPct/hPct 는 전체 페이지 기준 퍼센트입니다.',
      '```json',
      JSON.stringify(compact),
      '```',
      '',
      '위 스크린샷과 구조 데이터를 바탕으로 정보구조, 와이어프레임, UX 패턴을 분석해 주세요.',
    ].join('\n'),
  });
  return content;
}

// ---------------------------------------------------------------------------
// 결과 정규화: 모델 출력이 스키마를 따르더라도 UI 가 안전하게 그릴 수 있게 값을 보정한다.
// ---------------------------------------------------------------------------
const clampPct = (v) => Math.min(100, Math.max(0, Number.isFinite(+v) ? +v : 0));
const asArray = (v) => (Array.isArray(v) ? v : []);
const asString = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));

function normalizeAnalysis(raw) {
  const ia = raw.information_architecture || {};
  const hierarchy = asArray(ia.hierarchy).map((s, i) => ({
    id: asString(s.id) || `sec-${i + 1}`,
    name: asString(s.name) || `섹션 ${i + 1}`,
    level: Math.min(3, Math.max(1, parseInt(s.level, 10) || 1)),
    parent_id: s.parent_id ? asString(s.parent_id) : null,
    purpose: asString(s.purpose),
    landmark_ids: asArray(s.landmark_ids).map(asString),
  }));
  const sectionIds = new Set(hierarchy.map((s) => s.id));

  const blocks = asArray(raw.wireframe?.blocks).filter((b) => clampPct(b.x) < 100 && clampPct(b.y) < 100).map((b, i) => {
    const x = clampPct(b.x); const y = clampPct(b.y);
    return {
      id: asString(b.id) || `wf-${i + 1}`,
      label: asString(b.label) || `블록 ${i + 1}`,
      type: BLOCK_TYPES.includes(b.type) ? b.type : 'other',
      x, y,
      w: Math.max(1, Math.min(100 - x, clampPct(b.w))),
      h: Math.max(0.5, Math.min(100 - y, clampPct(b.h))),
      section_id: sectionIds.has(b.section_id) ? b.section_id : (hierarchy[0]?.id || ''),
      description: asString(b.description),
    };
  }).sort((a, b) => a.y - b.y || a.x - b.x);

  const nav = ia.navigation || {};
  return {
    summary: asString(raw.summary),
    site_type: asString(raw.site_type),
    target_audience: asString(raw.target_audience),
    information_architecture: {
      hierarchy,
      navigation: {
        primary: asArray(nav.primary).map(asString),
        secondary: asArray(nav.secondary).map(asString),
        utility: asArray(nav.utility).map(asString),
        footer: asArray(nav.footer).map(asString),
      },
      content_priority: asArray(ia.content_priority).map(asString),
    },
    wireframe: { blocks },
    ux_patterns: asArray(raw.ux_patterns).map((p) => ({
      name: asString(p.name),
      category: PATTERN_CATEGORIES.includes(p.category) ? p.category : 'other',
      description: asString(p.description),
      location: asString(p.location),
      evaluation: EVALUATIONS.includes(p.evaluation) ? p.evaluation : 'neutral',
      section_id: p.section_id && sectionIds.has(p.section_id) ? p.section_id : null,
    })),
    insights: {
      strengths: asArray(raw.insights?.strengths).map(asString),
      improvements: asArray(raw.insights?.improvements).map(asString),
      takeaways: asArray(raw.insights?.takeaways).map(asString),
    },
    tags: asArray(raw.tags).map(asString).filter(Boolean).slice(0, 12),
  };
}

function extractJson(message) {
  const text = (message.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
  if (!text) throw new Error('모델 응답에 텍스트가 없습니다.');
  try {
    return JSON.parse(text);
  } catch {
    // 혹시 코드펜스로 감싸져 온 경우를 대비
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('모델 응답을 JSON 으로 해석할 수 없습니다.');
  }
}

function friendlyApiError(err) {
  if (err instanceof Anthropic.AuthenticationError) return new Error('Anthropic API 키가 올바르지 않습니다. 설정에서 키를 확인해 주세요.');
  if (err instanceof Anthropic.PermissionDeniedError) return new Error('이 API 키로는 요청이 허용되지 않습니다 (권한/모델 접근 확인).');
  if (err instanceof Anthropic.NotFoundError) return new Error('모델을 찾을 수 없습니다. 설정에서 모델 ID 를 확인해 주세요.');
  if (err instanceof Anthropic.RateLimitError) return new Error('요청이 너무 많습니다(429). 잠시 후 다시 시도해 주세요.');
  if (err instanceof Anthropic.APIConnectionError) return new Error('Anthropic API 에 연결하지 못했습니다. 네트워크를 확인해 주세요.');
  if (err instanceof Anthropic.APIError) return new Error(`Anthropic API 오류(${err.status}): ${err.message}`);
  return err;
}

function isCanceled(err) {
  return err && (err.name === 'AbortError' || err instanceof Anthropic.APIUserAbortError || /abort/i.test(err.message || ''));
}

/**
 * @param {{apiKey:string, model?:string, capture:object}} input
 * @param {{client?:Anthropic, tiles?:Array, signal?:AbortSignal, onProgress?:(msg:string)=>void}} deps
 */
async function analyzeReference(input, deps = {}) {
  const apiKey = String(input.apiKey || '').trim();
  if (!apiKey) throw new Error('Anthropic API 키가 설정되지 않았습니다. 설정(⚙)에서 키를 입력해 주세요.');
  if (!input.capture || !input.capture.screenshot) throw new Error('분석할 캡처 데이터가 없습니다.');

  const model = String(input.model || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const progress = typeof deps.onProgress === 'function' ? deps.onProgress : () => {};
  const client = deps.client || new Anthropic({ apiKey, maxRetries: 2, timeout: 10 * 60 * 1000 });

  progress('스크린샷을 분석용 이미지로 변환 중…');
  const tiles = deps.tiles || tileScreenshot(input.capture.screenshot);
  const content = buildUserContent(input.capture, tiles);

  const params = {
    model,
    max_tokens: 16000,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content }],
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: ANALYSIS_SCHEMA },
    },
  };

  progress(`Claude(${model})가 페이지를 분석 중… 1~3분 정도 걸릴 수 있습니다.`);
  let message;
  try {
    message = await runWithFallback(client, params, deps.signal);
  } catch (err) {
    if (isCanceled(err)) throw new Error('분석이 취소되었습니다.');
    throw friendlyApiError(err);
  }

  if (message.stop_reason === 'refusal') {
    const why = message.stop_details?.explanation ? ` (${message.stop_details.explanation})` : '';
    throw new Error(`모델이 이 페이지의 분석을 거절했습니다${why}.`);
  }
  if (message.stop_reason === 'max_tokens') {
    throw new Error('응답이 너무 길어 잘렸습니다. 다시 시도하거나 캡처 높이를 줄여 주세요.');
  }

  const raw = extractJson(message);
  const analysis = normalizeAnalysis(raw);
  return {
    analysis,
    meta: {
      model: message.model || model,
      stopReason: message.stop_reason,
      usage: message.usage || null,
      tiles: tiles.map(({ index, fromPct, toPct, width, height }) => ({ index, fromPct, toPct, width, height })),
      analyzedAt: new Date().toISOString(),
    },
  };
}

// 안전 분류기 거절 시 서버가 다른 모델로 이어서 답하도록 fallbacks 를 켠다.
// 해당 베타를 모르는 환경이면 일반 요청으로 한 번 더 시도한다.
async function runWithFallback(client, params, signal) {
  const options = signal ? { signal } : undefined;
  const supportsBeta = client.beta && client.beta.messages && typeof client.beta.messages.stream === 'function';
  if (supportsBeta) {
    try {
      const stream = client.beta.messages.stream(
        { ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' },
        options,
      );
      return await stream.finalMessage();
    } catch (err) {
      const msg = String(err && err.message || '');
      const betaRejected = err instanceof Anthropic.BadRequestError && /fallback|beta/i.test(msg);
      if (!betaRejected) throw err;
    }
  }
  const stream = client.messages.stream(params, options);
  return stream.finalMessage();
}

async function testConnection({ apiKey, model }) {
  const key = String(apiKey || '').trim();
  if (!key) throw new Error('Anthropic API 키를 입력해 주세요.');
  const client = new Anthropic({ apiKey: key, maxRetries: 1, timeout: 20000 });
  try {
    const info = await client.models.retrieve(String(model || DEFAULT_MODEL).trim());
    return { ok: true, model: info.id, displayName: info.display_name };
  } catch (err) {
    throw friendlyApiError(err);
  }
}

module.exports = {
  analyzeReference,
  testConnection,
  normalizeAnalysis,
  buildUserContent,
  compactLandmarks,
  tileScreenshot,
  extractJson,
  ANALYSIS_SCHEMA,
  SYSTEM_PROMPT,
  DEFAULT_MODEL,
  MODEL_OPTIONS,
  BLOCK_TYPES,
  PATTERN_CATEGORIES,
  EVALUATIONS,
};

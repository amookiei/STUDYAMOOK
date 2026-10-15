// 와이어프레임 블록 종류 (electron/analyzer.js 의 BLOCK_TYPES 와 맞춘다).
// AI 결과(Wireframe.jsx)와 직접 그린 블록(Studio.jsx)이 같은 색/라벨을 쓴다.
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

export const BLOCK_TYPE_IDS = Object.keys(BLOCK_STYLE);
export const styleOf = (type) => BLOCK_STYLE[type] || BLOCK_STYLE.other;

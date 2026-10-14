# UX Reference Studio

URL을 붙여넣으면 페이지를 실제로 렌더링해서 **정보구조 · 와이어프레임 · UX 패턴**을 분석하고,
섹션별로 **내 코멘트**를 달아 Supabase에 쌓아두는 윈도우용 레퍼런스 스터디 앱입니다.

## 구성

| 역할 | 기술 |
|---|---|
| 데스크톱 셸 | Electron 31 |
| UI | React 18 + Vite |
| 페이지 캡처 | Electron 숨김 BrowserWindow (DOM 랜드마크 추출 + 전체 스크린샷) |
| 분석 | Claude API (본인 API 키) |
| 저장 | Supabase (Postgres 테이블 2개 + Storage 버킷 1개) |

## 1. Supabase 준비

1. https://supabase.com 에서 새 프로젝트 생성 (무료 플랜으로 충분)
2. 좌측 **SQL Editor** → `supabase/schema.sql` 내용을 붙여넣고 Run
3. **Project Settings → API** 에서 `Project URL` 과 `anon public` 키 복사

> schema.sql은 개인용으로 anon 키에 모든 권한을 줍니다. 여러 명이 쓰거나 키가 노출될 수 있으면 Supabase Auth를 붙이고 정책을 바꾸세요.

## 2. Anthropic API 키

https://console.anthropic.com 에서 키 발급. 분석 1회당 스크린샷 1장 + 텍스트가 들어가므로 비용은 요청당 수십 원 수준입니다.

## 3. 실행 (개발 모드)

Node.js 20 이상 필요.

```bash
npm install
npm run dev
```

앱이 뜨면 **설정** 에서 Anthropic 키 / Supabase URL / anon 키를 입력합니다.
키는 `%APPDATA%\ux-reference-studio\settings.json` 에만 저장됩니다.

## 4. 윈도우 설치 파일 만들기

```bash
npm run dist
```

`release/` 폴더에 `UX Reference Studio Setup x.x.x.exe` 가 생성됩니다.

## 사용법

1. 왼쪽 상단에 사이트 주소 입력 → **분석하기**
2. 가운데: 스크린샷 / 와이어프레임 블록 / 구조·UX 패턴·평가·스터디 탭
3. 와이어프레임 블록을 클릭하면 오른쪽 코멘트 패널이 그 섹션 기준으로 바뀜
4. 코멘트는 Ctrl+Enter 로 저장. 수정/삭제 가능
5. 왼쪽 라이브러리에 레퍼런스가 쌓임

## 커스터마이즈

- 분석 프롬프트와 JSON 스키마: `electron/analyzer.js`
- DOM에서 어떤 블록을 뽑을지: 같은 파일의 `extractStructureScript`
- 와이어프레임 블록 모양: `src/components/Wireframe.jsx`, `src/styles.css`의 `.wf-*`
- 모델 변경: 설정 화면의 "모델" 칸

## 알려진 한계

- 로그인이 필요한 페이지는 분석할 수 없습니다.
- 봇 차단이 강한 사이트(Cloudflare 챌린지 등)는 스크린샷이 빈 화면으로 나올 수 있습니다.
- 스크린샷은 최대 높이 7000px, 폭 1280px 데스크톱 기준으로 찍습니다. 모바일 뷰 비교는 아직 없습니다.

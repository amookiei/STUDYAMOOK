# UX Reference Studio

웹 페이지 URL 을 입력하면 숨김 브라우저 창으로 페이지를 렌더링해 **DOM 랜드마크 구조와 전체 스크린샷**을 추출하고, 이를 **Anthropic Messages API(Claude)** 로 보내 **정보구조 · 와이어프레임 · UX 패턴** 분석을 구조화된 JSON 으로 받은 뒤 **Supabase** 에 레퍼런스로 저장하는 Windows 데스크톱 앱입니다. (Electron + React/Vite)

## 화면 구성

| 왼쪽 | 가운데 | 오른쪽 |
| --- | --- | --- |
| 레퍼런스 라이브러리 (검색, 선택, 삭제) | 스크린샷 · 와이어프레임 · 분석 탭 | 섹션별 코멘트 (추가 / 수정 / 삭제) |

- 와이어프레임 블록이나 정보구조 항목을 클릭하면 오른쪽 코멘트 패널에서 해당 섹션이 선택됩니다.
- 와이어프레임은 "스크린샷 위에 겹쳐 보기" 로 실제 화면과 비교할 수 있습니다.

## 시작하기 (데스크톱)

설치 파일을 쓰려면 GitHub **Releases** 에서 `UX Reference Studio-Setup-<버전>.exe` 를 내려받아 설치합니다(아래 "Windows 설치 파일 자동 생성" 참고). 소스로 실행하려면:

```bash
npm install
npm run dev        # Vite 개발 서버(5173) + Electron 창
```

> Node.js 20 이상이 필요합니다.

앱이 뜨면 **⚙ 설정** 에서 다음을 입력합니다. 키는 코드에 포함되지 않고 사용자 데이터 폴더(`%APPDATA%\ux-reference-studio\settings.json`)에 저장되며, Windows 에서는 DPAPI 로 암호화됩니다.

1. **Anthropic API 키** (필수) 와 모델 (기본 `claude-opus-5-5`) — https://console.anthropic.com 에서 발급
2. **Supabase 프로젝트 URL + anon key** (선택). 비워 두면 결과가 이 PC(IndexedDB)에만 저장됩니다. 설치 파일을 빌드할 때 환경 변수로 미리 넣어 두었다면 입력하지 않아도 됩니다.
   - https://supabase.com 에서 새 프로젝트 생성 (무료 플랜으로 충분)
   - 좌측 **SQL Editor** → `supabase/schema.sql` 전체를 붙여넣고 Run → `references` / `notes` 테이블과 `screenshots` 버킷 생성
   - **Project Settings → API** 에서 `Project URL` 과 `anon public` 키 복사
   - schema.sql 은 개인용으로 anon 키에 모든 권한을 줍니다. 여러 명이 쓰거나 키가 노출될 수 있으면 Supabase Auth 를 붙이고 정책을 바꾸세요.

키가 없어도 앱은 정상적으로 열리며, 상단 배너와 토스트로 안내만 표시됩니다.

## 분석 흐름

1. URL 입력 → **분석 시작**
2. `electron/capture.js` — 숨김 BrowserWindow 로 페이지 로드 → lazy-load 를 위해 자동 스크롤 → 랜드마크(header/nav/main/aside/footer/section/form/role=…) 추출 → 뷰포트 단위로 스크롤하며 찍은 비트맵을 이어 붙여 전체 스크린샷 생성 (fixed/sticky 요소 반복 방지, 스크롤바 숨김)
3. `electron/analyzer.js` — 스크린샷을 1100px 폭으로 축소해 세로 1500px 타일(최대 8장)로 자르고, 랜드마크 JSON 과 함께 Claude 에 전송. **Structured Outputs(`output_config.format: json_schema`)** 로 `ANALYSIS_SCHEMA` 에 맞는 JSON 을 받고 `normalizeAnalysis()` 로 좌표·enum 을 보정
4. `src/lib/supabase.js` — `screenshots` 버킷에 PNG 업로드 → `references` 행 insert → 라이브러리 갱신
5. 오른쪽 패널에서 섹션별 코멘트를 `notes` 테이블에 저장

### 분석 결과 스키마 (요약)

`electron/analyzer.js` 의 `ANALYSIS_SCHEMA` 를 바꾸면 `src/components/Analysis.jsx` 와 `Wireframe.jsx` 렌더링도 함께 맞춰야 합니다.

```
summary, site_type, target_audience, tags[]
information_architecture.hierarchy[]   { id, name, level, parent_id, purpose, landmark_ids[] }
information_architecture.navigation    { primary[], secondary[], utility[], footer[] }
information_architecture.content_priority[]
wireframe.blocks[]                     { id, label, type, x, y, w, h (페이지 기준 %), section_id, description }
ux_patterns[]                          { name, category, description, location, evaluation, section_id }
insights                               { strengths[], improvements[], takeaways[] }
```

## 스크립트

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | Vite + Electron 개발 실행 (`VITE_DEV_SERVER_URL` 로 연결) |
| `npm run build` | 렌더러 빌드 → `dist/` |
| `npm start` | 빌드 후 프로덕션 모드(`dist/index.html`)로 실행 |
| `npm run dist` | Windows NSIS 설치 파일 생성 → `release/UX Reference Studio-Setup-<버전>.exe` |
| `npm run dist:dir` | 설치 파일 없이 패키징만 (`release/win-unpacked`) |
| `npm run check` | Electron 쪽 JS 문법 검사 |

## 웹 배포 (Vercel)

GitHub 저장소를 Vercel 에 연결해 두면 푸시할 때마다 자동으로 배포됩니다. `vercel.json` 이 빌드와 함수 설정을 담고 있습니다.

| 항목 | 값 |
| --- | --- |
| Framework | Vite (정적 프런트엔드) + `api/*.js` 서버리스 함수 |
| Install | `ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci` (Electron 바이너리 다운로드 생략) |
| Build | `npm run build` → `dist/` |
| 브랜치 | PR 브랜치 → Preview, `main` → Production |

### 웹에서 캡처·분석이 동작하게 하려면 (Hobby 플랜 기준)

1. Vercel 프로젝트 → **Settings → Environment Variables** 에 두 값을 추가하고 다시 배포합니다.
   | 변수 | 값 |
   | --- | --- |
   | `ANTHROPIC_API_KEY` | Anthropic 콘솔에서 발급한 키. 브라우저에는 절대 내려가지 않고 서버 함수만 사용합니다. |
   | `STUDIO_CODE` | 나만 아는 입장 코드. 웹을 열면 이 코드를 입력해야 앱이 보이고, 모든 서버 호출에도 이 코드가 필요합니다. |
   | `VITE_SUPABASE_URL` | (선택) Supabase Project URL. 넣어 두면 설정 화면에 입력할 필요가 없습니다. |
   | `VITE_SUPABASE_ANON_KEY` | (선택) Supabase anon public 키. |
2. 배포된 사이트를 열고 **입장 코드**를 입력합니다 (이 브라우저에만 저장되며, 상단 "잠금" 버튼으로 지울 수 있습니다).
3. Supabase 환경 변수를 넣지 않았다면 설정(⚙)에서 **Supabase URL / anon key** 를 입력합니다. 스크린샷과 결과는 Supabase 에 저장됩니다(`supabase/schema.sql` 실행 필요).
4. URL 을 입력하고 **분석 시작**. 서버에서 캡처(10~40초)와 Claude 분석(1~3분)이 차례로 진행됩니다.

Supabase 환경 변수는 빌드 시점에 번들에 들어가므로(anon 키는 공개용 키입니다) 값을 바꾼 뒤에는 Redeploy 가 필요합니다. 설정 화면에 직접 입력한 값이 있으면 그 값이 환경 변수보다 우선합니다.

서버리스 함수 구성:

| 함수 | 역할 | 제한 |
| --- | --- | --- |
| `api/capture.js` | 헤드리스 Chromium(@sparticuz/chromium + playwright-core)으로 렌더링 → 랜드마크 추출 → 스크롤 분할 캡처를 sharp 로 이어 붙여 Supabase 스토리지에 업로드 | 최대 120초, 폭 1920px·높이 12000px |
| `api/analyze.js` | 스토리지의 PNG 를 내려받아 타일로 자르고 Claude 호출 | 최대 300초 (Hobby 의 Fluid compute 상한) |
| `api/health.js` | 서버 설정 상태, 모델 목록, 입장 코드 확인, 연결 테스트 | |

- 내부망/사설 IP 주소 캡처는 서버에서 차단합니다(SSRF 방지).
- 함수 실행 시간이 300초를 넘기면 Vercel 이 요청을 끊습니다. 긴 페이지는 설정의 최대 캡처 높이를 줄이거나 Sonnet/Haiku 모델을 쓰세요.
- 로컬에서 함수를 시험할 때는 `CHROMIUM_PATH`(로컬 Chromium 경로), `UX_ALLOW_PRIVATE_URL=1`, `UX_ALLOW_HTTP_SCREENSHOT=1` 환경 변수를 쓸 수 있습니다. 운영 배포에서는 설정하지 마세요.

## Windows 설치 파일 자동 생성 (GitHub Actions)

`.github/workflows/windows-installer.yml` 이 Windows 러너에서 `npm run dist` 를 실행합니다.

- 태그를 푸시하면(`git tag v0.1.0 && git push origin v0.1.0`) 빌드 후 GitHub **Release** 에 `.exe` 가 첨부됩니다.
- Actions 탭 → "Windows installer" → **Run workflow** 로 수동 실행하면 Artifacts 에서 내려받을 수 있습니다.
- 설치 파일에 Supabase 를 미리 넣으려면 저장소 Settings → Secrets and variables → Actions 에 Variable `VITE_SUPABASE_URL` 과 Secret `VITE_SUPABASE_ANON_KEY` 를 추가합니다. Anthropic 키는 설치 파일에 넣지 않습니다(앱 설정에서 입력).

## API 키 없이 쓸 수 있나?

Claude 호출에는 Anthropic 계정의 자격 증명이 반드시 필요합니다. 다만 "설정 화면에 키를 붙여넣는" 방식 말고도 다음이 됩니다.

- **데스크톱**: 설정의 키를 비워 두면 SDK 가 `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` 환경 변수나 `ant auth login` 으로 만든 프로필(`~/.config/anthropic/`)을 자동으로 씁니다.
- **웹**: 키는 Vercel 환경 변수에만 있고 사용자는 입장 코드만 입력합니다. 장기 키 대신 Vercel OIDC 와 Anthropic Workload Identity Federation 을 연결해 단기 토큰을 쓰는 방법도 있습니다.

## 폴더 구조

```
electron/
  main.js        창 생성, IPC 핸들러, 개발서버/dist 로드 분기
  preload.js     contextBridge → window.uxStudio
  capture.js     숨김 창 캡처 + 랜드마크 추출
  analyzer.js    프롬프트, 출력 스키마, Anthropic 호출, 결과 정규화
  settings.js    설정 저장 (safeStorage 암호화)
src/
  App.jsx        3컬럼 레이아웃, 분석 파이프라인 상태, 코멘트 CRUD
  components/    Library · Screenshot · Wireframe · Analysis · Comments · SettingsModal
  lib/           bridge(IPC 래퍼, 웹 모드에서는 /api 호출) · supabase · localStore(IndexedDB) · store(백엔드 선택)
shared/extract.js  DOM 랜드마크 추출 스크립트, URL 검사 (Electron / 서버 공용)
api/             Vercel 서버리스 함수 (capture, analyze, health, _lib)
supabase/schema.sql
vercel.json      Vercel 웹 배포 설정
.github/workflows/windows-installer.yml  Windows 설치 파일 빌드
```

## IPC 채널

| 채널 | 방향 | 용도 |
| --- | --- | --- |
| `settings:get` / `settings:save` / `settings:test-anthropic` | invoke | 설정 |
| `capture:page` | invoke | URL 캡처 |
| `analysis:run` / `analysis:cancel` | invoke | Claude 분석 |
| `progress` | main → renderer | 진행 상황 메시지 |
| `shell:open-external` / `app:info` | invoke | 기타 |

## 문제 해결

- **설정 저장 후에도 "키 없음" 배너가 보임** — 설정 모달에서 **저장** 을 눌렀는지 확인하세요. 저장 파일 위치는 설정 모달 안내 참고.
- **Supabase 저장 실패: relation does not exist** — `supabase/schema.sql` 을 실행하지 않은 상태입니다.
- **페이지 로딩 타임아웃** — 봇 차단이 강한 사이트는 캡처가 실패할 수 있습니다. 다른 페이지로 시도하거나 캡처 폭을 바꿔 보세요.
- **아주 긴 페이지** — 설정의 "최대 캡처 높이" 까지만 찍습니다(기본 12,000px).

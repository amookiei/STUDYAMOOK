# UX Reference Studio

웹 페이지 URL 을 입력하면 숨김 브라우저 창으로 페이지를 렌더링해 **DOM 랜드마크 구조와 전체 스크린샷**을 추출하고, 이를 **Anthropic Messages API(Claude)** 로 보내 **정보구조 · 와이어프레임 · UX 패턴** 분석을 구조화된 JSON 으로 받은 뒤 **Supabase** 에 레퍼런스로 저장하는 Windows 데스크톱 앱입니다. (Electron + React/Vite)

## 화면 구성

| 왼쪽 | 가운데 | 오른쪽 |
| --- | --- | --- |
| 레퍼런스 라이브러리 (검색, 선택, 삭제) | 스크린샷 · 와이어프레임 · 분석 탭 | 섹션별 코멘트 (추가 / 수정 / 삭제) |

- 와이어프레임 블록이나 정보구조 항목을 클릭하면 오른쪽 코멘트 패널에서 해당 섹션이 선택됩니다.
- 와이어프레임은 "스크린샷 위에 겹쳐 보기" 로 실제 화면과 비교할 수 있습니다.

## 시작하기

```bash
npm install
npm run dev        # Vite 개발 서버(5173) + Electron 창
```

> Node.js 20 이상이 필요합니다.

앱이 뜨면 **⚙ 설정** 에서 다음을 입력합니다. 키는 코드에 포함되지 않고 사용자 데이터 폴더(`%APPDATA%\ux-reference-studio\settings.json`)에 저장되며, Windows 에서는 DPAPI 로 암호화됩니다.

1. **Anthropic API 키** (필수) 와 모델 (기본 `claude-opus-5-5`) — https://console.anthropic.com 에서 발급
2. **Supabase 프로젝트 URL + anon key** (선택). 비워 두면 결과가 이 PC(IndexedDB)에만 저장됩니다.
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

## Vercel 웹 배포 (뷰어 모드)

GitHub 저장소를 Vercel 에 연결해 두면 푸시할 때마다 자동으로 배포됩니다. `vercel.json` 이 빌드 설정을 담고 있습니다.

| 항목 | 값 |
| --- | --- |
| Framework | Vite |
| Install | `ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci` (Electron 바이너리 다운로드 생략) |
| Build | `npm run build` → `dist/` |
| 브랜치 | PR 브랜치 → Preview, `main` → Production |

웹으로 열면 **뷰어 모드**로 동작합니다. 페이지 캡처와 Claude 분석은 Electron 메인 프로세스에서만 실행되므로 웹에서는 안내만 표시되고, 설정에서 Supabase 를 연결하면 데스크톱 앱에서 저장한 레퍼런스를 보고 코멘트를 추가·수정·삭제할 수 있습니다. 웹 모드의 설정은 브라우저 localStorage 에만 저장되며 Anthropic 키는 저장하지 않습니다.

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
  lib/           bridge(IPC 래퍼, 웹 뷰어 모드 폴백) · supabase · localStore(IndexedDB) · store(백엔드 선택)
supabase/schema.sql
vercel.json      Vercel 웹 배포 설정
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

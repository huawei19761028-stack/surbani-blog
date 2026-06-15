# 써바니 블로그 글 생성기

[![License](https://img.shields.io/github/license/huawei19761028-stack/surbani-blog)](LICENSE)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-onrender.com-46d3aa)](https://surbani-blog.onrender.com)

칼갈이 · 미용가위 연마 전문 업체 **써바니** 의 블로그 글을 Claude API 로 자동 생성하는 웹앱입니다.
**네이버 블로그 상위노출(C-Rank·DIA)과 신뢰성(E-E-A-T)** 을 동시에 노린 글 구조로 작성됩니다.

**▶ 라이브 데모: https://surbani-blog.onrender.com**

> Render 무료 플랜은 15분 미사용 시 슬립 상태가 되어, 첫 접속이 30~50초 걸릴 수 있습니다(이후 빠름).

- **프론트엔드:** Vite + React + TypeScript + Tailwind CSS
- **백엔드:** Express 프록시 (API 키 보호 + CORS 우회)
- **모델:** `claude-sonnet-4-6`
- **배포:** [Render](https://render.com) — https://surbani-blog.onrender.com
- **저장소:** https://github.com/huawei19761028-stack/surbani-blog

## 데모

![데모](docs/demo.gif)

> 폼 입력 → 생성 → 제목·본문·태그 출력까지 (2배속).

## 화면

![사용 화면](docs/screenshot.png)

> 좌측 작업 이력 · 가운데 입력 폼 · 하단 생성 결과(제목·본문·태그).

## 클론

```bash
git clone https://github.com/huawei19761028-stack/surbani-blog.git
cd surbani-blog
```

## 구조

```
.
├── server.js          # Express 프록시 (포트 3001) — Anthropic API 중계
├── vite.config.ts     # /api → localhost:3001 프록시 설정
├── src/
│   ├── App.tsx        # 메인 UI / 폼 / 생성 로직 / 작업 이력
│   ├── main.tsx
│   └── index.css      # Tailwind
├── .env.example       # API 키 템플릿
└── package.json
```

브라우저는 `api.anthropic.com` 을 직접 호출하지 않습니다. 프론트는 `/api/generate`
로 요청하고, Express 서버가 `.env` 의 키를 붙여 Anthropic 으로 중계합니다.
덕분에 **API 키가 브라우저에 노출되지 않고 CORS 문제도 없습니다.**

## 실행 방법

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

`.env.example` 를 복사해 `.env` 를 만들고 실제 API 키를 넣으세요.

```bash
cp .env.example .env
```

```env
ANTHROPIC_API_KEY=sk-ant-여기에_실제_키
```

> `.env` 는 `.gitignore` 에 포함되어 커밋되지 않습니다.

### 3. 개발 서버 실행 (서버 + 프론트 동시)

```bash
npm run dev
```

`concurrently` 가 다음 두 개를 한 번에 띄웁니다.

- Express 프록시 → http://localhost:3001
- Vite 개발 서버 → http://localhost:5173

브라우저에서 **http://localhost:5173** 접속.

### 4. 프로덕션 빌드 (선택)

```bash
npm run build     # 타입체크 + 정적 빌드 → dist/
npm start         # node server.js — API + 빌드된 프론트를 한 서버에서 서빙 (http://localhost:3001)
```

> 실제 배포는 아래 [배포](#배포) 섹션 참고.

## 사용법

1. 입력값을 채웁니다. (`주제/소재` 만 필수, 나머지는 채울수록 품질↑)
   - **핵심 타겟 키워드**: 상위노출을 노리는 검색어 (예: `인천 미용가위 연마`)
   - **지역**: 로컬 SEO 용 지역명
   - **업체 정보**: 상호·연락처·영업시간·경력 → 신뢰 요소와 CTA 에 반영
   - **실제 사례/경험 메모**: 전후 비교·후기 → 신뢰성(E-E-A-T) 강화
   - **분량**: 표준(1,500자) / 풍부(2,500자)
2. **네이버 블로그 글 생성** 클릭 → 다음이 한 번에 생성됩니다.
   - **제목** + **제목 후보(A/B) 2개**
   - **검색 노출 요약(메타 설명)**
   - **본문**: 도입 → 원인 → 해결 → 과정 → 실제 사례(전후) → FAQ → CTA 구조,
     `■ 소제목` 구획, `[사진: 설명]` 위치 마커 포함
   - **해시태그 12~20개** (지역+서비스 조합)
3. 생성 글은 자동으로 **작업 이력(localStorage)** 에 저장됩니다.
4. 좌측 이력에서 **다시 불러오기 / 삭제** 가능합니다.
5. **전체 복사** 로 제목+본문+태그를 클립보드에 복사 → 네이버 에디터에 붙여넣기.

> 출력은 Claude **구조화 출력(tool use)** 으로 받아 JSON 파싱이 깨지지 않습니다.
> 본문의 마크다운 잔재는 자동 제거되어 네이버 에디터에 그대로 붙여넣을 수 있습니다.
> 사진은 미리보기·생성 참고용으로만 쓰이며 **저장되지 않습니다.**

## 배포

운영 환경에서는 **서버 하나(`server.js`)가 API 프록시와 빌드된 프론트엔드를 함께 서빙**합니다.
`dist/` 빌드 결과가 있으면 `server.js` 가 자동으로 정적 파일을 제공합니다.

```bash
npm install
npm run build   # → dist/ 생성
npm start       # node server.js — API + 프론트 동시 서빙 (기본 3001, PORT 환경변수 우선)
```

> 운영 서버는 `.env` 대신 **호스팅 플랫폼의 환경변수**에 `ANTHROPIC_API_KEY` 를 등록하세요.
> 키는 절대 저장소에 커밋하지 않습니다.

### Render / Railway / Fly.io (Node 호스트 — 권장)

단일 Node 서비스로 가장 간단하게 배포됩니다.

| 설정 | 값 |
| --- | --- |
| Build Command | `npm install && npm run build` |
| Start Command | `npm start` |
| 환경변수 | `ANTHROPIC_API_KEY` = 실제 키 |
| 포트 | 플랫폼이 주입하는 `PORT` 를 자동 사용 (코드에서 `process.env.PORT` 처리됨) |

배포 후 해당 도메인으로 접속하면 프론트가 뜨고, `/api/generate` 호출도 같은 서버에서 처리됩니다.

### Vercel / Netlify (정적 + 서버리스)

프론트는 정적으로 빌드(`dist/`)하고, `/api/generate` 는 서버리스 함수로 옮기는 방식도 가능합니다.
이 경우 `server.js` 의 중계 로직을 `api/generate.js`(Vercel) 또는 Netlify Function 으로 이식하고,
`ANTHROPIC_API_KEY` 를 해당 플랫폼 환경변수에 등록하면 됩니다.

## 트러블슈팅

| 증상 | 원인 / 해결 |
| --- | --- |
| `ANTHROPIC_API_KEY 가 설정되지 않았습니다` | `.env` 파일과 키를 확인하고 `npm run dev` 재실행 |
| 401 / 인증 오류 | API 키가 유효한지, 결제(크레딧)가 활성화됐는지 확인 |
| `/api/generate` 404 | 프록시 서버(3001)가 떴는지 확인 (`npm run dev` 가 둘 다 띄움) |

## 라이선스

이 프로젝트는 [MIT License](LICENSE) 를 따릅니다. © 2026 써바니

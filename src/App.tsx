import { useEffect, useMemo, useState } from "react";

// ── 타입 ─────────────────────────────────────────────
interface Post {
  id: string;
  title: string;
  titleAlternatives: string[]; // 제목 후보 (A/B)
  summary: string; // 검색 노출용 요약 (스니펫)
  body: string;
  tags: string[];
  createdAt: string; // ISO 문자열
}

interface FormState {
  serviceType: string;
  topic: string;
  targetKeyword: string; // 핵심 노출(타겟) 키워드
  region: string;
  tone: string;
  keywords: string; // 보조 키워드
  businessInfo: string; // 상호·연락처·영업시간·경력 등 (신뢰/CTA)
  experience: string; // 실제 사례·전후 비교 메모 (신뢰성)
  length: string;
  extra: string;
}

interface PhotoPreview {
  id: string;
  url: string; // objectURL — 저장하지 않음
  name: string;
}

const STORAGE_KEY = "surbani-blog-history";

const SERVICE_TYPES = [
  "주방칼 갈이",
  "미용가위 연마",
  "애견미용 가위 연마",
  "전문가용 칼 연마",
  "가위·칼 종합 관리",
];

const TONES = [
  "친근하고 따뜻한",
  "전문적이고 신뢰감 있는",
  "정보 전달 위주의 깔끔한",
  "후기·스토리텔링 형식",
];

const LENGTHS = [
  { label: "표준 (약 1,500자)", value: "1500" },
  { label: "풍부 (약 2,500자)", value: "2500" },
];

// ── 유틸 ─────────────────────────────────────────────
function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function loadHistory(): Post[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // 구버전 글(필드 누락) 호환
    return (parsed as Partial<Post>[]).map((p) => ({
      id: p.id ?? uid(),
      title: p.title ?? "제목 없음",
      titleAlternatives: Array.isArray(p.titleAlternatives)
        ? p.titleAlternatives
        : [],
      summary: p.summary ?? "",
      body: p.body ?? "",
      tags: Array.isArray(p.tags) ? p.tags : [],
      createdAt: p.createdAt ?? new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}

function saveHistory(posts: Post[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// 네이버 에디터에 그대로 붙여넣을 수 있도록 마크다운 잔재 제거
function cleanBody(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1") // **볼드** → 볼드
    .replace(/^#{1,6}\s+/gm, "") // # 제목 → 제목
    .replace(/`([^`]*)`/g, "$1"); // `code` → code
}

// 구조화 출력 결과 객체 → Post 필드로 정규화
function normalize(obj: Record<string, unknown>): Omit<Post, "id" | "createdAt"> {
  return {
    title: String(obj.title ?? "제목 없음"),
    titleAlternatives: Array.isArray(obj.titleAlternatives)
      ? obj.titleAlternatives.map(String)
      : [],
    summary: String(obj.summary ?? ""),
    body: cleanBody(String(obj.body ?? "")),
    tags: Array.isArray(obj.tags) ? obj.tags.map(String) : [],
  };
}

// 텍스트 응답(폴백)에서 JSON 블록을 안전하게 파싱
function parseTextFallback(text: string): Omit<Post, "id" | "createdAt"> {
  let jsonStr = text.trim();
  const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) jsonStr = fence[1].trim();
  const first = jsonStr.indexOf("{");
  const last = jsonStr.lastIndexOf("}");
  if (first !== -1 && last !== -1) jsonStr = jsonStr.slice(first, last + 1);
  try {
    return normalize(JSON.parse(jsonStr));
  } catch {
    return {
      title: "생성된 글",
      titleAlternatives: [],
      summary: "",
      body: text,
      tags: [],
    };
  }
}

// 글 작성 결과 스키마 (Anthropic tool use — API 가 이 형태의 JSON 을 보장)
const BLOG_TOOL = {
  name: "write_blog_post",
  description: "네이버 블로그용 글을 구조화된 형식으로 작성합니다.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "메인 제목 (25~40자, 키워드+지역 앞배치)" },
      titleAlternatives: {
        type: "array",
        items: { type: "string" },
        description: "제목 후보 2개",
      },
      summary: { type: "string", description: "검색 노출용 2~3문장 요약(메타 설명)" },
      body: {
        type: "string",
        description:
          "본문. 문단은 \\n\\n, 소제목은 '■ ', 사진 위치는 '[사진: 설명]'. 마크다운 기호 금지.",
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "해시태그 12~20개 (지역+서비스 조합 포함, # 없이)",
      },
    },
    required: ["title", "summary", "body", "tags"],
  },
} as const;

// ── 컴포넌트 ─────────────────────────────────────────
export default function App() {
  const [form, setForm] = useState<FormState>({
    serviceType: SERVICE_TYPES[0],
    topic: "",
    targetKeyword: "",
    region: "",
    tone: TONES[1],
    keywords: "",
    businessInfo: "",
    experience: "",
    length: LENGTHS[0].value,
    extra: "",
  });

  const [photos, setPhotos] = useState<PhotoPreview[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [current, setCurrent] = useState<Post | null>(null);
  const [history, setHistory] = useState<Post[]>(() => loadHistory());

  useEffect(() => {
    return () => {
      photos.forEach((p) => URL.revokeObjectURL(p.url));
    };
  }, [photos]);

  const canGenerate = useMemo(
    () => form.topic.trim().length > 0 && !loading,
    [form.topic, loading]
  );

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const next = files.map((file) => ({
      id: uid(),
      url: URL.createObjectURL(file),
      name: file.name,
    }));
    setPhotos((prev) => [...prev, ...next]);
    e.target.value = "";
  }

  function removePhoto(id: string) {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((p) => p.id !== id);
    });
  }

  async function generate() {
    setLoading(true);
    setError(null);

    // 네이버 블로그 상위노출(C-Rank/DIA) + 신뢰(E-E-A-T) 지향 시스템 프롬프트
    const system = [
      "당신은 네이버 블로그 상위노출에 정통한 '써바니'(칼갈이·미용가위 연마 전문 업체)의 블로그 전문 작성자입니다.",
      "신뢰성(경험·전문성·정직함)과 네이버 검색 노출(C-Rank·DIA)을 동시에 만족하는 한국어 글을 작성합니다.",
      "",
      "[작성 원칙]",
      "1. 제목: 핵심 타겟 키워드와 지역명을 앞쪽에 자연스럽게 포함. 25~40자. 과장·낚시성 표현 금지. 검색자가 실제로 칠 법한 표현 사용.",
      `2. 분량: 본문 약 ${form.length}자 이상. 정보량이 충분해야 합니다.`,
      "3. 구조(순서대로): ① 공감되는 도입(후킹) ② 문제/원인 설명 ③ 해결책=서비스 소개 ④ 작업 과정·방법 ⑤ 실제 사례·전후(before/after) 비교로 신뢰 부여 ⑥ 자주 묻는 질문(FAQ 3개 내외) ⑦ 마무리 + 연락/예약 안내(CTA).",
      "4. 소제목: 각 섹션을 '■ 소제목' 형태의 한 줄로 구분(네이버 가독성↑). 마크다운 #/##/** 기호는 절대 쓰지 마세요. 본문은 네이버 에디터에 그대로 붙여넣을 plain text 입니다.",
      "5. 키워드: 타겟 키워드를 본문에 자연스럽게 3~6회 반복(억지·과다 반복 금지). 보조 키워드도 문맥에 녹이세요.",
      "6. 신뢰성: 구체적인 수치·작업 경력·실제 경험·주의사항·솔직한 한계를 포함. 허위·과장·미검증 효능 주장 금지.",
      "7. 사진: 사진이 들어갈 위치를 본문 곳곳에 '[사진: 무엇을 보여줄지 설명]' 형태로 5~8개 표시하세요.",
      `8. 톤: ${form.tone}. 사람이 직접 쓴 듯 자연스럽게. AI 특유의 기계적 반복·뻔한 마무리 금지.`,
      "9. 해시태그: 지역명+서비스 조합을 포함해 12~20개.",
      "10. 의료·과장 표현, 광고 심의 위반 소지 표현은 피하고 정보+경험 중심으로 작성.",
      "",
      "결과는 반드시 write_blog_post 도구를 호출해 전달하세요.",
    ].join("\n");

    const photoNote =
      photos.length > 0
        ? `\n- 첨부 사진 ${photos.length}장: ${photos
            .map((p) => p.name)
            .join(", ")}`
        : "";

    const userPrompt =
      `다음 조건으로 네이버 블로그용 글을 작성해 주세요.\n` +
      `- 서비스 종류: ${form.serviceType}\n` +
      `- 글 주제/소재: ${form.topic}\n` +
      (form.targetKeyword
        ? `- 핵심 타겟 키워드(상위노출 목표): ${form.targetKeyword}\n`
        : "") +
      (form.region ? `- 지역(로컬 SEO): ${form.region}\n` : "") +
      `- 글의 톤: ${form.tone}\n` +
      (form.keywords ? `- 보조 키워드: ${form.keywords}\n` : "") +
      (form.businessInfo
        ? `- 업체 정보(상호·연락처·영업시간·경력 등, CTA·신뢰에 활용): ${form.businessInfo}\n`
        : "") +
      (form.experience
        ? `- 실제 사례·경험·전후 비교 메모(신뢰성 강화에 활용): ${form.experience}\n`
        : "") +
      (form.extra ? `- 추가 요청사항: ${form.extra}\n` : "") +
      photoNote;

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system,
          messages: [{ role: "user", content: userPrompt }],
          tools: [BLOG_TOOL],
          tool_choice: { type: "tool", name: BLOG_TOOL.name },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data?.error?.message || data?.error || `요청 실패 (${res.status})`
        );
      }

      // 구조화 출력: tool_use 블록의 input 이 검증된 JSON 객체
      const blocks: Array<Record<string, unknown>> = Array.isArray(
        data?.content
      )
        ? data.content
        : [];
      const toolBlock = blocks.find((b) => b.type === "tool_use");
      let parsed: Omit<Post, "id" | "createdAt">;
      if (toolBlock?.input) {
        parsed = normalize(toolBlock.input as Record<string, unknown>);
      } else {
        // 폴백: 텍스트 응답
        const textBlock = blocks.find((b) => b.type === "text");
        const text = String(textBlock?.text ?? "");
        if (!text) throw new Error("응답에서 본문을 찾을 수 없습니다.");
        parsed = parseTextFallback(text);
      }
      const post: Post = {
        id: uid(),
        createdAt: new Date().toISOString(),
        ...parsed,
      };

      setCurrent(post);
      const nextHistory = [post, ...history];
      setHistory(nextHistory);
      saveHistory(nextHistory);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function loadPost(post: Post) {
    setCurrent(post);
    setError(null);
  }

  function deletePost(id: string) {
    const next = history.filter((p) => p.id !== id);
    setHistory(next);
    saveHistory(next);
    if (current?.id === id) setCurrent(null);
  }

  function copyBody() {
    if (!current) return;
    const text = `${current.title}\n\n${current.body}\n\n${current.tags
      .map((t) => "#" + t)
      .join(" ")}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const charCount = current ? current.body.replace(/\s/g, "").length : 0;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <header className="bg-slate-900 text-white">
        <div className="mx-auto max-w-7xl px-6 py-5">
          <h1 className="text-xl font-bold tracking-tight">
            🔪 써바니 블로그 글 생성기
          </h1>
          <p className="text-sm text-slate-300">
            칼갈이 · 미용가위 연마 전문 — 네이버 노출·신뢰 최적화 블로그 글 작성
          </p>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-[260px_1fr]">
        {/* ── 좌측: 작업 이력 ── */}
        <aside className="lg:sticky lg:top-6 lg:h-fit">
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">
              작업 이력 ({history.length})
            </h2>
            {history.length === 0 ? (
              <p className="text-xs text-slate-400">
                아직 생성한 글이 없습니다.
              </p>
            ) : (
              <ul className="space-y-2">
                {history.map((p) => (
                  <li
                    key={p.id}
                    className={`group rounded-lg border p-2 text-sm transition ${
                      current?.id === p.id
                        ? "border-blue-400 bg-blue-50"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <button
                      onClick={() => loadPost(p)}
                      className="block w-full text-left"
                    >
                      <span className="line-clamp-2 font-medium text-slate-800">
                        {p.title}
                      </span>
                      <span className="mt-1 block text-[11px] text-slate-400">
                        {formatDate(p.createdAt)}
                      </span>
                    </button>
                    <button
                      onClick={() => deletePost(p.id)}
                      className="mt-1 text-[11px] text-red-400 opacity-0 transition group-hover:opacity-100 hover:text-red-600"
                    >
                      삭제
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* ── 우측: 폼 + 결과 ── */}
        <main className="space-y-6">
          <section className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-slate-800">
              글 정보 입력
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-600">
                  서비스 종류
                </span>
                <select
                  value={form.serviceType}
                  onChange={(e) => update("serviceType", e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-400"
                >
                  {SERVICE_TYPES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>

              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-600">
                  글의 톤
                </span>
                <select
                  value={form.tone}
                  onChange={(e) => update("tone", e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-400"
                >
                  {TONES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>

              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block font-medium text-slate-600">
                  주제 / 소재 <span className="text-red-500">*</span>
                </span>
                <input
                  value={form.topic}
                  onChange={(e) => update("topic", e.target.value)}
                  placeholder="예) 무뎌진 미용가위, 연마로 새것처럼 되살리기"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-400"
                />
              </label>

              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-600">
                  핵심 타겟 키워드{" "}
                  <span className="text-xs font-normal text-blue-500">
                    (상위노출 목표)
                  </span>
                </span>
                <input
                  value={form.targetKeyword}
                  onChange={(e) => update("targetKeyword", e.target.value)}
                  placeholder="예) 인천 미용가위 연마"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-400"
                />
              </label>

              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-600">
                  지역 (로컬 SEO)
                </span>
                <input
                  value={form.region}
                  onChange={(e) => update("region", e.target.value)}
                  placeholder="예) 인천 부평구"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-400"
                />
              </label>

              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-600">
                  보조 키워드
                </span>
                <input
                  value={form.keywords}
                  onChange={(e) => update("keywords", e.target.value)}
                  placeholder="쉼표 구분 (예: 가위연마, 칼갈이, 방문)"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-400"
                />
              </label>

              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-600">
                  분량
                </span>
                <select
                  value={form.length}
                  onChange={(e) => update("length", e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-400"
                >
                  {LENGTHS.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block font-medium text-slate-600">
                  업체 정보{" "}
                  <span className="text-xs font-normal text-slate-400">
                    (상호·연락처·영업시간·경력 → 신뢰·CTA 에 활용)
                  </span>
                </span>
                <input
                  value={form.businessInfo}
                  onChange={(e) => update("businessInfo", e.target.value)}
                  placeholder="예) 써바니 / 카톡 @surbani / 평일 9-18시 / 경력 15년 / 방문·택배 가능"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-400"
                />
              </label>

              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block font-medium text-slate-600">
                  실제 사례 / 경험 메모{" "}
                  <span className="text-xs font-normal text-slate-400">
                    (전후 비교·후기 → 신뢰성 강화)
                  </span>
                </span>
                <textarea
                  value={form.experience}
                  onChange={(e) => update("experience", e.target.value)}
                  rows={2}
                  placeholder="예) 10년 쓴 미용가위, 날 벌어짐·끊김 → 연마 후 깔끔하게 잘림. 미용실 원장님 재방문 후기 등"
                  className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-400"
                />
              </label>

              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block font-medium text-slate-600">
                  추가 요청사항
                </span>
                <textarea
                  value={form.extra}
                  onChange={(e) => update("extra", e.target.value)}
                  rows={2}
                  placeholder="예) 마지막에 카카오톡 상담 안내를 넣어주세요"
                  className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-400"
                />
              </label>

              {/* 사진 (저장 안 됨) */}
              <div className="text-sm sm:col-span-2">
                <span className="mb-1 block font-medium text-slate-600">
                  사진 첨부{" "}
                  <span className="text-xs font-normal text-slate-400">
                    (미리보기용 — 저장되지 않음)
                  </span>
                </span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={onPhotos}
                  className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-200 file:px-3 file:py-2 file:text-sm file:text-slate-700 hover:file:bg-slate-300"
                />
                {photos.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {photos.map((p) => (
                      <div key={p.id} className="relative">
                        <img
                          src={p.url}
                          alt={p.name}
                          className="h-20 w-20 rounded-lg object-cover"
                        />
                        <button
                          onClick={() => removePhoto(p.id)}
                          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={generate}
                disabled={!canGenerate}
                className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {loading ? "생성 중… (20~40초)" : "네이버 블로그 글 생성"}
              </button>
              {error && <span className="text-sm text-red-600">⚠ {error}</span>}
            </div>
          </section>

          {/* 결과 */}
          {current && (
            <section className="rounded-xl bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-slate-900">
                    {current.title}
                  </h2>
                  <p className="mt-1 text-xs text-slate-400">
                    {formatDate(current.createdAt)} · 본문 {charCount}자
                  </p>
                </div>
                <button
                  onClick={copyBody}
                  className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                >
                  {copied ? "복사됨 ✓" : "전체 복사"}
                </button>
              </div>

              {/* 제목 후보 */}
              {current.titleAlternatives.length > 0 && (
                <div className="mb-3 rounded-lg bg-amber-50 p-3 text-sm">
                  <span className="font-medium text-amber-700">
                    제목 후보(A/B)
                  </span>
                  <ul className="mt-1 list-disc pl-5 text-slate-600">
                    {current.titleAlternatives.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 검색 노출용 요약 */}
              {current.summary && (
                <div className="mb-4 rounded-lg bg-blue-50 p-3 text-sm">
                  <span className="font-medium text-blue-700">
                    검색 노출 요약(메타)
                  </span>
                  <p className="mt-1 text-slate-600">{current.summary}</p>
                </div>
              )}

              <article className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-700">
                {current.body}
              </article>

              {current.tags.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                  {current.tags.map((t, i) => (
                    <span
                      key={i}
                      className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

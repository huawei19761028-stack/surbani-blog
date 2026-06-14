import { useEffect, useMemo, useState } from "react";

// ── 타입 ─────────────────────────────────────────────
interface Post {
  id: string;
  title: string;
  body: string;
  tags: string[];
  createdAt: string; // ISO 문자열
}

interface FormState {
  serviceType: string;
  topic: string;
  region: string;
  tone: string;
  keywords: string;
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

// ── 유틸 ─────────────────────────────────────────────
function uid(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  );
}

function loadHistory(): Post[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Post[]) : [];
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

// 모델 응답 텍스트에서 JSON 블록을 안전하게 파싱
function parseGenerated(text: string): {
  title: string;
  body: string;
  tags: string[];
} {
  let jsonStr = text.trim();

  // ```json ... ``` 코드펜스 제거
  const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) jsonStr = fence[1].trim();

  // 첫 { 부터 마지막 } 까지 추출 시도
  const first = jsonStr.indexOf("{");
  const last = jsonStr.lastIndexOf("}");
  if (first !== -1 && last !== -1) {
    jsonStr = jsonStr.slice(first, last + 1);
  }

  try {
    const obj = JSON.parse(jsonStr);
    return {
      title: String(obj.title ?? "제목 없음"),
      body: String(obj.body ?? text),
      tags: Array.isArray(obj.tags) ? obj.tags.map(String) : [],
    };
  } catch {
    // 파싱 실패 시 원문을 본문으로 사용
    return { title: "생성된 글", body: text, tags: [] };
  }
}

// ── 컴포넌트 ─────────────────────────────────────────
export default function App() {
  const [form, setForm] = useState<FormState>({
    serviceType: SERVICE_TYPES[0],
    topic: "",
    region: "",
    tone: TONES[0],
    keywords: "",
    extra: "",
  });

  const [photos, setPhotos] = useState<PhotoPreview[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [current, setCurrent] = useState<Post | null>(null);
  const [history, setHistory] = useState<Post[]>(() => loadHistory());

  // objectURL 정리
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

    const system =
      "당신은 '써바니' 라는 칼갈이·미용가위 연마 전문 업체의 블로그 글을 작성하는 한국어 카피라이터입니다. " +
      "네이버 블로그/SEO 에 적합하도록 자연스럽고 신뢰감 있게 작성하세요. " +
      "반드시 아래 JSON 형식 하나만 출력하세요. 마크다운 코드펜스나 설명을 덧붙이지 마세요.\n" +
      '{ "title": "글 제목", "body": "본문 (문단 구분은 \\n\\n 사용, 1000자 이상)", "tags": ["태그1", "태그2", ...] }';

    const photoNote =
      photos.length > 0
        ? `\n- 첨부 사진 ${photos.length}장: ${photos
            .map((p) => p.name)
            .join(", ")} (본문 중간에 사진이 들어갈 위치를 [사진] 표시로 안내해 주세요)`
        : "";

    const userPrompt =
      `다음 조건으로 블로그 글을 작성해 주세요.\n` +
      `- 서비스 종류: ${form.serviceType}\n` +
      `- 주제/소재: ${form.topic}\n` +
      (form.region ? `- 지역(로컬 SEO): ${form.region}\n` : "") +
      `- 글의 톤: ${form.tone}\n` +
      (form.keywords ? `- 포함할 키워드: ${form.keywords}\n` : "") +
      (form.extra ? `- 추가 요청사항: ${form.extra}\n` : "") +
      photoNote;

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data?.error?.message || data?.error || `요청 실패 (${res.status})`
        );
      }

      const text: string =
        data?.content?.[0]?.text ??
        (typeof data?.content === "string" ? data.content : "");
      if (!text) throw new Error("응답에서 본문을 찾을 수 없습니다.");

      const parsed = parseGenerated(text);
      const post: Post = {
        id: uid(),
        title: parsed.title,
        body: parsed.body,
        tags: parsed.tags,
        createdAt: new Date().toISOString(),
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
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      {/* 헤더 */}
      <header className="bg-slate-900 text-white">
        <div className="mx-auto max-w-7xl px-6 py-5">
          <h1 className="text-xl font-bold tracking-tight">
            🔪 써바니 블로그 글 생성기
          </h1>
          <p className="text-sm text-slate-300">
            칼갈이 · 미용가위 연마 전문 — 블로그 포스트 자동 작성
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
          {/* 입력 폼 */}
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
                  지역 (로컬 SEO)
                </span>
                <input
                  value={form.region}
                  onChange={(e) => update("region", e.target.value)}
                  placeholder="예) 서울 강서구"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-400"
                />
              </label>

              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-600">
                  포함할 키워드
                </span>
                <input
                  value={form.keywords}
                  onChange={(e) => update("keywords", e.target.value)}
                  placeholder="쉼표로 구분 (예: 가위연마, 칼갈이, 출장)"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-400"
                />
              </label>

              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block font-medium text-slate-600">
                  추가 요청사항
                </span>
                <textarea
                  value={form.extra}
                  onChange={(e) => update("extra", e.target.value)}
                  rows={3}
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
                {loading ? "생성 중…" : "블로그 글 생성"}
              </button>
              {error && (
                <span className="text-sm text-red-600">⚠ {error}</span>
              )}
            </div>
          </section>

          {/* 결과 */}
          {current && (
            <section className="rounded-xl bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    {current.title}
                  </h2>
                  <p className="mt-1 text-xs text-slate-400">
                    {formatDate(current.createdAt)}
                  </p>
                </div>
                <button
                  onClick={copyBody}
                  className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                >
                  전체 복사
                </button>
              </div>

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

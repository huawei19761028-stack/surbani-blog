// Express 프록시 서버
// 브라우저에서 직접 api.anthropic.com 을 호출하면 CORS 와 API 키 노출 문제가 생기므로,
// 프론트엔드는 /api/generate 로 요청을 보내고 이 서버가 Anthropic API 로 중계한다.
import express from "express";
import dotenv from "dotenv";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

dotenv.config();

const app = express();
// 호스팅 플랫폼은 PORT 를 주입한다. 로컬은 3001 기본값.
const PORT = process.env.PORT || 3001;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// 첨부 사진(base64 image 블록)이 포함될 수 있어 넉넉히 설정
app.use(express.json({ limit: "25mb" }));

app.post("/api/generate", async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res
      .status(500)
      .json({ error: ".env 의 ANTHROPIC_API_KEY 가 설정되지 않았습니다." });
  }

  const { system, messages, tools, tool_choice } = req.body ?? {};
  if (!messages) {
    return res.status(400).json({ error: "messages 가 필요합니다." });
  }

  try {
    const payload = {
      model: "claude-sonnet-4-6",
      // SEO 장문(1,500~2,500자 + 제목후보·요약·태그) 출력을 위해 넉넉히 설정
      max_tokens: 8000,
      system,
      messages,
    };
    // 구조화 출력(tool use)을 쓰면 API 가 JSON 스키마를 보장한다 → 파싱 깨짐 방지
    if (tools) payload.tools = tools;
    if (tool_choice) payload.tool_choice = tool_choice;

    const upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });

    const data = await upstream.json();
    // Anthropic 응답을 상태코드와 함께 그대로 반환
    res.status(upstream.status).json(data);
  } catch (err) {
    console.error("[proxy] 중계 실패:", err);
    res.status(502).json({ error: "Anthropic API 중계 중 오류: " + String(err) });
  }
});

// ── 운영(production) 정적 서빙 ──
// 빌드 결과(dist)가 있으면 같은 프로세스에서 프론트엔드도 서빙한다.
// → 호스팅 시 서버 하나로 API + 프론트를 모두 제공할 수 있다.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "dist");
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  // SPA 폴백: API 외 모든 경로는 index.html 로
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
  console.log("[proxy] dist 정적 서빙 활성화");
}

app.listen(PORT, () => {
  console.log(`[proxy] http://localhost:${PORT} 에서 대기 중`);
});

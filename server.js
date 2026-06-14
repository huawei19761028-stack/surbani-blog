// Express 프록시 서버
// 브라우저에서 직접 api.anthropic.com 을 호출하면 CORS 와 API 키 노출 문제가 생기므로,
// 프론트엔드는 /api/generate 로 요청을 보내고 이 서버가 Anthropic API 로 중계한다.
import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3001;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

app.use(express.json({ limit: "10mb" }));

app.post("/api/generate", async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res
      .status(500)
      .json({ error: ".env 의 ANTHROPIC_API_KEY 가 설정되지 않았습니다." });
  }

  const { system, messages } = req.body ?? {};
  if (!messages) {
    return res.status(400).json({ error: "messages 가 필요합니다." });
  }

  try {
    const upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        system,
        messages,
      }),
    });

    const data = await upstream.json();
    // Anthropic 응답을 상태코드와 함께 그대로 반환
    res.status(upstream.status).json(data);
  } catch (err) {
    console.error("[proxy] 중계 실패:", err);
    res.status(502).json({ error: "Anthropic API 중계 중 오류: " + String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`[proxy] http://localhost:${PORT} 에서 대기 중`);
});

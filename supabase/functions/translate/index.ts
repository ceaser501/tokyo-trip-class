// Supabase Edge Function: 한국어 → 일본어 번역 + 메뉴판 사진 번역
// 배포:  supabase functions deploy translate
// 키 등록: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// 왜 이게 필요하냐면: AI API 키를 웹페이지(github pages)에 넣으면 누구나 훔쳐볼 수 있어요.
// 그래서 키는 Supabase 금고(secrets)에 두고, 이 작은 함수가 대신 AI를 불러줍니다.
import Anthropic from "npm:@anthropic-ai/sdk";

const client = new Anthropic(); // ANTHROPIC_API_KEY 환경변수를 자동으로 읽음

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TEXT_PROMPT =
  "You translate Korean into natural, polite Japanese for a Korean tourist in Tokyo. " +
  "Reply in exactly this format and nothing else:\n" +
  "JA: <Japanese translation>\nREAD: <Korean-alphabet pronunciation of the Japanese>";

const MENU_PROMPT =
  "This is a photo of a Japanese menu (or sign). For each item you can read, output one line:\n" +
  "<original Japanese> | <Korean translation> | <price if shown, else ->\n" +
  "Add a short Korean note in parentheses when a dish needs explanation " +
  "(e.g. main ingredient, spicy, contains pork). Output only the lines. " +
  "If nothing readable is in the image, reply with: 읽을 수 있는 글자가 없어요.";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { mode, text, image, mediaType } = await req.json();

    let content: Anthropic.Beta.BetaContentBlockParam[];
    if (mode === "image") {
      if (!image) return json({ error: "image가 비어 있어요" }, 400);
      content = [
        { type: "image", source: { type: "base64", media_type: mediaType ?? "image/jpeg", data: image } },
        { type: "text", text: MENU_PROMPT },
      ];
    } else {
      if (!text?.trim()) return json({ error: "text가 비어 있어요" }, 400);
      if (text.length > 2000) return json({ error: "2000자 이하로 입력해주세요" }, 400);
      content = [{ type: "text", text: `${TEXT_PROMPT}\n\nKorean:\n${text}` }];
    }

    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      output_config: { effort: "low" }, // 번역은 단순 작업이라 빠르고 저렴하게
      betas: ["server-side-fallback-2026-07-01"],
      // @ts-ignore - SDK 타입이 아직 이 값을 모를 수 있음
      fallbacks: "default",
      messages: [{ role: "user", content }],
    });

    if (response.stop_reason === "refusal") {
      return json({ error: "이 요청은 번역할 수 없어요." }, 422);
    }
    const out = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n")
      .trim();
    return json({ result: out });
  } catch (e) {
    console.error(e);
    return json({ error: "번역 중 오류가 났어요. 잠시 후 다시 시도해주세요." }, 500);
  }
});

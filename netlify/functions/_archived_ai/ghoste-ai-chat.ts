import type { Handler } from "@netlify/functions";
import OpenAI from "openai";

const systemPrompt = `
You are Ghoste, an AI music marketing manager helping artists with:

🎯 Campaign Management
📊 Data Analysis
👥 Audience Building
💡 Smart Recommendations

Tone: casual, clear, practical, step-by-step, and focused on music marketing for independent artists and small teams.
`;

interface GhosteAIRequestBody {
  message?: string;
  history?: { role: "user" | "assistant" | "system"; content: string }[];
}

export const handler: Handler = async (event) => {
  try {
    const apiKey =
      process.env.GHOSTE_AI_OPENAI_KEY || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      console.error(
        "❌ GHOSTE_AI_OPENAI_KEY / OPENAI_API_KEY is missing in Netlify env"
      );
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error:
            "Ghoste can't reach OpenAI right now because the AI key is missing on the server.",
        }),
      };
    }

    const body: GhosteAIRequestBody = event.body
      ? JSON.parse(event.body)
      : {};
    const userMessage = (body.message || "").trim();
    const history = Array.isArray(body.history) ? body.history : [];

    if (!userMessage) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Missing 'message' in request body.",
        }),
      };
    }

    const client = new OpenAI({ apiKey });

    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...history.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      { role: "user" as const, content: userMessage },
    ];

    console.log(
      "🔹 Ghoste AI calling OpenAI with messages length:",
      messages.length
    );

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.7,
    });

    const assistantReply =
      completion.choices?.[0]?.message?.content?.trim() ||
      "I'm not sure what happened there, but I'm ready to help with your campaign.";

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reply: assistantReply }),
    };
  } catch (err: any) {
    const status = err?.status || err?.response?.status;
    const apiErrorMessage =
      err?.response?.data?.error?.message ||
      err?.response?.data?.message ||
      err?.message ||
      "Unknown error";

    console.error("❌ Ghoste AI error:", {
      name: err?.name,
      message: err?.message,
      status,
      apiErrorMessage,
      raw: err?.response?.data,
    });

    let friendly = `Ghoste can't reach OpenAI right now: ${apiErrorMessage}`;

    if (status === 401 || status === 403) {
      friendly = `Ghoste can't reach OpenAI (auth issue): ${apiErrorMessage}. Check that GHOSTE_AI_OPENAI_KEY is valid and has access.`;
    }

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: friendly }),
    };
  }
};

import type { Handler } from "@netlify/functions";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Method not allowed" }),
      };
    }

    const { message } = JSON.parse(event.body || "{}");
    const userMessage = String(message || "").slice(0, 800).trim();

    if (!userMessage) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing message" }),
      };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing OPENAI_API_KEY" }),
      };
    }

    // Lightweight OpenAI call
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content:
              "You are Ghoste AI (pronounced 'ghost one'). You help independent artists with music marketing: smart links, UGC scripts, hooks, campaigns, and basic ad guidance. Be concise, confident, and friendly. Do not provide illegal or disallowed content.",
          },
          { role: "user", content: userMessage },
        ],
      }),
    });

    const json = await resp.json();
    const reply =
      json?.choices?.[0]?.message?.content?.trim() ||
      "I'm here — tell me your song link + goal and I'll map a campaign.";

    return {
      statusCode: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ reply }),
    };
  } catch (e: any) {
    console.error("[ghoste-ai-try] Error:", e);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Server error" }),
    };
  }
};

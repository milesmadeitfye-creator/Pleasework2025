import type { Handler } from "@netlify/functions";
import OpenAI from "openai";

export const handler: Handler = async () => {
  try {
    const v = OpenAI ? "ok" : "missing";
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, openai_import: v })
    };
  } catch (e: any) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: e.message })
    };
  }
};

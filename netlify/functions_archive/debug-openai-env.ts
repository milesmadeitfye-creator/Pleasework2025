import type { Handler } from "@netlify/functions";

export const handler: Handler = async () => {
  const hasKey = !!process.env.OPENAI_API_KEY;

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      hasKey,
      message: hasKey
        ? "OPENAI_API_KEY is present on this Netlify site."
        : "OPENAI_API_KEY is missing on this Netlify site.",
    }),
  };
};

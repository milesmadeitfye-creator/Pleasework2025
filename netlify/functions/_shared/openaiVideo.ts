import OpenAI from "openai";

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
  return new OpenAI({ apiKey });
}

/**
 * Map aspect ratio string to OpenAI's size format
 */
function mapAspectRatioToSize(ar?: string): string {
  const v = (ar || "").toLowerCase().trim();

  // vertical
  if (v === "9:16" || v === "vertical" || v === "portrait") return "720x1280";
  // horizontal
  if (v === "16:9" || v === "horizontal" || v === "landscape") return "1280x720";
  // square
  if (v === "1:1" || v === "square") return "1024x1024";

  // default to vertical since music marketing clips are usually vertical
  return "720x1280";
}

export async function createSoraVideoJob(args: {
  prompt: string;
  model?: string;      // "sora-2" | "sora-2-pro" etc
  seconds?: string;    // "4" | "8" | "12"
  size?: string;       // "720x1280" | "1280x720" | "1024x1024" (OpenAI format)
  aspect_ratio?: string; // "16:9" | "9:16" | "1:1" (UI format - will be converted)
}) {
  const openai = getClient();

  // Convert aspect_ratio to size if provided
  const size = args.size || mapAspectRatioToSize(args.aspect_ratio);

  console.log("[openaiVideo] Request size:", size);

  // 1) Try SDK method if it exists
  const sdkCreate = (openai as any)?.videos?.create;
  if (typeof sdkCreate === "function") {
    console.log("[openaiVideo] Using SDK videos.create method");
    return await sdkCreate.call((openai as any).videos, {
      prompt: args.prompt,
      model: args.model ?? "sora-2",
      seconds: args.seconds ?? "4",
      size: size,
    });
  }

  // 2) Fallback to REST if SDK doesn't expose videos
  console.log("[openaiVideo] SDK videos.create not found, falling back to REST API");
  const apiKey = process.env.OPENAI_API_KEY!;
  const resp = await fetch("https://api.openai.com/v1/videos", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: args.prompt,
      model: args.model ?? "sora-2",
      seconds: args.seconds ?? "4",
      size: size,
    }),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(`OpenAI /v1/videos failed (${resp.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

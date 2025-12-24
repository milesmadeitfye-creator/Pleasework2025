import OpenAI from "openai";

const DEBUG_VERSION = "v2.0.0";

/**
 * Safe OpenAI client initialization
 */
function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }
  return new OpenAI({ apiKey });
}

/**
 * Map aspect ratio to OpenAI size format
 * NEVER use aspect_ratio parameter - only size
 */
export function mapAspectRatioToSize(ar?: string): string {
  const v = (ar || "").toLowerCase().trim();

  // vertical
  if (v === "9:16" || v === "vertical" || v === "portrait") return "720x1280";
  // horizontal
  if (v === "16:9" || v === "horizontal" || v === "landscape") return "1280x720";
  // square
  if (v === "1:1" || v === "square") return "1024x1024";

  // default to vertical for music marketing
  return "720x1280";
}

/**
 * Validate seconds value
 */
export function validateSeconds(seconds?: number | string): "4" | "8" | "12" {
  const s = typeof seconds === "string" ? parseInt(seconds, 10) : seconds;

  if (!s || s <= 4) return "4";
  if (s <= 8) return "8";
  return "12";
}

/**
 * Create OpenAI video generation job
 * Returns job with id, status, and optional url
 */
export async function createVideoJob(params: {
  prompt: string;
  model?: string;
  seconds?: number | string;
  size?: string;
}): Promise<{
  id: string;
  status: string;
  url?: string;
  debug_version: string;
}> {
  const { prompt, model = "sora-2", seconds, size = "720x1280" } = params;

  console.log(`[soraVideo] createVideoJob ${DEBUG_VERSION}`, {
    model,
    seconds,
    size,
    promptLength: prompt.length,
  });

  const openai = getOpenAIClient();
  const validSeconds = validateSeconds(seconds);

  // Try SDK method first
  const sdkCreate = (openai as any)?.videos?.create;

  if (typeof sdkCreate === "function") {
    console.log("[soraVideo] Using SDK videos.create");

    try {
      const result = await sdkCreate.call((openai as any).videos, {
        prompt,
        model,
        seconds: validSeconds,
        size,
      });

      console.log("[soraVideo] SDK result:", {
        id: result.id,
        status: result.status,
        hasUrl: !!result.url,
      });

      return {
        id: result.id,
        status: result.status || "processing",
        url: result.url,
        debug_version: DEBUG_VERSION,
      };
    } catch (err: any) {
      console.error("[soraVideo] SDK error:", err.message);
      throw new Error(`OpenAI SDK error: ${err.message}`);
    }
  }

  // Fallback to REST API
  console.log("[soraVideo] SDK not available, using REST API");

  const apiKey = process.env.OPENAI_API_KEY!;
  const response = await fetch("https://api.openai.com/v1/videos", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      model,
      seconds: validSeconds,
      size,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error("[soraVideo] REST API error:", {
      status: response.status,
      data,
    });
    throw new Error(
      `OpenAI API error (${response.status}): ${JSON.stringify(data)}`
    );
  }

  console.log("[soraVideo] REST API result:", {
    id: data.id,
    status: data.status,
    hasUrl: !!data.url,
  });

  return {
    id: data.id,
    status: data.status || "processing",
    url: data.url,
    debug_version: DEBUG_VERSION,
  };
}

/**
 * Check video generation job status
 */
export async function checkVideoStatus(jobId: string): Promise<{
  id: string;
  status: string;
  url?: string;
  thumbnail_url?: string;
  error?: string;
  debug_version: string;
}> {
  console.log(`[soraVideo] checkVideoStatus ${DEBUG_VERSION}`, { jobId });

  const openai = getOpenAIClient();

  try {
    const result = await openai.videos.retrieve(jobId);

    console.log("[soraVideo] Status result:", {
      id: result.id,
      status: result.status,
      hasUrl: !!(result as any).url,
    });

    return {
      id: result.id,
      status: result.status,
      url: (result as any).url || (result as any).download_url,
      thumbnail_url: (result as any).thumbnail_url,
      debug_version: DEBUG_VERSION,
    };
  } catch (err: any) {
    console.error("[soraVideo] Status check error:", err.message);

    return {
      id: jobId,
      status: "error",
      error: err.message,
      debug_version: DEBUG_VERSION,
    };
  }
}

/**
 * Build a prompt from parts
 */
export function buildPrompt(parts: {
  vibe?: string;
  scene?: string;
  mood?: string;
  camera?: string;
  textStyle?: string;
  seconds?: number;
  size?: string;
  customText?: string;
}): string {
  const {
    vibe = "cinematic",
    scene = "studio",
    mood = "confident",
    camera = "handheld",
    textStyle = "minimal",
    seconds = 8,
    size = "720x1280",
    customText,
  } = parts;

  if (customText) {
    return customText;
  }

  const orientation = size === "1280x720" ? "horizontal" : size === "1024x1024" ? "square" : "vertical";

  return `Create a ${seconds}-second ${orientation} music marketing video with a ${vibe} ${mood} vibe. Scene: ${scene}. Camera: ${camera} movement. Text overlays: ${textStyle} style. High quality, professional music video aesthetic.`;
}

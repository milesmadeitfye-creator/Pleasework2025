// Ghoste Studio AI Video Generator - DEMO RENDER ONLY
// Always returns a demo video URL
// No clip loading or FFmpeg processing
import type { Handler } from "@netlify/functions";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: "METHOD_NOT_ALLOWED" }),
    };
  }

  try {
    console.log("[GhosteStudio/DemoRender] Returning demo video");

    // IMPORTANT:
    // This is a placeholder demo video path.
    // Replace /public/demo/demo-video.mp4 with a Ghoste-branded 9:16 MP4,
    // keeping the same filename, and the preview will automatically update.
    const demoVideoUrl = "/demo/demo-video.mp4";

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status: "ok",
        videoUrl: demoVideoUrl,
        usedDemoOnly: true,
      }),
    };
  } catch (err: any) {
    console.error("[GhosteStudio/DemoRender] ERROR", err?.message, err?.stack);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        status: "error",
        code: "RENDER_FAILED",
        message: "There was a problem rendering this video.",
      }),
    };
  }
};

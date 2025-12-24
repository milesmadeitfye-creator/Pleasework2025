import type { Handler } from "@netlify/functions";
import { sb, jsonHeaders } from "./_sb";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonResponse(statusCode: number, data: any) {
  return {
    statusCode,
    headers: { ...jsonHeaders, ...CORS_HEADERS },
    body: JSON.stringify(data),
  };
}

type SaveEditBody = {
  video_id: string;
  patch: any;
};

export const handler: Handler = async (event) => {
  console.log("[video-editor-save] Request received:", event.httpMethod);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "METHOD_NOT_ALLOWED" });
  }

  // Validate auth
  const authHeader = event.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse(401, { error: "UNAUTHORIZED" });
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await sb.auth.getUser(token);

  if (authError || !user) {
    console.error("[video-editor-save] Auth error:", authError);
    return jsonResponse(401, { error: "UNAUTHORIZED" });
  }

  const userId = user.id;

  // Parse body
  let body: SaveEditBody;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (err) {
    return jsonResponse(400, { error: "INVALID_JSON" });
  }

  const { video_id, patch } = body;

  if (!video_id) {
    return jsonResponse(400, { error: "MISSING_VIDEO_ID" });
  }

  if (!patch || typeof patch !== "object") {
    return jsonResponse(400, { error: "INVALID_PATCH" });
  }

  console.log("[video-editor-save] Saving manual edits for:", video_id);

  try {
    // Fetch current edit
    const { data: currentEdit, error: fetchError } = await sb
      .from("video_edits")
      .select("*")
      .eq("video_id", video_id)
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();

    if (fetchError) {
      console.error("[video-editor-save] Edit not found:", fetchError);
      return jsonResponse(404, { error: "EDIT_NOT_FOUND" });
    }

    // Merge patch into edit_json
    const updatedEditJson = {
      ...currentEdit.edit_json,
      ...patch,
      lastEditedAt: new Date().toISOString(),
    };

    const newVersion = currentEdit.version + 1;

    console.log("[video-editor-save] Updating to version:", newVersion);

    // Update with manual mode
    const { data: updatedEdit, error: updateError } = await sb
      .from("video_edits")
      .update({
        mode: "manual",
        edit_json: updatedEditJson,
        version: newVersion,
      })
      .eq("id", currentEdit.id)
      .select()
      .single();

    if (updateError) {
      console.error("[video-editor-save] Update error:", updateError);
      return jsonResponse(500, {
        error: "UPDATE_ERROR",
        message: updateError.message,
      });
    }

    return jsonResponse(200, {
      success: true,
      edit_id: updatedEdit.id,
      version: newVersion,
      mode: "manual",
      edit_json: updatedEditJson,
    });
  } catch (err: any) {
    console.error("[video-editor-save] Error:", err);

    return jsonResponse(500, {
      error: "SAVE_ERROR",
      message: err.message || "Failed to save edits",
    });
  }
};

export default handler;

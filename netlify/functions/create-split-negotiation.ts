import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonResponse(statusCode: number, data: any) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
    body: JSON.stringify(data),
  };
}

export const handler: Handler = async (event) => {
  console.log("[create-split-negotiation] Request received:", event.httpMethod);

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.error("[create-split-negotiation] Missing or invalid authorization header");
      return jsonResponse(401, { error: "Not authenticated" });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = getSupabaseAdmin();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error("[create-split-negotiation] Auth verification failed", authError);
      return jsonResponse(401, { error: "Not authenticated" });
    }

    console.log("[create-split-negotiation] User verified:", user.id.substring(0, 8) + "...");

    let payload: any;
    try {
      payload = JSON.parse(event.body || "{}");
    } catch (err) {
      console.error("[create-split-negotiation] Invalid JSON payload");
      return jsonResponse(400, { error: "Invalid JSON body" });
    }

    const {
      project_name,
      beat_fee,
      your_name,
      your_email,
      your_role,
      how_to_credit,
      pro,
      ipi_number,
      master_rights_pct,
      publishing_rights_pct,
      collaborator_emails,
      participants,
    } = payload;

    // Validate required fields
    if (!project_name || typeof project_name !== "string" || !project_name.trim()) {
      return jsonResponse(400, { error: "Missing required field: project_name" });
    }

    if (!your_name || typeof your_name !== "string" || !your_name.trim()) {
      return jsonResponse(400, { error: "Missing required field: your_name" });
    }

    if (!your_email || typeof your_email !== "string" || !your_email.trim()) {
      return jsonResponse(400, { error: "Missing required field: your_email" });
    }

    if (!your_role || typeof your_role !== "string" || !your_role.trim()) {
      return jsonResponse(400, { error: "Missing required field: your_role" });
    }

    if (!how_to_credit || typeof how_to_credit !== "string" || !how_to_credit.trim()) {
      return jsonResponse(400, { error: "Missing required field: how_to_credit" });
    }

    console.log("[create-split-negotiation] Creating negotiation:", {
      user: user.id.substring(0, 8) + "...",
      project_name: project_name.trim(),
      beat_fee,
      your_name: your_name.trim(),
      your_role: your_role.trim(),
    });

    // 1) Create negotiation using service role to bypass RLS
    const { data: negotiation, error: negotiationError } = await supabase
      .from("split_negotiations")
      .insert({
        project_name: project_name.trim(),
        user_id: user.id,
        created_by: user.id,
        status: "in_progress",
        beat_fee: beat_fee != null ? Number(beat_fee) : null,
      })
      .select("*")
      .single();

    if (negotiationError || !negotiation) {
      console.error("[create-split-negotiation] Negotiation error:", negotiationError);
      return jsonResponse(500, {
        error: "Failed to create negotiation",
        details: negotiationError?.message,
        code: negotiationError?.code,
        hint: negotiationError?.hint,
      });
    }

    console.log("[create-split-negotiation] Negotiation created:", negotiation.id);

    // 2) Build array of all participants to insert
    const allParticipants: any[] = [];

    // Add current user as first participant
    allParticipants.push({
      negotiation_id: negotiation.id,
      name: your_name.trim(),
      email: your_email.trim(),
      role: your_role.trim(),
      how_to_credit: how_to_credit.trim(),
      master_rights_pct: master_rights_pct != null ? Number(master_rights_pct) : 0,
      publishing_rights_pct: publishing_rights_pct != null ? Number(publishing_rights_pct) : 0,
      performing_rights_org: pro && pro.trim() ? pro.trim() : null,
      ipi_number: ipi_number && ipi_number.trim() ? ipi_number.trim() : null,
      signature_status: "pending",
    });

    // Add inline participants from modal
    if (Array.isArray(participants)) {
      for (const p of participants) {
        if (!p || !p.name || !p.email || !p.role) continue;

        allParticipants.push({
          negotiation_id: negotiation.id,
          name: p.name.trim(),
          email: p.email.trim(),
          role: p.role.trim(),
          how_to_credit: p.how_to_credit ? p.how_to_credit.trim() : null,
          master_rights_pct:
            p.master_rights_pct != null ? Number(p.master_rights_pct) : 0,
          publishing_rights_pct:
            p.publishing_rights_pct != null ? Number(p.publishing_rights_pct) : 0,
          performing_rights_org: p.performing_rights_org ? p.performing_rights_org.trim() : null,
          ipi_number: p.ipi_number ? p.ipi_number.trim() : null,
          signature_status: "pending",
        });
      }
    }

    // Add placeholder collaborators from email list
    if (Array.isArray(collaborator_emails) && collaborator_emails.length > 0) {
      const cleaned = collaborator_emails
        .map((e: any) => (typeof e === "string" ? e.trim() : ""))
        .filter((e: string) => e && e.toLowerCase() !== your_email.trim().toLowerCase());

      if (cleaned.length > 0) {
        for (const email of cleaned) {
          allParticipants.push({
            negotiation_id: negotiation.id,
            name: email.split("@")[0],
            email,
            role: "Collaborator",
            how_to_credit: email.split("@")[0],
            master_rights_pct: 0,
            publishing_rights_pct: 0,
            performing_rights_org: null,
            ipi_number: null,
          });
        }
      }
    }

    // Insert all participants in one call
    if (allParticipants.length > 0) {
      console.log("[create-split-negotiation] Inserting", allParticipants.length, "participants");

      const { error: participantsError } = await supabase
        .from("split_participants")
        .insert(allParticipants);

      if (participantsError) {
        console.error("[create-split-negotiation] Error adding participants:", participantsError);
        // Non-fatal: negotiation exists, user can fix participants later
      } else {
        console.log("[create-split-negotiation] All participants added successfully");
      }
    }

    return jsonResponse(200, {
      success: true,
      negotiation,
    });
  } catch (err: any) {
    console.error("[create-split-negotiation] Unexpected error:", err);
    return jsonResponse(500, {
      error: "Unexpected server error creating negotiation",
      details: err?.message ?? String(err),
    });
  }
};

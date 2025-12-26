import type { Handler, HandlerEvent } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";

const RESPONSE_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

/**
 * CRUD operations for broadcasts
 *
 * GET /fan-broadcasts-crud - List all broadcasts
 * GET /fan-broadcasts-crud?id=xxx - Get single broadcast with sends
 * POST /fan-broadcasts-crud - Create broadcast
 * PUT /fan-broadcasts-crud - Update broadcast
 * DELETE /fan-broadcasts-crud?id=xxx - Delete broadcast
 */

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: RESPONSE_HEADERS, body: "" };
  }

  try {
    const supabase = getSupabaseAdmin();

    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return {
        statusCode: 401,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }

    const userId = user.id;

    // GET - List or single
    if (event.httpMethod === "GET") {
      const id = event.queryStringParameters?.id;

      if (id) {
        // Get single broadcast with sends
        const { data: broadcast, error: broadcastError } = await supabase
          .from("fan_broadcasts")
          .select("*")
          .eq("id", id)
          .eq("owner_user_id", userId)
          .single();

        if (broadcastError || !broadcast) {
          return {
            statusCode: 404,
            headers: RESPONSE_HEADERS,
            body: JSON.stringify({ error: "Broadcast not found" }),
          };
        }

        // Get sends
        const { data: sends } = await supabase
          .from("fan_broadcast_sends")
          .select(`
            *,
            conversation:fan_dm_conversations(
              fan_name,
              fan_username,
              platform
            )
          `)
          .eq("broadcast_id", id)
          .order("created_at", { ascending: false });

        return {
          statusCode: 200,
          headers: RESPONSE_HEADERS,
          body: JSON.stringify({ broadcast, sends: sends || [] }),
        };
      } else {
        // List all broadcasts
        const { data, error } = await supabase
          .from("fan_broadcasts")
          .select("*")
          .eq("owner_user_id", userId)
          .order("created_at", { ascending: false });

        if (error) {
          return {
            statusCode: 500,
            headers: RESPONSE_HEADERS,
            body: JSON.stringify({ error: error.message }),
          };
        }

        return {
          statusCode: 200,
          headers: RESPONSE_HEADERS,
          body: JSON.stringify({ broadcasts: data }),
        };
      }
    }

    // POST - Create broadcast
    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      const { name, audience, template_id, body_override, scheduled_for } = body;

      if (!name) {
        return {
          statusCode: 400,
          headers: RESPONSE_HEADERS,
          body: JSON.stringify({ error: "Name is required" }),
        };
      }

      if (!template_id && !body_override) {
        return {
          statusCode: 400,
          headers: RESPONSE_HEADERS,
          body: JSON.stringify({ error: "Either template_id or body_override is required" }),
        };
      }

      const { data, error } = await supabase
        .from("fan_broadcasts")
        .insert({
          owner_user_id: userId,
          name,
          audience: audience || {},
          template_id,
          body_override,
          scheduled_for,
          status: 'draft',
        })
        .select()
        .single();

      if (error) {
        return {
          statusCode: 500,
          headers: RESPONSE_HEADERS,
          body: JSON.stringify({ error: error.message }),
        };
      }

      return {
        statusCode: 200,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ broadcast: data }),
      };
    }

    // PUT - Update broadcast
    if (event.httpMethod === "PUT") {
      const body = JSON.parse(event.body || "{}");
      const { id, name, audience, template_id, body_override, scheduled_for, status } = body;

      if (!id) {
        return {
          statusCode: 400,
          headers: RESPONSE_HEADERS,
          body: JSON.stringify({ error: "Broadcast ID is required" }),
        };
      }

      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (audience !== undefined) updates.audience = audience;
      if (template_id !== undefined) updates.template_id = template_id;
      if (body_override !== undefined) updates.body_override = body_override;
      if (scheduled_for !== undefined) updates.scheduled_for = scheduled_for;
      if (status !== undefined) updates.status = status;

      const { data, error } = await supabase
        .from("fan_broadcasts")
        .update(updates)
        .eq("id", id)
        .eq("owner_user_id", userId)
        .select()
        .single();

      if (error) {
        return {
          statusCode: 500,
          headers: RESPONSE_HEADERS,
          body: JSON.stringify({ error: error.message }),
        };
      }

      if (!data) {
        return {
          statusCode: 404,
          headers: RESPONSE_HEADERS,
          body: JSON.stringify({ error: "Broadcast not found" }),
        };
      }

      return {
        statusCode: 200,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ broadcast: data }),
      };
    }

    // DELETE - Delete broadcast
    if (event.httpMethod === "DELETE") {
      const id = event.queryStringParameters?.id;

      if (!id) {
        return {
          statusCode: 400,
          headers: RESPONSE_HEADERS,
          body: JSON.stringify({ error: "Broadcast ID is required" }),
        };
      }

      const { error } = await supabase
        .from("fan_broadcasts")
        .delete()
        .eq("id", id)
        .eq("owner_user_id", userId);

      if (error) {
        return {
          statusCode: 500,
          headers: RESPONSE_HEADERS,
          body: JSON.stringify({ error: error.message }),
        };
      }

      return {
        statusCode: 200,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ success: true }),
      };
    }

    return {
      statusCode: 405,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  } catch (error: any) {
    console.error("[fan-broadcasts-crud] Error:", error);
    return {
      statusCode: 500,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({
        error: "Internal server error",
        message: error.message,
      }),
    };
  }
};

export { handler };

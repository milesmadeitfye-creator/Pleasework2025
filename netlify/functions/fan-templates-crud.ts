import type { Handler, HandlerEvent } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";

const RESPONSE_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

/**
 * CRUD operations for fan message templates
 *
 * GET /fan-templates-crud - List all templates
 * POST /fan-templates-crud - Create template
 * PUT /fan-templates-crud - Update template
 * DELETE /fan-templates-crud?id=xxx - Delete template
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

    // GET - List templates
    if (event.httpMethod === "GET") {
      const { data, error } = await supabase
        .from("fan_templates")
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
        body: JSON.stringify({ templates: data }),
      };
    }

    // POST - Create template
    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      const { name, category, body: templateBody, variables } = body;

      if (!name || !templateBody) {
        return {
          statusCode: 400,
          headers: RESPONSE_HEADERS,
          body: JSON.stringify({ error: "Name and body are required" }),
        };
      }

      const { data, error } = await supabase
        .from("fan_templates")
        .insert({
          owner_user_id: userId,
          name,
          category: category || 'dm',
          body: templateBody,
          variables: variables || {},
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
        body: JSON.stringify({ template: data }),
      };
    }

    // PUT - Update template
    if (event.httpMethod === "PUT") {
      const body = JSON.parse(event.body || "{}");
      const { id, name, category, body: templateBody, variables } = body;

      if (!id) {
        return {
          statusCode: 400,
          headers: RESPONSE_HEADERS,
          body: JSON.stringify({ error: "Template ID is required" }),
        };
      }

      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (category !== undefined) updates.category = category;
      if (templateBody !== undefined) updates.body = templateBody;
      if (variables !== undefined) updates.variables = variables;

      const { data, error } = await supabase
        .from("fan_templates")
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
          body: JSON.stringify({ error: "Template not found" }),
        };
      }

      return {
        statusCode: 200,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ template: data }),
      };
    }

    // DELETE - Delete template
    if (event.httpMethod === "DELETE") {
      const id = event.queryStringParameters?.id;

      if (!id) {
        return {
          statusCode: 400,
          headers: RESPONSE_HEADERS,
          body: JSON.stringify({ error: "Template ID is required" }),
        };
      }

      const { error } = await supabase
        .from("fan_templates")
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
    console.error("[fan-templates-crud] Error:", error);
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

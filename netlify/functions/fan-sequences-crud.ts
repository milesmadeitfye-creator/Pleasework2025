import type { Handler, HandlerEvent } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";

const RESPONSE_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

/**
 * CRUD operations for sequences
 *
 * GET /fan-sequences-crud - List all sequences
 * GET /fan-sequences-crud?id=xxx - Get single sequence with steps
 * POST /fan-sequences-crud - Create sequence
 * PUT /fan-sequences-crud - Update sequence
 * DELETE /fan-sequences-crud?id=xxx - Delete sequence
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
        // Get single sequence with steps
        const { data: sequence, error: sequenceError } = await supabase
          .from("fan_sequences")
          .select("*")
          .eq("id", id)
          .eq("owner_user_id", userId)
          .single();

        if (sequenceError || !sequence) {
          return {
            statusCode: 404,
            headers: RESPONSE_HEADERS,
            body: JSON.stringify({ error: "Sequence not found" }),
          };
        }

        // Get steps
        const { data: steps } = await supabase
          .from("fan_sequence_steps")
          .select(`
            *,
            template:fan_templates(id, name, body)
          `)
          .eq("sequence_id", id)
          .order("step_index", { ascending: true });

        // Get enrollments count
        const { count: enrollmentsCount } = await supabase
          .from("fan_sequence_enrollments")
          .select("*", { count: "exact", head: true })
          .eq("sequence_id", id)
          .eq("status", "active");

        return {
          statusCode: 200,
          headers: RESPONSE_HEADERS,
          body: JSON.stringify({
            sequence,
            steps: steps || [],
            enrollments_count: enrollmentsCount || 0,
          }),
        };
      } else {
        // List all sequences
        const { data, error } = await supabase
          .from("fan_sequences")
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

        // Get step counts for each sequence
        const sequencesWithCounts = await Promise.all(
          (data || []).map(async (seq) => {
            const { count: stepsCount } = await supabase
              .from("fan_sequence_steps")
              .select("*", { count: "exact", head: true })
              .eq("sequence_id", seq.id);

            const { count: enrollmentsCount } = await supabase
              .from("fan_sequence_enrollments")
              .select("*", { count: "exact", head: true })
              .eq("sequence_id", seq.id)
              .eq("status", "active");

            return {
              ...seq,
              steps_count: stepsCount || 0,
              enrollments_count: enrollmentsCount || 0,
            };
          })
        );

        return {
          statusCode: 200,
          headers: RESPONSE_HEADERS,
          body: JSON.stringify({ sequences: sequencesWithCounts }),
        };
      }
    }

    // POST - Create sequence with steps
    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      const { name, description, status, steps } = body;

      if (!name) {
        return {
          statusCode: 400,
          headers: RESPONSE_HEADERS,
          body: JSON.stringify({ error: "Name is required" }),
        };
      }

      // Create sequence
      const { data: sequence, error: sequenceError } = await supabase
        .from("fan_sequences")
        .insert({
          owner_user_id: userId,
          name,
          description,
          status: status || 'draft',
        })
        .select()
        .single();

      if (sequenceError || !sequence) {
        return {
          statusCode: 500,
          headers: RESPONSE_HEADERS,
          body: JSON.stringify({ error: sequenceError?.message || "Failed to create sequence" }),
        };
      }

      // Create steps if provided
      if (steps && steps.length > 0) {
        const stepsToInsert = steps.map((step: any, index: number) => ({
          owner_user_id: userId,
          sequence_id: sequence.id,
          step_index: index,
          wait_minutes: step.wait_minutes || 0,
          template_id: step.template_id,
          body_override: step.body_override,
        }));

        await supabase.from("fan_sequence_steps").insert(stepsToInsert);
      }

      return {
        statusCode: 200,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ sequence }),
      };
    }

    // PUT - Update sequence
    if (event.httpMethod === "PUT") {
      const body = JSON.parse(event.body || "{}");
      const { id, name, description, status, steps } = body;

      if (!id) {
        return {
          statusCode: 400,
          headers: RESPONSE_HEADERS,
          body: JSON.stringify({ error: "Sequence ID is required" }),
        };
      }

      // Update sequence
      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (status !== undefined) updates.status = status;

      const { data: sequence, error: sequenceError } = await supabase
        .from("fan_sequences")
        .update(updates)
        .eq("id", id)
        .eq("owner_user_id", userId)
        .select()
        .single();

      if (sequenceError || !sequence) {
        return {
          statusCode: 404,
          headers: RESPONSE_HEADERS,
          body: JSON.stringify({ error: "Sequence not found" }),
        };
      }

      // Update steps if provided
      if (steps !== undefined) {
        // Delete existing steps
        await supabase
          .from("fan_sequence_steps")
          .delete()
          .eq("sequence_id", id);

        // Insert new steps
        if (steps.length > 0) {
          const stepsToInsert = steps.map((step: any, index: number) => ({
            owner_user_id: userId,
            sequence_id: id,
            step_index: index,
            wait_minutes: step.wait_minutes || 0,
            template_id: step.template_id,
            body_override: step.body_override,
          }));

          await supabase.from("fan_sequence_steps").insert(stepsToInsert);
        }
      }

      return {
        statusCode: 200,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ sequence }),
      };
    }

    // DELETE - Delete sequence
    if (event.httpMethod === "DELETE") {
      const id = event.queryStringParameters?.id;

      if (!id) {
        return {
          statusCode: 400,
          headers: RESPONSE_HEADERS,
          body: JSON.stringify({ error: "Sequence ID is required" }),
        };
      }

      const { error } = await supabase
        .from("fan_sequences")
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
    console.error("[fan-sequences-crud] Error:", error);
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

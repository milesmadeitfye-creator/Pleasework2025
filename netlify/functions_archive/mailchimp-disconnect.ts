import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { user_id } = JSON.parse(event.body || "{}");

    if (!user_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing user_id" }),
      };
    }

    const { error } = await supabase
      .from('user_integrations')
      .delete()
      .eq('user_id', user_id)
      .eq('provider', 'mailchimp');

    if (error) {
      throw error;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    };
  } catch (err: any) {
    console.error('Mailchimp disconnect error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || "Internal server error" }),
    };
  }
};

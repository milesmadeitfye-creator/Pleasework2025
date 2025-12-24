import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface PostMetaRequest {
  userId: string;
  message: string;
  imageUrl?: string;
  linkUrl?: string;
}

const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: "Method not allowed" }),
      };
    }

    const body: PostMetaRequest = JSON.parse(event.body || "{}");
    const { userId, message, imageUrl, linkUrl } = body;

    if (!userId || !message) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Missing required fields: userId and message are required",
        }),
      };
    }

    // Fetch Meta connection for user
    const { data: metaConnection, error: fetchError } = await supabase
      .from("meta_connections")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (fetchError) {
      console.error("Error fetching Meta connection:", fetchError);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Failed to retrieve Meta connection",
        }),
      };
    }

    if (!metaConnection || !metaConnection.access_token) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Meta account not connected. Please connect your Meta account first.",
        }),
      };
    }

    const accessToken = metaConnection.access_token;

    // Check if token is expired
    if (metaConnection.expires_at) {
      const expiresAt = new Date(metaConnection.expires_at);
      if (expiresAt < new Date()) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            error: "Meta access token has expired. Please reconnect your Meta account.",
          }),
        };
      }
    }

    // Fetch user's Meta pages using the Graph API
    const pagesResponse = await fetch(
      `https://graph.facebook.com/v18.0/me/accounts?access_token=${encodeURIComponent(accessToken)}`
    );

    if (!pagesResponse.ok) {
      const errorText = await pagesResponse.text();
      console.error("Failed to fetch Meta pages:", errorText);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Failed to fetch Facebook pages. Your token may need to be refreshed.",
        }),
      };
    }

    const pagesData: any = await pagesResponse.json();

    if (!pagesData.data || pagesData.data.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "No Facebook pages found. You need to have a Facebook page to post.",
        }),
      };
    }

    // Use the first page (in production, you'd let user select)
    const page = pagesData.data[0];
    const pageId = page.id;
    const pageAccessToken = page.access_token;

    // Prepare post data
    const postData: any = {
      message: message,
      access_token: pageAccessToken,
    };

    // Add link if provided
    if (linkUrl) {
      postData.link = linkUrl;
    }

    // Determine endpoint based on whether we have media
    let postUrl: string;
    let method: string = "POST";

    if (imageUrl) {
      // Post image to page photos
      postUrl = `https://graph.facebook.com/v18.0/${pageId}/photos`;
      postData.url = imageUrl;
      postData.caption = message;
      delete postData.message;
    } else {
      // Post text/link to page feed
      postUrl = `https://graph.facebook.com/v18.0/${pageId}/feed`;
    }

    // Make the post request to Facebook Graph API
    const postResponse = await fetch(postUrl, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(postData),
    });

    if (!postResponse.ok) {
      const errorText = await postResponse.text();
      console.error("Meta post failed:", postResponse.status, errorText);

      let errorMessage = "Failed to post to Meta";
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error && errorJson.error.message) {
          errorMessage = errorJson.error.message;
        }
      } catch (e) {
        // Use default error message
      }

      return {
        statusCode: 500,
        body: JSON.stringify({
          error: errorMessage,
        }),
      };
    }

    const postResult: any = await postResponse.json();

    // Success
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        postId: postResult.id || postResult.post_id,
        message: "Successfully posted to Meta (Facebook)",
        pageId,
        pageName: page.name,
      }),
    };
  } catch (error: any) {
    console.error("Error in social-post-meta:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message || "An unexpected error occurred",
      }),
    };
  }
};

export { handler };

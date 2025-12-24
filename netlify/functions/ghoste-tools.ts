import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { listSmartLinksForUser, getSmartLink } from "./_data/smartLinks";

const sb = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const UPLOADS_BUCKET = process.env.SUPABASE_UPLOADS_BUCKET || "uploads";

function json(statusCode: number, body: any) {
  return { statusCode, body: JSON.stringify(body) };
}

function requireUserId(body: any) {
  const userId = body?.userId;
  if (!userId) throw new Error("missing_userId");
  return userId as string;
}

/**
 * Resolve a valid destination URL from a smart link's platform URLs
 * Falls back through available platforms and constructs ghoste.one URL if needed
 */
function resolveSmartLinkDestination(link: any): string {
  // Try platform URLs first
  if (link.spotify_url) return link.spotify_url;
  if (link.apple_music_url) return link.apple_music_url;
  if (link.youtube_url) return link.youtube_url;
  if (link.youtube_music_url) return link.youtube_music_url;
  if (link.tidal_url) return link.tidal_url;
  if (link.soundcloud_url) return link.soundcloud_url;
  if (link.deezer_url) return link.deezer_url;
  if (link.amazon_music_url) return link.amazon_music_url;

  // Fallback to ghoste.one URL if slug exists
  if (link.slug) return `https://ghoste.one/s/${link.slug}`;

  // Last resort: return empty string
  return "";
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json(405, { error: "method_not_allowed" });

    const body = JSON.parse(event.body || "{}");
    const action = body?.action;
    if (!action) return json(400, { error: "missing_action" });

    const supabase = sb();
    const userId = requireUserId(body);

    // -------------------------
    // LISTING (for dropdown pickers)
    // -------------------------
    if (action === "list_links") {
      // returns Smart Links + One-Click + Email Capture + Pre-Saves + Parties (minimal fields)
      const [smart, oneClick, email, presaves, parties] = await Promise.all([
        supabase
          .from("smart_links")
          .select("id,title,slug,spotify_url,apple_music_url,youtube_url,youtube_music_url,tidal_url,soundcloud_url,deezer_url,amazon_music_url,created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("oneclick_links")
          .select("id,title,slug,target_url,created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("email_capture_links")
          .select("id,title,slug,redirect_url,created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("presave_links")
          .select("id,song_title,artist_name,slug,spotify_uri,apple_music_url,is_active,created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("listening_parties")
          .select("id,title,spotify_url,share_path,status,created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      // Format smart links with resolved destination URLs
      const formattedSmartLinks = (smart.data || []).map(link => ({
        id: link.id,
        title: link.title || "Untitled Smart Link",
        slug: link.slug,
        destination_url: resolveSmartLinkDestination(link),
        spotify_url: link.spotify_url,
        created_at: link.created_at,
      }));

      // Format one-click links
      const formattedOneClick = (oneClick.data || []).map(link => ({
        id: link.id,
        title: link.title || "Untitled Link",
        slug: link.slug,
        destination_url: link.target_url || (link.slug ? `https://ghoste.one/l/${link.slug}` : ""),
        created_at: link.created_at,
      }));

      // Format email capture links
      const formattedEmail = (email.data || []).map(link => ({
        id: link.id,
        title: link.title || "Untitled Email Capture",
        slug: link.slug,
        destination_url: link.slug ? `https://ghoste.one/e/${link.slug}` : "",
        redirect_url: link.redirect_url,
        created_at: link.created_at,
      }));

      // Format pre-saves
      const formattedPresaves = (presaves.data || []).map(link => ({
        id: link.id,
        title: `${link.song_title} - ${link.artist_name}`,
        slug: link.slug,
        destination_url: link.slug ? `https://ghoste.one/presave/${link.slug}` : "",
        spotify_uri: link.spotify_uri,
        apple_music_url: link.apple_music_url,
        is_active: link.is_active,
        created_at: link.created_at,
      }));

      // Format listening parties
      const formattedParties = (parties.data || []).map(link => ({
        id: link.id,
        title: link.title || "Untitled Party",
        destination_url: link.share_path ? `https://ghoste.one${link.share_path}` : "",
        spotify_url: link.spotify_url,
        status: link.status,
        created_at: link.created_at,
      }));

      return json(200, {
        ok: true,
        smart_links: formattedSmartLinks,
        one_click_links: formattedOneClick,
        email_capture_links: formattedEmail,
        pre_saves: formattedPresaves,
        listening_parties: formattedParties,
      });
    }

    // -------------------------
    // SMART LINK CREATE/UPDATE
    // -------------------------
    if (action === "create_smart_link") {
      const {
        title,
        spotify_url,
        apple_music_url,
        youtube_url,
        tidal_url,
        soundcloud_url,
        button_label,
        button_url,
        template,
        config,
      } = body;

      if (!title) return json(400, { error: "missing_title" });

      const payload: any = {
        user_id: userId,
        title,
        spotify_url: spotify_url || null,
        apple_music_url: apple_music_url || null,
        youtube_url: youtube_url || null,
        tidal_url: tidal_url || null,
        soundcloud_url: soundcloud_url || null,
        button_label: button_label || null,
        button_url: button_url || null,
        template: template || "Modern",
      };

      // include config only if provided
      if (config && typeof config === "object") payload.config = config;

      const { data, error } = await supabase.from("smart_links").insert([payload]).select("*").single();
      if (error) return json(500, { error: "create_failed", details: error });

      return json(200, { ok: true, smart_link: data });
    }

    if (action === "update_smart_link") {
      const { id, patch } = body;
      if (!id) return json(400, { error: "missing_id" });
      if (!patch || typeof patch !== "object") return json(400, { error: "missing_patch" });

      const safePatch: any = { ...patch };
      // guard unknown columns
      delete safePatch.user_id;

      const { data, error } = await supabase
        .from("smart_links")
        .update(safePatch)
        .eq("id", id)
        .eq("user_id", userId)
        .select("*")
        .single();

      if (error) return json(500, { error: "update_failed", details: error });
      return json(200, { ok: true, smart_link: data });
    }

    // -------------------------
    // ONE-CLICK LINK
    // -------------------------
    if (action === "create_one_click_link") {
      const { title, target_url, slug } = body;
      if (!title) return json(400, { error: "missing_title" });
      if (!target_url) return json(400, { error: "missing_target_url" });

      const { data, error } = await supabase
        .from("oneclick_links")
        .insert([{ user_id: userId, title, target_url, slug: slug || null }])
        .select("*")
        .single();

      if (error) return json(500, { error: "create_failed", details: error });
      return json(200, { ok: true, one_click_link: data });
    }

    // -------------------------
    // EMAIL CAPTURE LINK
    // -------------------------
    if (action === "create_email_capture_link") {
      const { title, redirect_url, slug, description } = body;
      if (!title) return json(400, { error: "missing_title" });

      const { data, error } = await supabase
        .from("email_capture_links")
        .insert([{
          user_id: userId,
          title,
          description: description || null,
          redirect_url: redirect_url || null,
          slug: slug || null,
        }])
        .select("*")
        .single();

      if (error) return json(500, { error: "create_failed", details: error });
      return json(200, { ok: true, email_capture_link: data });
    }

    // -------------------------
    // PRE-SAVE LINKS
    // -------------------------
    if (action === "create_presave") {
      const { song_title, artist_name, release_date, spotify_uri, apple_music_url, cover_art_url, description, slug } = body;
      if (!song_title) return json(400, { error: "missing_song_title" });
      if (!artist_name) return json(400, { error: "missing_artist_name" });
      if (!release_date) return json(400, { error: "missing_release_date" });

      const { data, error } = await supabase
        .from("presave_links")
        .insert([{
          user_id: userId,
          song_title,
          artist_name,
          release_date,
          spotify_uri: spotify_uri || "",
          apple_music_url: apple_music_url || "",
          cover_art_url: cover_art_url || "",
          description: description || "",
          slug: slug || `presave-${Date.now()}`,
          is_active: true,
        }])
        .select("*")
        .single();

      if (error) return json(500, { error: "create_failed", details: error });
      return json(200, { ok: true, pre_save: data });
    }


    if (action === "publish_presave") {
      const { id } = body;
      if (!id) return json(400, { error: "missing_id" });

      const { data, error } = await supabase
        .from("presave_links")
        .update({ is_active: true })
        .eq("id", id)
        .eq("user_id", userId)
        .select("*")
        .single();

      if (error) return json(500, { error: "publish_failed", details: error });
      return json(200, { ok: true, pre_save: data });
    }

    // -------------------------
    // LISTENING PARTIES
    // -------------------------
    if (action === "create_listening_party") {
      const { title, spotify_url, start_time, public_url } = body;
      if (!title) return json(400, { error: "missing_title" });

      const { data, error } = await supabase
        .from("listening_parties")
        .insert([{
          user_id: userId,
          title,
          spotify_url: spotify_url || null,
          start_time: start_time || null,
          public_url: public_url || null,
          status: "draft",
        }])
        .select("*")
        .single();

      if (error) return json(500, { error: "create_failed", details: error });
      return json(200, { ok: true, listening_party: data });
    }

    // -------------------------
    // CALENDAR EVENTS
    // -------------------------
    if (action === "list_calendar_events") {
      const { start_at, end_at } = body;

      const now = new Date();
      const startDate = start_at ? new Date(start_at) : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const endDate = end_at ? new Date(end_at) : new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

      const { data, error } = await supabase
        .from("calendar_events")
        .select("*")
        .eq("user_id", userId)
        .gte("start_at", startDate.toISOString())
        .lte("start_at", endDate.toISOString())
        .order("start_at", { ascending: true });

      if (error) return json(500, { error: "list_failed", details: error });
      return json(200, { ok: true, events: data || [] });
    }

    if (action === "create_calendar_event") {
      const { title, start_at, end_at, description, location, status } = body;
      if (!title) return json(400, { error: "missing_title" });
      if (!start_at) return json(400, { error: "missing_start_at" });
      if (!end_at) return json(400, { error: "missing_end_at" });

      const { data, error } = await supabase
        .from("calendar_events")
        .insert([{
          user_id: userId,
          title,
          start_at,
          end_at,
          description: description || null,
          location: location || null,
          status: status || "scheduled",
          source: "ghoste_ai",
        }])
        .select("*")
        .single();

      if (error) return json(500, { error: "create_failed", details: error });
      return json(200, { ok: true, event: data });
    }

    if (action === "update_calendar_event") {
      const { id, ...updates } = body;
      if (!id) return json(400, { error: "missing_id" });

      const safePatch: any = {};
      if (updates.title !== undefined) safePatch.title = updates.title;
      if (updates.start_at !== undefined) safePatch.start_at = updates.start_at;
      if (updates.end_at !== undefined) safePatch.end_at = updates.end_at;
      if (updates.description !== undefined) safePatch.description = updates.description;
      if (updates.location !== undefined) safePatch.location = updates.location;
      if (updates.status !== undefined) safePatch.status = updates.status;

      const { data, error } = await supabase
        .from("calendar_events")
        .update(safePatch)
        .eq("id", id)
        .eq("user_id", userId)
        .select("*")
        .single();

      if (error) return json(500, { error: "update_failed", details: error });
      return json(200, { ok: true, event: data });
    }

    if (action === "delete_calendar_event") {
      const { id } = body;
      if (!id) return json(400, { error: "missing_id" });

      const { error } = await supabase
        .from("calendar_events")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);

      if (error) return json(500, { error: "delete_failed", details: error });
      return json(200, { ok: true });
    }

    // -------------------------
    // COVER ART (calls your existing generation endpoint + stores result)
    // -------------------------
    if (action === "generate_cover_art") {
      const { prompt, style, size, title } = body;
      if (!prompt) return json(400, { error: "missing_prompt" });

      // Call your existing cover art function (adjust path if different)
      const resp = await fetch(`${process.env.URL}/.netlify/functions/generate-cover-art`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, prompt, style, size, title }),
      });

      const j = await resp.json().catch(() => ({}));
      if (!resp.ok) return json(500, { error: "cover_art_failed", details: j });

      // Expect your function returns { image_url, storage_path, ... }
      // Save to user_uploads so AI + ads + links can use it
      const imageUrl = j?.image_url || j?.public_url || null;
      const storagePath = j?.storage_path || null;

      if (imageUrl || storagePath) {
        await supabase.from("user_uploads").insert([{
          user_id: userId,
          kind: "image",
          filename: j?.filename || `cover-art-${Date.now()}.png`,
          mime_type: "image/png",
          public_url: imageUrl,
          storage_bucket: UPLOADS_BUCKET,
          storage_path: storagePath,
        }]);
      }

      return json(200, { ok: true, result: j });
    }

    // -------------------------
    // SMART LINKS (AI-friendly format)
    // -------------------------
    if (action === "list_smart_links") {
      const links = await listSmartLinksForUser(supabase, userId);
      return json(200, { ok: true, count: links.length, links });
    }

    if (action === "get_smart_link") {
      const { id } = body;
      if (!id) return json(400, { error: "missing_id" });

      const link = await getSmartLink(supabase, userId, id);
      if (!link) return json(404, { error: "smart_link_not_found" });

      return json(200, { ok: true, smart_link: link });
    }

    // -------------------------
    // UPLOADS (AI can access uploaded media)
    // -------------------------
    if (action === "list_uploads") {
      const { data, error } = await supabase
        .from("user_uploads")
        .select("id, filename, public_url, mime_type, kind, size_bytes, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) return json(500, { error: "list_failed", details: error });
      return json(200, { ok: true, count: data?.length || 0, uploads: data || [] });
    }

    if (action === "get_upload") {
      const { id } = body;
      if (!id) return json(400, { error: "missing_id" });

      const { data, error } = await supabase
        .from("user_uploads")
        .select("*")
        .eq("user_id", userId)
        .eq("id", id)
        .maybeSingle();

      if (error) return json(500, { error: "get_failed", details: error });
      if (!data) return json(404, { error: "upload_not_found" });

      return json(200, { ok: true, upload: data });
    }

    return json(400, { error: "unknown_action", action });
  } catch (e: any) {
    const msg = e?.message || String(e);
    const code = msg === "missing_userId" ? 400 : 500;
    return json(code, { error: msg });
  }
};

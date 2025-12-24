import { supabaseAdmin } from "../_supabaseAdmin";

export type MetaTrackingConfig = {
  pixelId?: string | null;
  capiToken?: string | null;
  capiEnabled?: boolean;
  pixelEnabled?: boolean;
  testEventCode?: string | null;
};

function pickFirst<T>(...vals: (T | null | undefined)[]): T | null {
  for (const v of vals) {
    if (v !== undefined && v !== null && (v as any) !== "") return v as T;
  }
  return null;
}

export async function resolveMetaTrackingForLink(args: {
  userId: string;
  linkType: "smart" | "presave" | "email_capture" | "show";
  linkId: string;
}): Promise<MetaTrackingConfig> {
  const sb = supabaseAdmin;

  // 1) Load user default meta settings from user_profiles
  const { data: userProfile } = await sb
    .from("user_profiles")
    .select("meta_pixel_id, meta_conversions_token")
    .eq("user_id", args.userId)
    .maybeSingle();

  // 2) Load link-level fields from the relevant table
  let linkRow: any = null;

  if (args.linkType === "smart") {
    const { data } = await sb
      .from("smart_links")
      .select("pixel_id, capi_token, capi_enabled, pixel_enabled, test_event_code")
      .eq("id", args.linkId)
      .maybeSingle();
    linkRow = data;
  } else if (args.linkType === "presave") {
    const { data } = await sb
      .from("presave_links")
      .select("pixel_id, capi_token, capi_enabled, pixel_enabled, test_event_code")
      .eq("id", args.linkId)
      .maybeSingle();
    linkRow = data;
  } else if (args.linkType === "email_capture") {
    const { data } = await sb
      .from("email_capture_links")
      .select("pixel_id, capi_token, capi_enabled, pixel_enabled, test_event_code")
      .eq("id", args.linkId)
      .maybeSingle();
    linkRow = data;
  } else if (args.linkType === "show") {
    const { data } = await sb
      .from("show_links")
      .select("pixel_id, capi_token, capi_enabled, pixel_enabled, test_event_code")
      .eq("id", args.linkId)
      .maybeSingle();
    linkRow = data;
  }

  // 3) Priority: link-level overrides first, then user defaults
  const pixelId = pickFirst<string>(linkRow?.pixel_id, userProfile?.meta_pixel_id);
  const capiToken = pickFirst<string>(linkRow?.capi_token, userProfile?.meta_conversions_token);

  // CAPI enabled by default if token exists
  const capiEnabled = (linkRow?.capi_enabled ?? (capiToken ? true : false)) === true;

  // Pixel enabled by default
  const pixelEnabled = (linkRow?.pixel_enabled ?? true) === true;

  const testEventCode = pickFirst<string>(linkRow?.test_event_code);

  return { pixelId, capiToken, capiEnabled, pixelEnabled, testEventCode };
}

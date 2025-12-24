import type { Handler } from "@netlify/functions";

const TID = process.env.TIKTOK_CLIENT_ID!;

export const handler: Handler = async (event) => {
  const scheme = (event.headers["x-forwarded-proto"] as string) || "https";
  const host = (event.headers["x-forwarded-host"] as string) || event.headers.host;
  const redirectUri = `${scheme}://${host}/.netlify/functions/tiktok-oauth-callback`;
  const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
  url.searchParams.set("client_key", TID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "user.info.basic");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", "STATE");
  return { statusCode: 302, headers: { Location: url.toString() }, body: "" };
};

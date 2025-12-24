import type { Platform } from "../linkPatterns";

export type CoreMeta = {
  isrc?: string;
  title: string;
  artist: string;
  album?: string;
  duration_ms?: number;
  release_date?: string;
};

export type ResolveHit = {
  platform: Platform;
  platform_id: string;
  url_web: string;
  url_app?: string | null;
  storefront?: string | null;
  confidence: number;
};

import React from "react";
import { openSpotify } from "../lib/deeplink";

export function SpotifyLink({ platformId }: { platformId: string }) {
  const scheme = `spotify://track/${platformId}`;

  return (
    <a
      href={scheme}
      target="_self"
      rel="noopener"
      onClick={(e) => {
        try {
          openSpotify(platformId);
        } catch {
          // no-op; fallback handled inside openSpotify
        }
      }}
      className="btn btn-spotify w-full"
      aria-label="Open in Spotify"
    >
      Open in Spotify
    </a>
  );
}

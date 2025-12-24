import { openSpotify } from "../lib/deeplink";

export function SpotifyButton({ trackId }: { trackId: string }) {
  const scheme = `spotify://track/${trackId}`;

  return (
    <a
      href={scheme}
      target="_self"
      rel="noopener"
      onClick={(e) => {
        try {
          openSpotify(trackId);
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

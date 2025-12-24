type SelectedArtist = {
  id?: string;
  name: string;
  image?: string | null;
  platform_ids?: Record<string, string>;
  spotify_artist_id?: string;
  followers?: number | null;
  popularity?: number | null;
  genres?: string[];
};

const LS_KEY = "ghoste.analytics.selectedArtist.v1";

export function loadSelectedArtist(): SelectedArtist | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSelectedArtist(artist: SelectedArtist) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(artist));
  } catch (err) {
    console.warn('[AnalyticsStore] Failed to save artist to localStorage:', err);
  }
}

export function clearSelectedArtist() {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {}
}

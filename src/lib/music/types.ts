export interface SmartLinkRequest {
  artist: string;
  title: string;
  isrc?: string;
}

export interface ProviderResult {
  provider: 'spotify' | 'apple' | 'youtube' | string;
  url: string;
  id: string;
  confidence: number;
}

export interface SmartLink {
  id: string;
  artist: string;
  title: string;
  isrc?: string;
  spotifyTrackId?: string;
  spotifyUrl?: string;
  appleSongId?: string;
  appleUrlGeo?: string;
  youtubeVideoId?: string;
  youtubeUrl?: string;
  matchConfidence: number;
  needsManualReview: boolean;
  createdAt: string;
  updatedAt: string;
}

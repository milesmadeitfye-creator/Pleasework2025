export interface LinkVariant {
  id?: string;
  webUrl: string;
  appSchemeUrl?: string;
  confidence: number;
}

export interface SmartLinks {
  artist: string;
  title: string;
  isrc?: string;

  spotify?: LinkVariant;
  appleMusic?: LinkVariant;
  youtubeMusic?: LinkVariant;
  tidal?: LinkVariant;
  soundcloud?: LinkVariant;

  shareUrl: string;
}

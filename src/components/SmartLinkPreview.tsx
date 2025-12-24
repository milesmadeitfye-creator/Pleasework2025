import { Music2, ExternalLink } from 'lucide-react';

interface PreviewProps {
  title: string;
  coverImage: string;
  template: string;
  colorScheme: {
    primary: string;
    secondary: string;
    background: string;
    text: string;
  };
  platforms: {
    spotify?: string;
    appleMusic?: string;
    youtube?: string;
    tidal?: string;
    soundcloud?: string;
  };
}

export default function SmartLinkPreview({ title, coverImage, template, colorScheme, platforms }: PreviewProps) {
  const platformList = [
    { name: 'Spotify', url: platforms.spotify, color: '#1DB954' },
    { name: 'Apple Music', url: platforms.appleMusic, color: '#FA243C' },
    { name: 'YouTube', url: platforms.youtube, color: '#FF0000' },
    { name: 'Tidal', url: platforms.tidal, color: '#000000' },
    { name: 'SoundCloud', url: platforms.soundcloud, color: '#FF5500' },
  ].filter(p => p.url);

  if (template === 'modern') {
    return (
      <div className="w-full h-full p-6 overflow-y-auto" style={{ background: colorScheme.background, color: colorScheme.text }}>
        <div className="max-w-md mx-auto">
          {coverImage && (
            <img src={coverImage} alt={title} className="w-full aspect-square object-cover rounded-xl mb-6 shadow-2xl" />
          )}
          {!coverImage && (
            <div className="w-full aspect-square bg-gray-800 rounded-xl mb-6 flex items-center justify-center">
              <Music2 className="w-20 h-20 text-gray-600" />
            </div>
          )}
          <h1 className="text-3xl font-bold mb-6 text-center">{title || 'Your Song Title'}</h1>
          <div className="space-y-3">
            {platformList.map((platform) => (
              <div
                key={platform.name}
                className="p-4 rounded-xl flex items-center justify-between cursor-pointer transition-transform hover:scale-105 shadow-lg"
                style={{ background: colorScheme.primary }}
              >
                <span className="font-semibold text-white">{platform.name}</span>
                <ExternalLink className="w-5 h-5 text-white" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (template === 'classic') {
    return (
      <div className="w-full h-full p-6 overflow-y-auto" style={{ background: colorScheme.background, color: colorScheme.text }}>
        <div className="max-w-md mx-auto text-center">
          {coverImage && (
            <img src={coverImage} alt={title} className="w-48 h-48 object-cover rounded-lg mx-auto mb-4 shadow-xl" />
          )}
          {!coverImage && (
            <div className="w-48 h-48 bg-gray-800 rounded-lg mx-auto mb-4 flex items-center justify-center">
              <Music2 className="w-16 h-16 text-gray-600" />
            </div>
          )}
          <h1 className="text-2xl font-bold mb-6">{title || 'Your Song Title'}</h1>
          <div className="space-y-2">
            {platformList.map((platform) => (
              <button
                key={platform.name}
                className="w-full py-3 px-6 rounded-lg font-medium transition-colors"
                style={{
                  background: colorScheme.primary,
                  color: 'white',
                }}
              >
                Listen on {platform.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (template === 'minimal') {
    return (
      <div className="w-full h-full p-6 overflow-y-auto" style={{ background: colorScheme.background, color: colorScheme.text }}>
        <div className="max-w-sm mx-auto">
          <div className="flex items-center gap-4 mb-8">
            {coverImage && (
              <img src={coverImage} alt={title} className="w-20 h-20 object-cover rounded-lg shadow-lg" />
            )}
            {!coverImage && (
              <div className="w-20 h-20 bg-gray-800 rounded-lg flex items-center justify-center">
                <Music2 className="w-10 h-10 text-gray-600" />
              </div>
            )}
            <h1 className="text-xl font-bold">{title || 'Your Song Title'}</h1>
          </div>
          <div className="space-y-2">
            {platformList.map((platform) => (
              <div
                key={platform.name}
                className="py-3 px-4 border-b cursor-pointer hover:pl-6 transition-all"
                style={{ borderColor: colorScheme.primary + '40' }}
              >
                <span className="font-medium">{platform.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (template === 'gradient') {
    return (
      <div
        className="w-full h-full p-6 overflow-y-auto"
        style={{
          background: `linear-gradient(135deg, ${colorScheme.primary} 0%, ${colorScheme.secondary} 100%)`,
          color: 'white',
        }}
      >
        <div className="max-w-md mx-auto">
          {coverImage && (
            <img src={coverImage} alt={title} className="w-full aspect-square object-cover rounded-2xl mb-6 shadow-2xl" />
          )}
          {!coverImage && (
            <div className="w-full aspect-square bg-black/20 rounded-2xl mb-6 flex items-center justify-center">
              <Music2 className="w-20 h-20 text-white/50" />
            </div>
          )}
          <h1 className="text-3xl font-bold mb-6 text-center drop-shadow-lg">{title || 'Your Song Title'}</h1>
          <div className="space-y-3">
            {platformList.map((platform) => (
              <div
                key={platform.name}
                className="p-4 rounded-xl flex items-center justify-between cursor-pointer transition-transform hover:scale-105 backdrop-blur-sm shadow-xl"
                style={{ background: 'rgba(255, 255, 255, 0.2)' }}
              >
                <span className="font-semibold text-white">{platform.name}</span>
                <ExternalLink className="w-5 h-5 text-white" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return null;
}

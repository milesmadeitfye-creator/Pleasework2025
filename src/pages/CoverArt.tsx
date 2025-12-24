import { useState } from 'react';
import { Download, Sparkles, Image as ImageIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ProActionButton } from '../components/ProGate';

const styles = [
  { id: 'moody', name: 'Moody', description: 'Dark and atmospheric' },
  { id: 'vibrant', name: 'Vibrant', description: 'Bright and colorful' },
  { id: 'minimal', name: 'Minimal', description: 'Clean and simple' },
  { id: 'abstract', name: 'Abstract', description: 'Artistic and creative' },
  { id: 'vintage', name: 'Vintage', description: 'Retro aesthetic' },
  { id: 'neon', name: 'Neon', description: 'Electric and bold' }
];

const examplePrompts = [
  "Dark blue trap album cover with lightning",
  "Minimalist monochrome hip-hop design with bold typography",
  "Vibrant neon cityscape at night, cyberpunk style",
  "Abstract watercolor painting with flowing colors",
  "Retro 80s synthwave sunset with palm trees"
];

export default function CoverArt() {
  const { user } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [selectedStyle, setSelectedStyle] = useState('moody');
  const [generating, setGenerating] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('Please enter a prompt');
      return;
    }

    setGenerating(true);
    setError(null);
    setImages([]);

    try {
      // Generate cover art via Netlify function
      const response = await fetch('/.netlify/functions/generate-cover-art', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user?.id,
          prompt: prompt.trim(),
          style: selectedStyle,
          mode: 'standard',
          size: '1024x1024'
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.error === 'INSUFFICIENT_CREDITS') {
          throw new Error(errorData.message || 'Not enough Tools credits');
        }
        throw new Error(errorData.error || 'Failed to generate cover art');
      }

      const data = await response.json();

      if (data.imageUrl) {
        setImages([data.imageUrl]);
      } else {
        throw new Error('No image returned from AI');
      }
    } catch (error: any) {
      console.error('Cover art generation error:', error);
      const errorMessage = error.message || 'Our AI cover art generator is having trouble right now. Please try again in a few seconds.';
      setError(errorMessage);
      setImages([]);
    } finally {
      setGenerating(false);
    }
  };

  const downloadImage = async (imageUrl: string, index: number) => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `cover-art-${Date.now()}-${index + 1}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download error:', err);
      setError('Failed to download image. Please right-click and save manually.');
    }
  };

  return (
    <div className="text-white">
      <div className="px-6 py-10 md:px-12 md:py-12 max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">AI Cover Art Generator</h1>
          <p className="text-gray-400">Type a vibe, and let Ghoste's AI help you mock up cover ideas.</p>
        </div>

        <div className="bg-slate-950/50 backdrop-blur-xl rounded-2xl border border-slate-800 shadow-2xl p-6 md:p-8 mb-6">
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">
                Describe your cover art
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="A futuristic cityscape at sunset with neon lights..."
                className="w-full px-4 py-3 bg-slate-900/50 border-2 border-slate-700 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                rows={4}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-3">
                Quick examples
              </label>
              <div className="flex flex-wrap gap-2 mb-4">
                {examplePrompts.map((example, idx) => (
                  <button
                    key={idx}
                    onClick={() => setPrompt(example)}
                    className="text-xs px-3 py-2 rounded-full border border-slate-700 bg-slate-900/50 text-gray-300 hover:border-blue-500 hover:text-blue-400 transition-all"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-3">
                Choose a style
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {styles.map((style) => (
                  <button
                    key={style.id}
                    onClick={() => setSelectedStyle(style.id)}
                    className={`p-4 rounded-xl border-2 transition-all text-left ${
                      selectedStyle === style.id
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-slate-700 bg-slate-900/50 hover:border-slate-600'
                    }`}
                  >
                    <div className="font-semibold text-white mb-1">{style.name}</div>
                    <div className="text-sm text-gray-400">{style.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <ProActionButton
              onClick={handleGenerate}
              feature="AI cover art"
              disabled={generating || !prompt.trim()}
              className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-500/20"
            >
              {generating ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                  Generating your cover art...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Generate Cover Art
                </>
              )}
            </ProActionButton>
          </div>
        </div>

        {images.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold text-white mb-4">Generated Cover Art</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {images.map((image, index) => (
                <div
                  key={index}
                  className="bg-slate-950/50 backdrop-blur-xl rounded-2xl border border-slate-800 overflow-hidden hover:border-blue-500/50 transition-all shadow-xl"
                >
                  <div className="aspect-square">
                    <img
                      src={image}
                      alt={`Generated cover art ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-4 space-y-2">
                    <button
                      onClick={() => downloadImage(image, index)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#2563eb] hover:bg-[#1d4ed8] rounded-xl text-white font-semibold transition-all"
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </button>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(image);
                        setError(null);
                      }}
                      className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 hover:border-slate-600 rounded-xl text-gray-300 font-medium transition-all"
                    >
                      Copy URL
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {images.length === 0 && !generating && (
          <div className="text-center py-20 bg-slate-950/50 backdrop-blur-xl rounded-2xl border border-slate-800 shadow-xl">
            <ImageIcon className="w-20 h-20 text-gray-700 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-400 mb-2">No images yet</h3>
            <p className="text-gray-500">Enter a prompt and generate your first cover art</p>
          </div>
        )}
      </div>
    </div>
  );
}

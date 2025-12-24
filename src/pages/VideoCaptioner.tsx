// Video Captioner Page
// Thin wrapper around the shared LyricCaptionerCore component
import { LyricCaptionerCore } from "../components/ghoste-studio/LyricCaptionerCore";

export default function VideoCaptioner() {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">AI Lyric Captioner</h1>
          <p className="text-sm text-gray-400 mt-2">
            Upload a video, auto-generate captions with timestamps, choose your style, and
            download your captioned video.
          </p>
        </div>

        <LyricCaptionerCore />
      </div>
    </div>
  );
}

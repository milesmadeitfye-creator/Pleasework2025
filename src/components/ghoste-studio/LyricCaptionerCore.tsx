// Shared Lyric Captioner Core Component
// Used by both /VideoCaptioner page and Ghoste Studio tab
// NO Supabase upload - direct multipart upload to Netlify
import React, { useState, useRef } from "react";

type Caption = {
  start: number;
  end: number;
  text: string;
};

type CaptionStyleId =
  | "tiktok-pop"
  | "center-karaoke"
  | "lower-third-minimal"
  | "rap-bold"
  | "neon-glow"
  | "bubble-comic"
  | "subtle-subtitles"
  | "upper-hook"
  | "bounce-beat"
  | "typewriter"
  | "ghoste-motion-lower"
  | "ghoste-spotlight-caption";

type CaptionStyleConfig = {
  id: CaptionStyleId;
  name: string;
  description: string;
  containerClass: string;
  textClass: string;
  animationClass?: string;
};

const captionStyles: CaptionStyleConfig[] = [
  {
    id: "tiktok-pop",
    name: "TikTok Pop",
    description: "Big white text with black outline and pop-in animation.",
    containerClass:
      "absolute bottom-6 left-1/2 -translate-x-1/2 max-w-[90%] px-4 py-2 bg-black/60 rounded-2xl border border-white/10",
    textClass:
      "text-center text-xl md:text-2xl font-extrabold text-white drop-shadow-2xl",
    animationClass: "caption-anim-pop",
  },
  {
    id: "center-karaoke",
    name: "Center Karaoke",
    description: "Centered lyrics, medium size, soft glow.",
    containerClass:
      "absolute bottom-1/3 left-1/2 -translate-x-1/2 max-w-[90%] px-4 py-2 bg-black/40 rounded-xl",
    textClass:
      "text-center text-2xl md:text-3xl font-semibold text-white caption-karaoke-glow",
    animationClass: "caption-anim-fade",
  },
  {
    id: "lower-third-minimal",
    name: "Lower Third Minimal",
    description: "Clean, small subtitle style at the bottom.",
    containerClass:
      "absolute bottom-4 left-1/2 -translate-x-1/2 max-w-[90%] px-3 py-1 bg-black/70 rounded-lg",
    textClass:
      "text-center text-sm md:text-base font-medium text-gray-100",
    animationClass: "caption-anim-fade",
  },
  {
    id: "rap-bold",
    name: "Rap Bold",
    description: "All caps, heavy weight, tight tracking.",
    containerClass:
      "absolute bottom-10 left-1/2 -translate-x-1/2 max-w-[90%] px-4 py-2 bg-black/70 rounded-xl border border-white/20",
    textClass:
      "text-center text-2xl md:text-3xl font-black tracking-wide uppercase text-white drop-shadow-2xl",
    animationClass: "caption-anim-bounce",
  },
  {
    id: "neon-glow",
    name: "Neon Glow",
    description: "Electric blue neon glow around the text.",
    containerClass:
      "absolute bottom-8 left-1/2 -translate-x-1/2 max-w-[90%] px-4 py-2 bg-black/40 rounded-2xl",
    textClass:
      "text-center text-2xl md:text-3xl font-semibold text-blue-300 caption-neon-glow",
    animationClass: "caption-anim-fade",
  },
  {
    id: "bubble-comic",
    name: "Bubble Comic",
    description: "Rounded bubble, playful comic-style for fun tracks.",
    containerClass:
      "absolute bottom-8 left-1/2 -translate-x-1/2 max-w-[90%] px-4 py-2 bg-white text-black rounded-full border border-black/60 shadow-lg",
    textClass:
      "text-center text-base md:text-lg font-bold",
    animationClass: "caption-anim-pop",
  },
  {
    id: "subtle-subtitles",
    name: "Subtle Subtitles",
    description: "Small, low-key subtitles for serious edits.",
    containerClass:
      "absolute bottom-3 left-1/2 -translate-x-1/2 max-w-[90%] px-2 py-1 bg-black/50 rounded-md",
    textClass:
      "text-center text-xs md:text-sm font-normal text-gray-200",
    animationClass: "caption-anim-fade",
  },
  {
    id: "upper-hook",
    name: "Upper Hook",
    description: "Top-positioned bold text for catchy hooks.",
    containerClass:
      "absolute top-8 left-1/2 -translate-x-1/2 max-w-[90%] px-4 py-2 bg-black/70 rounded-xl border border-white/20",
    textClass:
      "text-center text-xl md:text-2xl font-bold text-white drop-shadow-xl",
    animationClass: "caption-anim-bounce",
  },
  {
    id: "bounce-beat",
    name: "Bounce Beat",
    description: "Bouncy animation synced to the beat.",
    containerClass:
      "absolute bottom-12 left-1/2 -translate-x-1/2 max-w-[90%] px-4 py-2 bg-gradient-to-r from-purple-600/60 to-pink-600/60 rounded-2xl border border-white/30",
    textClass:
      "text-center text-2xl md:text-3xl font-black text-white drop-shadow-2xl",
    animationClass: "caption-anim-bounce",
  },
  {
    id: "typewriter",
    name: "Typewriter",
    description: "Word-by-word reveal, like typing.",
    containerClass:
      "absolute bottom-6 left-1/2 -translate-x-1/2 max-w-[90%] px-4 py-2 bg-black/80 rounded-lg",
    textClass:
      "text-center text-lg md:text-xl font-mono text-green-300",
    animationClass: "caption-anim-fade",
  },
  {
    id: "ghoste-motion-lower",
    name: "Ghoste Motion (Lower)",
    description: "Ghoste brand style with subtle motion.",
    containerClass:
      "absolute bottom-10 left-1/2 -translate-x-1/2 max-w-[90%] px-4 py-2 bg-gradient-to-r from-blue-500/40 to-purple-500/40 rounded-2xl border border-white/20",
    textClass:
      "text-center text-2xl md:text-3xl font-bold text-white drop-shadow-2xl",
    animationClass: "caption-anim-pop",
  },
  {
    id: "ghoste-spotlight-caption",
    name: "Ghoste Spotlight",
    description: "Center focus with spotlight effect.",
    containerClass:
      "absolute bottom-1/2 translate-y-1/2 left-1/2 -translate-x-1/2 max-w-[90%] px-4 py-2 bg-black/60 rounded-2xl shadow-2xl",
    textClass:
      "text-center text-3xl md:text-4xl font-black text-white caption-spotlight",
    animationClass: "caption-anim-fade",
  },
];

export function LyricCaptionerCore() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [language, setLanguage] = useState<string>("auto");
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [currentCaption, setCurrentCaption] = useState<string>("");
  const [srtContent, setSrtContent] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string>("");
  const [captionStyleId, setCaptionStyleId] =
    useState<CaptionStyleId>("tiktok-pop");

  const [currentTimeDebug, setCurrentTimeDebug] = useState<number>(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  const activeStyle =
    captionStyles.find((s) => s.id === captionStyleId) || captionStyles[0];

  // Max file size: 25MB (to avoid huge base64 payloads)
  const MAX_BYTES = 25 * 1024 * 1024;

  const handleVideoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;

    // Clear previous state
    setCaptions([]);
    setTranscript("");
    setCurrentCaption("");
    setSrtContent(null);
    setError(null);

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    if (!file) {
      setVideoFile(null);
      setPreviewUrl(null);
      return;
    }

    // Check file size BEFORE setting state
    if (file.size > MAX_BYTES) {
      setVideoFile(null);
      setPreviewUrl(null);
      setError(
        "Video is too large. Please upload a shorter, lower-resolution clip (under ~25MB)."
      );
      return;
    }

    setVideoFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    const t = video.currentTime;
    setCurrentTimeDebug(t);

    if (!captions.length) {
      setCurrentCaption("");
      return;
    }

    const active = captions.find((c) => t >= c.start && t <= c.end);
    setCurrentCaption(active ? active.text : "");
  };

  // Helper to convert File to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (!result || typeof result !== "string") {
          return reject(new Error("Failed to read file."));
        }
        // result is "data:video/mp4;base64,AAAA..."
        const base64 = result.split(",")[1] || "";
        resolve(base64);
      };
      reader.onerror = () => reject(reader.error || new Error("File read error."));
      reader.readAsDataURL(file);
    });
  };

  const handleGenerateCaptions = async () => {
    if (!videoFile) {
      setError("Please choose a video file first.");
      return;
    }

    setIsTranscribing(true);
    setError(null);

    try {
      console.log("[LyricCaptionerCore] Converting video to base64...");

      // Convert file to base64 - NO multipart parsing
      const base64 = await fileToBase64(videoFile);

      console.log("[LyricCaptionerCore] Sending base64 video for transcription...");

      const res = await fetch("/.netlify/functions/transcribe-video-base64", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileBase64: base64,
          mimeType: videoFile.type || "video/mp4",
        }),
      });

      // Defensive: Handle non-JSON responses (should be rare now)
      const rawText = await res.text();
      let data: any = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch (parseErr) {
        console.error("[LyricCaptionerCore] JSON parse error", parseErr);
        console.error("[LyricCaptionerCore] Raw response:", rawText.substring(0, 200));
        throw new Error(
          "Server returned an invalid response. Please try again or contact support."
        );
      }

      if (!res.ok) {
        // Backend always provides a clear message now
        throw new Error(
          data?.message || "There was a problem transcribing your video."
        );
      }

      console.log("[LyricCaptionerCore] Transcription successful");

      setTranscript(data.transcript || "");
      const segments = data.segments || [];
      setCaptions(segments);

      // Convert to SRT format
      if (segments.length > 0) {
        const srtLines = segments
          .map((seg: Caption, idx: number) => {
            const startTime = formatSrtTime(seg.start);
            const endTime = formatSrtTime(seg.end);
            return `${idx + 1}\n${startTime} --> ${endTime}\n${seg.text}\n`;
          })
          .join("\n");
        setSrtContent(srtLines);
      }
    } catch (err: any) {
      console.error("[LyricCaptionerCore] Transcription error", err);
      setError(err.message || "There was a problem transcribing your video.");
    } finally {
      setIsTranscribing(false);
    }
  };

  const formatSrtTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
  };

  const debugInfo = {
    hasFile: !!videoFile,
    hasVideoUrl: !!previewUrl,
    captionsCount: captions.length,
    currentTime: Number(currentTimeDebug.toFixed(2)),
  };

  return (
    <div className="space-y-6">
      <div className="bg-neutral-900/80 border border-white/10 rounded-2xl p-6 space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Video file</label>
          <input
            type="file"
            accept="video/*"
            onChange={handleVideoChange}
            className="text-sm text-gray-300 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-500 cursor-pointer"
          />
          <p className="text-xs text-gray-500">
            Short clips/snippets work best. Max a few minutes for now.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Caption style</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {captionStyles.map((style) => (
              <button
                key={style.id}
                type="button"
                onClick={() => setCaptionStyleId(style.id)}
                className={`text-left px-3 py-2 rounded-lg text-xs border transition ${
                  captionStyleId === style.id
                    ? "bg-blue-600 border-blue-400 text-white"
                    : "bg-neutral-800 border-white/10 text-gray-300 hover:bg-neutral-700"
                }`}
              >
                <div className="font-semibold">{style.name}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">
                  {style.description}
                </div>
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleGenerateCaptions}
          disabled={isTranscribing || !videoFile}
          className="mt-4 inline-flex items-center justify-center px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {isTranscribing ? "Generating captions..." : "Generate Lyrics & Captions"}
        </button>

        {error && (
          <div className="mt-4 rounded-md bg-red-900/40 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Preview</h2>
          <div className="relative bg-black/70 border border-white/10 rounded-2xl overflow-hidden aspect-video flex items-center justify-center">
            {previewUrl ? (
              <>
                <video
                  ref={videoRef}
                  src={previewUrl}
                  controls
                  onTimeUpdate={handleTimeUpdate}
                  className="w-full h-full object-contain"
                />
                {currentCaption && (
                  <div className={activeStyle.containerClass}>
                    <div
                      className={`${activeStyle.textClass} ${
                        activeStyle.animationClass || ""
                      }`}
                    >
                      {currentCaption}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-500">No video loaded</p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Captions</h2>
          <div className="bg-neutral-900/60 border border-white/10 rounded-2xl p-4 max-h-[400px] overflow-y-auto">
            {captions.length > 0 ? (
              <div className="space-y-2 text-sm">
                {captions.map((caption, idx) => (
                  <div
                    key={idx}
                    className="px-3 py-2 bg-neutral-800/50 rounded-lg border border-white/5"
                  >
                    <div className="text-[10px] text-gray-500 mb-1">
                      {caption.start.toFixed(2)}s - {caption.end.toFixed(2)}s
                    </div>
                    <div className="text-gray-200">{caption.text}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                No captions yet. Generate them from your video.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase.client";
import { chargeCredits, InsufficientCreditsError, getWallet } from '../lib/credits';
import InsufficientCreditsModal from './ui/InsufficientCreditsModal';

interface CoverArtImage {
  id: string;
  prompt: string;
  style: string | null;
  template_id: string | null;
  image_url: string;
  size: string;
  variant: string;
  created_at: string;
}

export default function CoverArtGenerator({ userId }: { userId: string }) {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [size, setSize] = useState("1024x1024");

  const [toolsCredits, setToolsCredits] = useState<number | null>(null);
  const [history, setHistory] = useState<CoverArtImage[]>([]);
  const [current, setCurrent] = useState<CoverArtImage | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [referenceBase64, setReferenceBase64] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [referenceMimeType, setReferenceMimeType] = useState<string | null>(null);
  const [referenceMode, setReferenceMode] = useState<"reference" | "insert">("reference");
  const [insufficientModal, setInsufficientModal] = useState<{
    open: boolean;
    cost: number;
    remaining: number;
    featureKey: string;
    plan: string;
  }>({
    open: false,
    cost: 0,
    remaining: 0,
    featureKey: '',
    plan: 'operator',
  });

  const STANDARD_COST = 300;
  const UPSCALE_COST = 150;

  const styles = ["Moody", "Vibrant", "Minimal", "Dark", "Cinematic", "Gritty"];

  const templates = [
    { id: "modern-trap", name: "Modern Trap", desc: "PA label, bold text" },
    { id: "retro-vintage", name: "Retro Vintage", desc: "70s vibe, warm colors" },
    { id: "clean-rnb", name: "Clean R&B", desc: "Minimal, elegant" },
    { id: "rage-neon", name: "Rage Neon", desc: "Glitch, cyberpunk" },
    { id: "indie-minimal", name: "Indie Minimal", desc: "Simple, muted" },
    { id: "hip-hop-classic", name: "Hip-Hop Classic", desc: "Urban, bold" }
  ];

  // Load wallet credits and history on mount
  useEffect(() => {
    loadCreditsAndHistory();
  }, [userId]);

  const loadCreditsAndHistory = async () => {
    try {
      // Fetch wallet credits
      const { data: wallet } = await supabase
        .from("user_wallets")
        .select("tools_budget_balance")
        .eq("user_id", userId)
        .maybeSingle();

      setToolsCredits(wallet?.tools_budget_balance || 0);

      // Fetch history
      const { data: historyData } = await supabase
        .from("cover_art_images")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(12);

      setHistory(historyData || []);

      // Set most recent as current
      if (historyData && historyData.length > 0) {
        setCurrent(historyData[0]);
      }
    } catch (err) {
      console.error("Error loading credits/history:", err);
    }
  };

  const onGenerate = async () => {
    setIsLoading(true);
    setError(null);

    // Charge credits FIRST using the new credit economy system
    try {
      await chargeCredits('ai_cover_art_generate', {
        prompt,
        style,
        size,
        userId,
      });
    } catch (error: any) {
      setIsLoading(false);
      if (error instanceof InsufficientCreditsError) {
        const wallet = await getWallet(userId);
        setInsufficientModal({
          open: true,
          cost: error.cost,
          remaining: error.remaining,
          featureKey: error.feature_key,
          plan: wallet?.plan || 'operator',
        });
        return;
      }
      setError(error.message || 'Failed to charge credits');
      return;
    }

    // Check if user has enough credits (legacy check for tools_budget_balance)
    if (toolsCredits !== null && toolsCredits < STANDARD_COST) {
      setError(`You need ${STANDARD_COST} Tools credits. Top up your wallet to continue.`);
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/.netlify/functions/generate-cover-art', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: userId,
          prompt: prompt.trim(),
          style: style || null,
          size: size,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error === "INSUFFICIENT_CREDITS") {
          throw new Error(data.message || "Not enough Tools credits");
        }
        if (data.error === "missing_env") {
          throw new Error(`Configuration error: ${data.message}. Please check Netlify environment variables.`);
        }
        throw new Error(data.message || data.error || "Failed to generate cover art");
      }

      // Update credits
      setToolsCredits(data.remainingCredits);

      // Create new history entry
      const newImage: CoverArtImage = {
        id: data.path || Date.now().toString(),
        prompt: prompt,
        style: style || null,
        template_id: templateId,
        image_url: data.publicUrl,
        size: data.size || size,
        variant: "standard",
        created_at: new Date().toISOString()
      };

      // Add to history and set as current
      setHistory([newImage, ...history]);
      setCurrent(newImage);

    } catch (err: any) {
      console.error("Cover art generation error:", err);
      setError(err.message || "Failed to generate cover art. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const onUpscale = async () => {
    if (!current) return;

    setIsLoading(true);
    setError(null);

    // Check credits
    if (toolsCredits !== null && toolsCredits < UPSCALE_COST) {
      setError(`You need ${UPSCALE_COST} Tools credits for upscale. Top up your wallet to continue.`);
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/.netlify/functions/generate-cover-art', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: userId,
          prompt: current.prompt,
          style: current.style,
          size: "1024x1792", // Upscale to larger size
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error === "INSUFFICIENT_CREDITS") {
          throw new Error(data.message || "Not enough Tools credits");
        }
        if (data.error === "missing_env") {
          throw new Error(`Configuration error: ${data.message}. Please check Netlify environment variables.`);
        }
        throw new Error(data.message || data.error || "Failed to upscale image");
      }

      // Update credits
      setToolsCredits(data.remainingCredits);

      // Create new history entry for upscale
      const newImage: CoverArtImage = {
        id: data.path || Date.now().toString(),
        prompt: current.prompt,
        style: current.style,
        template_id: current.template_id,
        image_url: data.publicUrl,
        size: data.size || "1024x1792",
        variant: "upscale_hd",
        created_at: new Date().toISOString()
      };

      // Add to history and set as current
      setHistory([newImage, ...history]);
      setCurrent(newImage);

    } catch (err: any) {
      console.error("Upscale error:", err);
      setError(err.message || "Failed to upscale image. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = (url: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = "cover-art.png";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const canUpscale = current && current.variant !== "upscale_hd" && toolsCredits !== null && toolsCredits >= UPSCALE_COST;

  return (
    <div className="ghoste-page-bg text-white">
      <div className="max-w-7xl mx-auto px-4 py-8 sm:py-12 relative z-10">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between flex-wrap gap-4 mb-3">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">Cover Art Generator</h1>
              <p className="text-base text-gray-400">
                Generate release-ready cover art in the Ghoste style
              </p>
            </div>
            {toolsCredits !== null && (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-ghoste-blue/10 border border-ghoste-blue/20">
                <div className="text-sm text-gray-400">Tools Credits</div>
                <div className="text-xl font-bold text-ghoste-blue">
                  {toolsCredits.toLocaleString()}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Two-column layout */}
        <div className="grid gap-6 lg:grid-cols-2 xl:gap-8">
          {/* Left: Controls */}
          <div className="ghoste-card p-6 sm:p-8 space-y-6">
            {/* Prompt Input */}
            <div>
              <label className="block text-sm font-semibold text-white mb-2">
                Describe your cover art
              </label>
              <textarea
                className="w-full rounded-2xl bg-black/40 border border-gray-700/50 p-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-ghoste-blue/50 focus:border-ghoste-blue/50 transition-all resize-none"
                rows={4}
                placeholder='e.g. "Moody midnight trap album cover with neon lightning and urban skyline"'
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </div>

            {/* Style Chips */}
            <div>
              <label className="block text-sm font-semibold text-white mb-3">Quick Style</label>
              <div className="flex flex-wrap gap-2">
                {styles.map((s) => (
                  <button
                    key={s}
                    onClick={() => setStyle(style === s ? "" : s)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                      style === s
                        ? "bg-ghoste-blue text-white shadow-lg shadow-ghoste-blue/25"
                        : "bg-black/40 border border-gray-700/50 text-gray-300 hover:border-ghoste-blue/50 hover:text-white"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Template Chips */}
            <div>
              <label className="block text-sm font-semibold text-white mb-3">
                Layout Template
              </label>
              <div className="grid grid-cols-2 gap-3">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTemplateId(templateId === t.id ? null : t.id)}
                    className={`p-4 rounded-xl text-left transition-all ${
                      templateId === t.id
                        ? "bg-ghoste-blue border border-ghoste-blue shadow-lg shadow-ghoste-blue/20"
                        : "bg-black/40 border border-gray-700/50 hover:border-ghoste-blue/50"
                    }`}
                  >
                    <div className="text-sm font-semibold text-white mb-1">{t.name}</div>
                    <div className="text-xs text-gray-400">{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Reference Image Upload */}
            <div>
              <label className="block text-sm font-semibold text-white mb-2">
                Reference Image <span className="text-gray-500 font-normal">(optional)</span>
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setReferenceFile(file || null);
                  setReferencePreview(null);
                  setReferenceBase64(null);
                  setReferenceMimeType(null);
                  setFileError(null);

                  if (!file) return;

                  if (!file.type.startsWith("image/")) {
                    setFileError("Please upload a valid image file");
                    return;
                  }

                  setReferenceMimeType(file.type);

                  const reader = new FileReader();
                  reader.onloadend = () => {
                    const result = reader.result;
                    if (typeof result === "string") {
                      setReferencePreview(result);
                      setReferenceBase64(result);
                    }
                  };
                  reader.readAsDataURL(file);
                }}
                className="block w-full text-sm text-gray-400 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:bg-ghoste-blue file:text-white file:font-semibold hover:file:bg-blue-600 file:cursor-pointer cursor-pointer transition-all"
              />

              {fileError && (
                <p className="mt-2 text-xs text-red-400">{fileError}</p>
              )}

              {referencePreview && (
                <div className="mt-4">
                  <div className="w-32 h-32 rounded-xl overflow-hidden border border-gray-700/50 bg-black/40">
                    <img
                      src={referencePreview}
                      alt="Reference"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="mt-3 space-y-2 text-sm">
                    <label className="flex items-center gap-2 cursor-pointer text-gray-300 hover:text-white transition-colors">
                      <input
                        type="radio"
                        checked={referenceMode === "reference"}
                        onChange={() => setReferenceMode("reference")}
                        className="text-ghoste-blue focus:ring-ghoste-blue"
                      />
                      <span>Style inspiration only</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-gray-300 hover:text-white transition-colors">
                      <input
                        type="radio"
                        checked={referenceMode === "insert"}
                        onChange={() => setReferenceMode("insert")}
                        className="text-ghoste-blue focus:ring-ghoste-blue"
                      />
                      <span>Insert into cover <span className="text-xs text-gray-500">(beta)</span></span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Size Selector */}
            <div>
              <label className="block text-sm font-semibold text-white mb-2">Output Size</label>
              <select
                className="w-full rounded-xl bg-black/40 border border-gray-700/50 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-ghoste-blue/50 focus:border-ghoste-blue/50 transition-all cursor-pointer"
                value={size}
                onChange={(e) => setSize(e.target.value)}
              >
                <option value="1024x1024">1024 x 1024 (Square)</option>
                <option value="1024x1792">1024 x 1792 (Portrait)</option>
                <option value="1792x1024">1792 x 1024 (Landscape)</option>
              </select>
            </div>

            {/* Generate Button */}
            <div className="pt-4">
              <div className="flex items-center justify-between mb-3 text-sm">
                <span className="text-gray-400">Generation cost:</span>
                <span className="font-semibold text-ghoste-blue">{STANDARD_COST} credits</span>
              </div>
              <button
                onClick={onGenerate}
                disabled={isLoading || !prompt || toolsCredits === null || toolsCredits < STANDARD_COST}
                className="w-full px-6 py-4 rounded-2xl bg-ghoste-blue text-white font-semibold hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-ghoste-blue/20 hover:shadow-ghoste-blue/30 disabled:shadow-none"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Generating...
                  </span>
                ) : (
                  "Generate Cover Art"
                )}
              </button>
              <p className="text-xs text-gray-500 text-center mt-3">
                Your drafts are saved automatically
              </p>
            </div>

            {/* Error State */}
            {error && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                <div className="font-semibold mb-1">Generation Failed</div>
                <div className="text-xs text-red-300">{error}</div>
              </div>
            )}
          </div>

          {/* Right: Preview & Results */}
          <div className="space-y-6">
            {/* Current Preview */}
            {current ? (
              <div className="ghoste-card p-5 sm:p-6">
                <h3 className="text-sm font-semibold text-white mb-4">Current Preview</h3>
                <div className="aspect-square overflow-hidden rounded-2xl bg-black/60 mb-4 border border-gray-700/30">
                  <img
                    src={current.image_url}
                    alt="Generated cover"
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-3 mb-4">
                  <button
                    onClick={() => handleDownload(current.image_url)}
                    className="flex-1 px-4 py-3 rounded-xl bg-ghoste-blue text-white text-sm font-semibold hover:bg-blue-600 transition-all shadow-lg shadow-ghoste-blue/20"
                  >
                    Download
                  </button>
                  <button
                    onClick={onUpscale}
                    disabled={!canUpscale || isLoading}
                    className="flex-1 px-4 py-3 rounded-xl bg-black/40 border border-gray-700/50 text-white text-sm font-semibold hover:border-ghoste-blue/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? "..." : `Upscale (${UPSCALE_COST})`}
                  </button>
                </div>

                {/* Metadata */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="px-3 py-2 rounded-lg bg-black/40">
                    <div className="text-gray-500 mb-1">Variant</div>
                    <div className="text-white font-medium">{current.variant}</div>
                  </div>
                  <div className="px-3 py-2 rounded-lg bg-black/40">
                    <div className="text-gray-500 mb-1">Size</div>
                    <div className="text-white font-medium">{current.size}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="ghoste-card p-8">
                <div className="aspect-square flex items-center justify-center rounded-2xl bg-black/40 border border-dashed border-gray-700/50">
                  <div className="text-center">
                    <svg className="w-16 h-16 text-gray-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-gray-400 text-sm">Your cover art will appear here</p>
                  </div>
                </div>
              </div>
            )}

            {/* Recent Generations Grid */}
            {history.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-white mb-4">Recent Generations</h3>
                <div className="grid grid-cols-3 gap-3">
                  {history.map((img) => (
                    <button
                      key={img.id}
                      onClick={() => setCurrent(img)}
                      className={`aspect-square rounded-xl overflow-hidden border-2 transition-all image-tile-hover ${
                        current?.id === img.id
                          ? "border-ghoste-blue shadow-lg shadow-ghoste-blue/30"
                          : "border-gray-700/50 hover:border-ghoste-blue/60"
                      }`}
                    >
                      <img
                        src={img.image_url}
                        alt="History"
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Insufficient Credits Modal */}
      <InsufficientCreditsModal
        isOpen={insufficientModal.open}
        onClose={() => setInsufficientModal({ ...insufficientModal, open: false })}
        cost={insufficientModal.cost}
        remaining={insufficientModal.remaining}
        featureKey={insufficientModal.featureKey}
        plan={insufficientModal.plan}
      />
    </div>
  );
}

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
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-semibold">Cover Art Generator</h1>
            <p className="text-sm text-gray-400 mt-1">
              AI-powered album cover creation with templates
            </p>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-400">Tools Credits</div>
            <div className="text-2xl font-bold text-blue-400">
              {toolsCredits !== null ? toolsCredits.toLocaleString() : "..."}
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left: Form */}
          <div className="bg-neutral-900/80 border border-white/10 rounded-2xl p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Describe your cover art
              </label>
              <textarea
                className="w-full rounded-lg bg-black/60 border border-white/10 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder='e.g. "Dark blue trap album cover with lightning"'
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </div>

            {/* Style chips */}
            <div>
              <label className="block text-sm font-medium mb-2">Style (optional)</label>
              <div className="flex flex-wrap gap-2">
                {styles.map((s) => (
                  <button
                    key={s}
                    onClick={() => setStyle(style === s ? "" : s)}
                    className={`px-3 py-1.5 rounded-lg text-sm transition ${
                      style === s
                        ? "bg-blue-600 text-white"
                        : "bg-black/60 border border-white/10 hover:border-blue-500"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Template chips */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Cover Layout Template (optional)
              </label>
              <div className="grid grid-cols-2 gap-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTemplateId(templateId === t.id ? null : t.id)}
                    className={`p-3 rounded-lg text-left transition ${
                      templateId === t.id
                        ? "bg-blue-600 border border-blue-500"
                        : "bg-black/60 border border-white/10 hover:border-blue-500"
                    }`}
                  >
                    <div className="text-sm font-medium">{t.name}</div>
                    <div className="text-xs text-gray-400">{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Reference image upload */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Reference Image (optional)
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
                className="text-sm text-gray-300 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-500 cursor-pointer"
              />

              {fileError && (
                <p className="mt-1 text-xs text-red-400">{fileError}</p>
              )}

              {referencePreview && (
                <div className="mt-3">
                  <div className="w-32 h-32 rounded-lg overflow-hidden border border-white/10 bg-black/60">
                    <img
                      src={referencePreview}
                      alt="Reference"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="mt-2 space-y-1 text-xs">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={referenceMode === "reference"}
                        onChange={() => setReferenceMode("reference")}
                      />
                      <span>Style inspiration only</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={referenceMode === "insert"}
                        onChange={() => setReferenceMode("insert")}
                      />
                      <span>Insert into cover (beta)</span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Size selector */}
            <div>
              <label className="block text-sm font-medium mb-1">Size</label>
              <select
                className="w-full rounded-lg bg-black/60 border border-white/10 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={size}
                onChange={(e) => setSize(e.target.value)}
              >
                <option value="1024x1024">1024 x 1024</option>
                <option value="1024x1792">1024 x 1792 (Portrait)</option>
                <option value="1792x1024">1792 x 1024 (Landscape)</option>
              </select>
            </div>

            {/* Cost and Generate button */}
            <div className="pt-2">
              <div className="flex items-center justify-between mb-2 text-xs text-slate-400">
                <span>Generation cost:</span>
                <span className="font-bold text-blue-400">{STANDARD_COST} Tools credits</span>
              </div>
              <button
                onClick={onGenerate}
                disabled={isLoading || !prompt || toolsCredits === null || toolsCredits < STANDARD_COST}
                className="w-full px-4 py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {isLoading ? "Generating..." : "Generate Cover Art"}
              </button>
            </div>

            {error && (
              <div className="text-sm text-red-400 bg-red-950/40 border border-red-800/60 rounded-lg p-3">
                {error}
              </div>
            )}
          </div>

          {/* Right: Preview and History */}
          <div className="space-y-6">
            {/* Current image preview */}
            {current && (
              <div className="bg-neutral-900/80 border border-white/10 rounded-2xl p-4">
                <div className="aspect-square overflow-hidden rounded-xl bg-black/60 mb-4">
                  <img
                    src={current.image_url}
                    alt="Generated cover"
                    className="w-full h-full object-cover"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleDownload(current.image_url)}
                    className="flex-1 px-3 py-2 rounded-lg bg-blue-600 text-sm font-medium hover:bg-blue-500 transition"
                  >
                    Download
                  </button>
                  <button
                    onClick={onUpscale}
                    disabled={!canUpscale || isLoading}
                    className="flex-1 px-3 py-2 rounded-lg bg-neutral-800 text-sm font-medium hover:bg-neutral-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? "..." : `Upscale HD (${UPSCALE_COST})`}
                  </button>
                </div>

                <div className="mt-3 text-xs text-gray-400">
                  <div><span className="font-medium">Variant:</span> {current.variant}</div>
                  <div><span className="font-medium">Size:</span> {current.size}</div>
                </div>
              </div>
            )}

            {/* History grid */}
            {history.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-3 text-gray-400">Your Cover Art History</h3>
                <div className="grid grid-cols-3 gap-3">
                  {history.map((img) => (
                    <button
                      key={img.id}
                      onClick={() => setCurrent(img)}
                      className={`aspect-square rounded-lg overflow-hidden border-2 transition ${
                        current?.id === img.id
                          ? "border-blue-500"
                          : "border-white/10 hover:border-blue-400"
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

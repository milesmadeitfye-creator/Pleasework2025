/**
 * Resolver Status Badge
 * Shows resolver path, confidence, and allows re-checking
 */

import { useState } from "react";
import {
  getResolverPathLabel,
  getConfidenceColor,
  getConfidenceLabel,
  resolveSmartLink,
  type ResolveSmartLinkResult,
} from "../../lib/smartlinks/resolverClient";

type Props = {
  smartLinkId: string;
  resolverPath?: string;
  confidence?: number;
  resolverSources?: string[];
  needsManualReview?: boolean;
  onResolveComplete?: (result: ResolveSmartLinkResult) => void;
};

export function ResolverStatusBadge({
  smartLinkId,
  resolverPath = "none",
  confidence = 0,
  resolverSources = [],
  needsManualReview = false,
  onResolveComplete,
}: Props) {
  const [isRechecking, setIsRechecking] = useState(false);

  const handleRecheck = async () => {
    setIsRechecking(true);
    try {
      const result = await resolveSmartLink({
        smartLinkId,
        forceRefresh: true,
      });

      if (onResolveComplete) {
        onResolveComplete(result);
      }
    } catch (err) {
      console.error("Recheck failed:", err);
    } finally {
      setIsRechecking(false);
    }
  };

  const pathLabel = getResolverPathLabel(resolverPath);
  const confidenceColor = getConfidenceColor(confidence);
  const confidenceLabel = getConfidenceLabel(confidence);

  return (
    <div className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg border border-gray-700">
      {/* Resolver Path Badge */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">Resolved via:</span>
        <span
          className={`px-2 py-1 rounded text-xs font-medium ${
            resolverPath === "cache"
              ? "bg-blue-500/10 text-blue-400"
              : resolverPath.includes("acrcloud")
              ? "bg-purple-500/10 text-purple-400"
              : "bg-gray-500/10 text-gray-400"
          }`}
        >
          {pathLabel}
        </span>
      </div>

      {/* Confidence Score */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">Confidence:</span>
        <span className={`text-xs font-medium ${confidenceColor}`}>
          {(confidence * 100).toFixed(0)}% ({confidenceLabel})
        </span>
      </div>

      {/* Sources */}
      {resolverSources.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Sources:</span>
          <span className="text-xs text-gray-300">{resolverSources.join(", ")}</span>
        </div>
      )}

      {/* Manual Review Warning */}
      {needsManualReview && (
        <div className="flex items-center gap-1 px-2 py-1 bg-yellow-500/10 rounded">
          <svg
            className="w-4 h-4 text-yellow-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <span className="text-xs text-yellow-500 font-medium">Needs Review</span>
        </div>
      )}

      {/* Re-check Button */}
      <button
        onClick={handleRecheck}
        disabled={isRechecking}
        className="ml-auto px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white text-xs font-medium rounded transition-colors flex items-center gap-2"
      >
        {isRechecking ? (
          <>
            <svg
              className="animate-spin h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <span>Re-checking...</span>
          </>
        ) : (
          <>
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            <span>Re-check</span>
          </>
        )}
      </button>
    </div>
  );
}

import { X, AlertCircle, Zap, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface InsufficientCreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
  cost: number;
  remaining: number;
  featureKey: string;
  plan: string;
}

export default function InsufficientCreditsModal({
  isOpen,
  onClose,
  cost,
  remaining,
  featureKey,
  plan,
}: InsufficientCreditsModalProps) {
  const navigate = useNavigate();

  if (!isOpen) return null;

  const needed = Math.max(0, cost - remaining);

  const featureLabels: Record<string, string> = {
    smart_link_create: 'Create Smart Link',
    smart_link_update: 'Update Smart Link',
    listening_party_create: 'Create Listening Party',
    ad_campaign_create: 'Create Ad Campaign',
    ad_adset_create: 'Create Ad Set',
    ad_creative_generate: 'Generate Ad Creative',
    ai_manager_prompt: 'Ghoste AI Chat',
    ai_cover_art_generate: 'Generate Cover Art',
    ai_video_generate: 'Generate AI Video',
    ai_video_stitch: 'Stitch Video',
    email_sequence_generate: 'Generate Email Sequence',
    email_send_batch: 'Send Email Batch',
    analytics_export: 'Export Analytics',
    file_upload_large: 'Large File Upload',
  };

  const handleUpgrade = () => {
    onClose();
    navigate('/subscriptions');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 to-black p-6 shadow-2xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-white/50 hover:bg-white/10 hover:text-white transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Icon */}
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20 border border-red-500/30">
          <AlertCircle className="h-8 w-8 text-red-400" />
        </div>

        {/* Title */}
        <h2 className="mt-4 text-center text-2xl font-bold text-white">
          Insufficient Credits
        </h2>

        {/* Description */}
        <p className="mt-2 text-center text-sm text-white/60">
          You don't have enough credits to complete this action.
        </p>

        {/* Details */}
        <div className="mt-6 space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/60">Action</span>
            <span className="font-semibold text-white">
              {featureLabels[featureKey] || featureKey}
            </span>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-white/60">Current Plan</span>
            <span className="font-semibold text-white capitalize">{plan}</span>
          </div>

          <div className="my-2 border-t border-white/10"></div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-white/60">Cost</span>
            <span className="font-semibold text-white">{cost.toLocaleString()} credits</span>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-white/60">Available</span>
            <span className="font-semibold text-red-300">{remaining.toLocaleString()} credits</span>
          </div>

          <div className="my-2 border-t border-white/10"></div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-white/60">Needed</span>
            <span className="font-bold text-red-400">{needed.toLocaleString()} credits</span>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-col gap-3">
          <button
            onClick={handleUpgrade}
            className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 px-4 py-3 font-semibold text-white hover:from-blue-600 hover:to-cyan-600 transition-all shadow-lg"
          >
            <Zap className="h-5 w-5" />
            Upgrade Plan
            <ArrowRight className="h-5 w-5" />
          </button>

          <button
            onClick={onClose}
            className="rounded-lg border border-white/10 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
        </div>

        {/* Footer */}
        <p className="mt-4 text-center text-xs text-white/40">
          Scale plan users get unlimited credits with fair use
        </p>
      </div>
    </div>
  );
}

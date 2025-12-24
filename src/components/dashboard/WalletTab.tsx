import React, { useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { safeToFixed } from "../../utils/numbers";

type StripeStatus =
  | { connected: false }
  | {
      connected: true;
      payoutsEnabled: boolean;
      detailsSubmitted: boolean;
      accountId?: string;
    };

const WalletTab: React.FC = () => {
  const { user } = useAuth();

  const currentUser = {
    id: user?.id || "demo-user-123",
    email: user?.email || "artist@example.com",
    name: user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split("@")[0] || "Demo Artist",
  };

  const [stripeStatus, setStripeStatus] = useState<StripeStatus | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isManaging, setIsManaging] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);

  const [campaignName, setCampaignName] = useState("");
  const [campaignBudget, setCampaignBudget] = useState<number | string>("");
  const [isFunding, setIsFunding] = useState(false);
  const [fundError, setFundError] = useState<string | null>(null);

  const origin =
    typeof window !== "undefined" ? window.location.origin : "";

  const refreshStripeStatus = async () => {
    if (!currentUser.email || !currentUser.id) return;
    setIsLoadingStatus(true);
    setWalletError(null);
    try {
      const res = await fetch(
        "/.netlify/functions/stripe-connect-account",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "status",
            userId: currentUser.id,
            email: currentUser.email,
          }),
        }
      );

      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to load Stripe status.");
      }

      if (!data.connected) {
        setStripeStatus({ connected: false });
      } else {
        setStripeStatus({
          connected: true,
          payoutsEnabled: !!data.payoutsEnabled,
          detailsSubmitted: !!data.detailsSubmitted,
          accountId: data.accountId,
        });
      }
    } catch (err: any) {
      console.error("Stripe status error:", err);
      setWalletError(
        err?.message ||
          "Could not load Stripe connection status. Try again or check logs."
      );
      setStripeStatus(null);
    } finally {
      setIsLoadingStatus(false);
    }
  };

  useEffect(() => {
    refreshStripeStatus();
  }, []);

  const handleConnectStripe = async () => {
    setWalletError(null);
    setIsConnecting(true);
    try {
      const res = await fetch(
        "/.netlify/functions/stripe-connect-account",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "onboard",
            userId: currentUser.id,
            email: currentUser.email,
            name: currentUser.name,
            redirectBaseUrl: origin,
          }),
        }
      );

      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || data.error || !data.url) {
        throw new Error(
          data.error || "Could not start Stripe onboarding."
        );
      }

      window.location.href = data.url as string;
    } catch (err: any) {
      console.error("Connect Stripe error:", err);
      setWalletError(
        err?.message ||
          "Something went wrong starting Stripe onboarding."
      );
    } finally {
      setIsConnecting(false);
    }
  };

  const handleManageStripe = async () => {
    setWalletError(null);
    setIsManaging(true);
    try {
      const res = await fetch(
        "/.netlify/functions/stripe-connect-account",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "manage",
            userId: currentUser.id,
            email: currentUser.email,
            name: currentUser.name,
            redirectBaseUrl: origin,
          }),
        }
      );

      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || data.error || !data.url) {
        throw new Error(
          data.error || "Could not open Stripe dashboard."
        );
      }

      window.open(data.url as string, "_blank");
    } catch (err: any) {
      console.error("Manage Stripe error:", err);
      setWalletError(
        err?.message ||
          "Something went wrong opening your Stripe dashboard."
      );
    } finally {
      setIsManaging(false);
    }
  };

  const handleFundCampaign = async () => {
    setFundError(null);

    const numericBudget = Number(campaignBudget);
    if (!campaignName.trim()) {
      setFundError("Give your campaign a name.");
      return;
    }
    if (!numericBudget || numericBudget <= 0) {
      setFundError("Enter a positive budget amount (in USD).");
      return;
    }

    setIsFunding(true);
    try {
      const res = await fetch(
        "/.netlify/functions/create-campaign-checkout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: currentUser.id,
            email: currentUser.email,
            campaignName: campaignName.trim(),
            budget: numericBudget,
            redirectBaseUrl: origin,
          }),
        }
      );

      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || data.error || !data.url) {
        throw new Error(
          data.error || "Could not create payment for this campaign."
        );
      }

      window.location.href = data.url as string;
    } catch (err: any) {
      console.error("Fund campaign error:", err);
      setFundError(
        err?.message ||
          "Something went wrong starting the payment. Check your Stripe configuration."
      );
    } finally {
      setIsFunding(false);
    }
  };

  const renderStripeStatus = () => {
    if (isLoadingStatus && !stripeStatus) {
      return (
        <p className="text-xs text-gray-400">
          Checking your Stripe connection…
        </p>
      );
    }

    if (!stripeStatus) {
      return (
        <p className="text-xs text-gray-400">
          We couldn&apos;t load your Stripe status yet.
        </p>
      );
    }

    if (!stripeStatus.connected) {
      return (
        <p className="text-xs text-gray-400">
          Your payout wallet is not connected yet. Connect Stripe to get ready
          for future payouts and premium features.
        </p>
      );
    }

    return (
      <div className="space-y-1 text-xs text-gray-300">
        <p>
          Status:{" "}
          <span className="text-emerald-400 font-semibold">
            Connected
          </span>
        </p>
        <p>
          Payouts:{" "}
          <span
            className={
              stripeStatus.payoutsEnabled
                ? "text-emerald-400"
                : "text-yellow-300"
            }
          >
            {stripeStatus.payoutsEnabled ? "Enabled" : "Pending review"}
          </span>
        </p>
        <p>
          Details submitted:{" "}
          <span
            className={
              stripeStatus.detailsSubmitted
                ? "text-emerald-400"
                : "text-yellow-300"
            }
          >
            {stripeStatus.detailsSubmitted ? "Yes" : "Incomplete"}
          </span>
        </p>
      </div>
    );
  };

  const estimatedTotal =
    campaignBudget && Number(campaignBudget) > 0
      ? Number(campaignBudget) + 19
      : null;

  return (
    <div className="space-y-6">
      <div className="bg-neutral-900/80 border border-white/10 rounded-2xl p-5 space-y-3">
        <h1 className="text-xl font-semibold text-white">Wallet</h1>
        <p className="text-sm text-gray-400">
          Connect your payout wallet and fund campaigns. Campaign payments are
          billed as <span className="font-semibold">$campaign budget + $19</span>{" "}
          automation fee.
        </p>
      </div>

      <div className="bg-neutral-900/80 border border-white/10 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">
              Stripe payout wallet
            </h2>
            {renderStripeStatus()}
          </div>
          <div className="flex flex-col items-end gap-2">
            {!stripeStatus?.connected ? (
              <button
                type="button"
                onClick={handleConnectStripe}
                disabled={isConnecting}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-medium hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {isConnecting ? "Connecting…" : "Connect Stripe"}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleManageStripe}
                disabled={isManaging}
                className="px-4 py-2 rounded-xl bg-neutral-800 text-white text-xs font-medium hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {isManaging ? "Opening…" : "Manage on Stripe"}
              </button>
            )}
            <button
              type="button"
              onClick={refreshStripeStatus}
              disabled={isLoadingStatus}
              className="text-[10px] text-gray-400 hover:text-gray-200"
            >
              {isLoadingStatus ? "Refreshing…" : "Refresh status"}
            </button>
          </div>
        </div>

        {walletError && (
          <div className="text-xs text-red-400 bg-red-950/40 border border-red-800/60 rounded-lg p-2 mt-1">
            {walletError}
          </div>
        )}
      </div>

      <div className="bg-neutral-900/80 border border-white/10 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">
              Fund a campaign
            </h2>
            <p className="text-xs text-gray-400">
              Charge your card for the full campaign amount. Ghoste will allocate
              your ad budget and a fixed{" "}
              <span className="font-semibold">$19</span> automation fee covers
              our setup, optimization, and tools.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-200">
                Campaign name
              </label>
              <input
                type="text"
                className="w-full rounded-lg bg-black/70 border border-white/15 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. RICH DROPOUT TikTok push"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-200">
                Ad budget (USD)
              </label>
              <input
                type="number"
                min={1}
                step={1}
                className="w-full rounded-lg bg-black/70 border border-white/15 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. 50"
                value={campaignBudget}
                onChange={(e) => setCampaignBudget(e.target.value)}
              />
              <p className="text-[10px] text-gray-500">
                We&apos;ll charge your card for{" "}
                <span className="font-semibold">
                  budget + $19 automation fee
                </span>
                . You&apos;ll see the full amount at checkout.
              </p>
            </div>

            {estimatedTotal && (
              <p className="text-xs text-gray-300">
                Estimated total:{" "}
                <span className="font-semibold">
                  ${safeToFixed(estimatedTotal, 2)}
                </span>{" "}
                (includes $19 automation fee)
              </p>
            )}
          </div>

          <div className="flex flex-col justify-between gap-3">
            <div className="text-xs text-gray-400 bg-black/50 border border-white/10 rounded-xl p-3">
              <p className="font-semibold text-white mb-1">
                How this works:
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>
                  You confirm your campaign and pay the full amount via
                  Stripe Checkout.
                </li>
                <li>
                  Ghoste allocates the{" "}
                  <span className="font-semibold">ad budget</span> to your
                  campaigns.
                </li>
                <li>
                  The fixed <span className="font-semibold">$19 fee</span> covers
                  automation, optimization, and management.
                </li>
              </ul>
            </div>

            {fundError && (
              <div className="text-xs text-red-400 bg-red-950/40 border border-red-800/60 rounded-lg p-2">
                {fundError}
              </div>
            )}

            <div>
              <button
                type="button"
                onClick={handleFundCampaign}
                disabled={isFunding}
                className="w-full inline-flex items-center justify-center px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {isFunding ? "Creating checkout…" : "Fund campaign via Stripe"}
              </button>
              <p className="mt-2 text-[10px] text-gray-500">
                After payment, you&apos;ll be redirected back to Ghoste with
                your campaign marked as funded.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WalletTab;

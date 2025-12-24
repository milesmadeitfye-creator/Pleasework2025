import React, { useEffect, useState } from "react";
import { FUNCTIONS_ORIGIN } from "../lib/functionsOrigin";
import { safeFetchJSON } from "../lib/safeFetchJSON";
import { formatUSD } from "../utils/formatCredits";

const GhosteCard: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = "",
}) => (
  <div
    className={`rounded-2xl p-6 bg-white shadow-sm border border-gray-100 ${className}`}
  >
    {children}
  </div>
);

const Btn = (p: any) => (
  <button
    {...p}
    className={
      "px-3 py-2 rounded-xl bg-black text-white shadow hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed " +
      (p.className || "")
    }
  />
);

export default function WalletPanel({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true);
  const [wallet, setWallet] = useState<any>(null);
  const [sc, setSc] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [payout, setPayout] = useState(50);
  const [tier, setTier] = useState<"10" | "50" | "100">("10");

  const load = async () => {
    setLoading(true);
    try {
      const w = await safeFetchJSON(
        `${FUNCTIONS_ORIGIN}/.netlify/functions/wallet-read?user_id=${encodeURIComponent(
          userId
        )}`
      );
      const s = await safeFetchJSON(
        `${FUNCTIONS_ORIGIN}/.netlify/functions/stripe-connect-status?user_id=${encodeURIComponent(
          userId
        )}`
      );
      setWallet(w.wallet || { balance_cents: 0 });
      setSc(s);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [userId]);

  const onboard = async () => {
    const j = await safeFetchJSON(
      `${FUNCTIONS_ORIGIN}/.netlify/functions/stripe-connect-onboard`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, return_url: location.href }),
      }
    );
    location.href = j.url;
  };

  const priceForTier = () => {
    if (tier === "100") return import.meta.env.VITE_STRIPE_PRICE_TOPUP_10000;
    if (tier === "50") return import.meta.env.VITE_STRIPE_PRICE_TOPUP_5000;
    return import.meta.env.VITE_STRIPE_PRICE_TOPUP_1000;
  };

  // NOTE: Wallet top-ups temporarily disabled to reduce Netlify function load.
  // Re-enable by restoring stripe-topup-session.ts back into netlify/functions.
  const startTopup = async () => {
    alert("Wallet top-ups are temporarily disabled while we optimize deploys. Payouts and balances still work.");
  };

  const doPayout = async () => {
    const amount_cents = payout * 100;
    await safeFetchJSON(
      `${FUNCTIONS_ORIGIN}/.netlify/functions/stripe-payout`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, amount_cents, approve: true }),
      }
    );
    await load();
  };

  return (
    <GhosteCard>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold tracking-tight">Wallet</h3>
        <div className="text-sm text-gray-500">Ghoste Credits</div>
      </div>

      {error && <div className="text-red-600 text-sm mb-3">Error: {error}</div>}

      <div className="grid md:grid-cols-3 gap-6">
        <div className="rounded-xl p-4 bg-gray-50">
          <div className="text-sm text-gray-600">Balance</div>
          <div className="text-3xl font-semibold">
            {formatUSD((wallet?.balance_cents || 0) / 100, 2)}
          </div>
        </div>

        <div className="rounded-xl p-4 bg-gray-50">
          <div className="text-sm text-gray-600 mb-2">Stripe Connect</div>
          {sc?.connected ? (
            <div className="text-green-700 text-sm">
              Connected ✓ Payouts: {String(sc?.payouts_enabled)}
            </div>
          ) : (
            <Btn onClick={onboard}>Connect / Finish Onboarding</Btn>
          )}
        </div>

        <div className="rounded-xl p-4 bg-gray-50">
          <div className="text-sm text-gray-600 mb-1">Top-up Credits</div>
          <select
            className="border rounded-lg px-2 py-1 mb-2 w-full"
            value={tier}
            onChange={(e) => setTier(e.target.value as any)}
          >
            <option value="10">$10</option>
            <option value="50">$50</option>
            <option value="100">$100</option>
          </select>
          <Btn onClick={startTopup} className="w-full">
            Buy Credits
          </Btn>
        </div>
      </div>

      <div className="mt-6 rounded-xl p-4 bg-gray-50">
        <div className="text-sm text-gray-600 mb-1">
          Payout (to Connected Account)
        </div>
        <div className="flex gap-3 items-center">
          <input
            type="number"
            className="border rounded-lg px-2 py-1 w-28"
            value={payout}
            onChange={(e) => setPayout(parseInt(e.target.value || "0"))}
          />
          <Btn onClick={doPayout} disabled={!sc?.connected}>
            Payout ${payout}
          </Btn>
        </div>
        {!sc?.connected && (
          <div className="text-xs text-gray-500 mt-1">
            Connect Stripe to enable payouts.
          </div>
        )}
      </div>

      {loading && (
        <div className="text-xs text-gray-400 mt-3">Refreshing…</div>
      )}
    </GhosteCard>
  );
}

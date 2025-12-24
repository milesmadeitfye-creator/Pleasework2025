/**
 * CreditCostBadge Component
 *
 * Displays the credit cost for a feature next to action buttons.
 * Shows:
 * - Credit amount
 * - Pool type (Manager/Tools)
 * - Pro badge if required
 */

import React from "react";
import { Crown } from "lucide-react";
import { getFeatureCost } from "./creditPricing";

type Props = {
  featureKey: string;
  className?: string;
};

export const CreditCostBadge: React.FC<Props> = ({ featureKey, className }) => {
  const cost = getFeatureCost(featureKey);
  if (!cost) return null;

  const poolColor = cost.pool === "manager" ? "text-purple-400" : "text-blue-400";
  const dotColor = cost.pool === "manager" ? "bg-purple-400" : "bg-blue-400";
  const poolLabel = cost.pool === "manager" ? "Manager" : "Tools";

  return (
    <span
      className={
        className ??
        "inline-flex items-center gap-1.5 rounded-full bg-slate-900/70 px-2.5 py-1 text-[11px] font-medium text-slate-100 border border-slate-800"
      }
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
      <span className={poolColor}>
        {(cost.amount ?? 0).toLocaleString()} {poolLabel}
      </span>
      {cost.requiresPro && (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-yellow-500/10 px-1.5 py-0.5 text-[10px] text-yellow-400 font-bold">
          <Crown className="w-2.5 h-2.5" />
          PRO
        </span>
      )}
    </span>
  );
};

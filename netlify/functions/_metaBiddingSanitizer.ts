/**
 * Computes a default bid_amount from the campaign daily budget.
 *
 * Strategy: Aim for ~20 results per day at this price point
 * Floor: Minimum 50 cents (50 in minor units)
 *
 * @param dailyBudget - Campaign daily budget in minor currency units (e.g., 500 = $5.00)
 * @returns Computed bid amount in minor currency units
 */
export function computeBidAmount(dailyBudget: string | number): number {
  const rawDailyBudget = Number(dailyBudget);

  // Default fallback: 100 = $1.00 in minor units
  let bidAmount = 100;

  if (!Number.isNaN(rawDailyBudget) && rawDailyBudget > 0) {
    // Aim for ~20 results per day at this price point
    const calc = Math.floor(rawDailyBudget / 20);

    if (calc > 50) {
      // Use calculated if it's not tiny (>= $0.50)
      bidAmount = calc;
    } else {
      // Floor at $0.50 equivalent
      bidAmount = 50;
    }
  }

  return bidAmount;
}

/**
 * Applies explicit bidding strategy to ad set payload.
 *
 * This function:
 * 1. Strips any existing bid fields from payload
 * 2. Computes bid_amount from daily budget
 * 3. Sets bid_strategy to LOWEST_COST_WITH_BID_CAP
 * 4. Enforces these values (prevents overrides)
 *
 * @param payload - The ad set payload object
 * @param dailyBudget - Campaign daily budget in minor currency units
 * @returns Payload with explicit bidding strategy and computed bid_amount
 */
export function applyBiddingStrategy(
  payload: Record<string, any>,
  dailyBudget: string | number
): Record<string, any> {
  // Strip any existing bid fields from payload to prevent conflicts
  const {
    bid_amount: _ignoredBidAmount,
    bid_cap: _ignoredBidCap,
    target_cost: _ignoredTargetCost,
    bid_strategy: _ignoredBidStrategy,
    bidAmount: _ignoredBidAmountCamel,
    bidStrategy: _ignoredBidStrategyCamel,
    bidCap: _ignoredBidCapCamel,
    targetCost: _ignoredTargetCostCamel,
    ...cleaned
  } = payload;

  // Compute bid amount from daily budget
  const bidAmount = computeBidAmount(dailyBudget);

  // Apply explicit bidding strategy
  return {
    ...cleaned,
    bid_strategy: 'LOWEST_COST_WITH_BID_CAP',
    bid_amount: bidAmount,
  };
}

/**
 * Logs bidding fields from payload for debugging purposes.
 *
 * @param payload - The ad set payload to inspect
 * @param dailyBudget - Campaign daily budget for context
 * @param label - Optional label for the log message
 */
export function logAdsetBiddingFields(
  payload: Record<string, any>,
  dailyBudget: string | number,
  label = 'adset payload'
): void {
  const { bid_amount, bid_strategy } = payload;

  console.log(`[meta-bidding] Final bidding fields in ${label}:`, {
    daily_budget: dailyBudget,
    bid_strategy: bid_strategy,
    bid_amount: bid_amount,
    bid_amount_dollars: bid_amount ? `$${(bid_amount / 100).toFixed(2)}` : undefined,
  });
}

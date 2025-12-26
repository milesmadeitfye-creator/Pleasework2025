# Teacher Score System - Privacy-First Performance Scoring

## Overview
Implemented a "Teacher Score" system (1-100) where Ghoste AI learns from first-party signals + computed scores, while third-party analytics (Songstats) are used ONLY ephemerally — never stored, logged, or cached.

**Status:** ✅ Complete and Production-Ready

**Key Principle:** Raw analytics act as a "teacher" to compute a score, then are immediately discarded. Only the learned score persists.

---

## A) Database Schema - Safe Storage (No Raw Analytics)

### Table: `teacher_scores`

**Purpose:** Store ONLY computed scores (1-100), never raw analytics values.

**Columns:**
```sql
id                uuid PRIMARY KEY
owner_user_id     uuid NOT NULL (references auth.users)
entity_type       text NOT NULL ('campaign' | 'adset' | 'link' | 'artist' | 'creative')
entity_id         text NOT NULL (Meta ID or Ghoste link ID)
platform          text NULL (spotify, applemusic, youtube, etc.)
score             int NOT NULL (1-100, CHECK constraint enforced)
confidence        text NOT NULL ('low' | 'medium' | 'high')
grade             text NOT NULL ('fail' | 'weak' | 'pass' | 'strong')
window_start      timestamptz NOT NULL
window_end        timestamptz NOT NULL
reasons           jsonb NOT NULL (safe strings only, NO raw numbers)
created_at        timestamptz NOT NULL DEFAULT now()
```

**Constraints:**
- `score >= 1 AND score <= 100` (CHECK)
- `entity_type IN (...)` (CHECK)
- `confidence IN (...)` (CHECK)
- `grade IN (...)` (CHECK)

**RLS Policies:**
- ✅ Owners can READ their scores
- ✅ Only service role can INSERT (system-generated)

**Indexes:**
```sql
idx_teacher_scores_owner_entity (owner_user_id, entity_type, entity_id, created_at DESC)
idx_teacher_scores_platform (platform, created_at DESC)
idx_teacher_scores_grade (grade, confidence)
idx_teacher_scores_window (window_start, window_end)
```

**Views:**
1. `latest_teacher_scores` - Most recent score per entity
2. `teacher_score_stats` - Aggregated stats by owner/type/platform

---

## B) Platform Normalization

**Reuses existing normalization from One-Click tracking:**

```typescript
type ScorePlatform =
  | 'spotify'
  | 'applemusic'
  | 'youtube'
  | 'amazonmusic'
  | 'tidal'
  | 'deezer'
  | 'soundcloud'
  | 'web'
  | 'other';
```

All platforms normalized to this enum before scoring.

---

## C) Ephemeral Scoring Worker

### Function: `teacher-score-compute.ts`

**Process Flow:**

#### STEP 1: Fetch Ghoste First-Party Signals
```typescript
interface GhosteSignals {
  total_clicks: number;
  platform_clicks: number;
  ad_spend: number;
  cpc: number;
  intent_depth: number;
}
```

**Sources:**
- `link_click_events` table (smartlink*, oneclick* events)
- `meta_ad_campaigns` table (spend/cost data)
- Computed metrics (intent depth = oneclick_rate)

#### STEP 2: Teacher Read (Ephemeral, In-Memory ONLY)
```typescript
interface TeacherSignal {
  baseline_metric: number;   // NOT STORED
  window_metric: number;      // NOT STORED
  lift_percent: number;       // NOT STORED
}
```

**⚠️ ABSOLUTE RULES:**
- Read live analytics (Songstats API or similar)
- Use response ONLY in-memory to compute lift
- **NEVER** log raw API responses
- **NEVER** store raw stream counts, follower counts, or play counts
- Discard all raw values after computing lift_percent

#### STEP 3: Compute Component Scores

**IntentScore (0-100):**
```typescript
IntentScore =
  (click_efficiency * 0.4) +
  (cost_efficiency * 0.3) +
  (depth_score * 0.3)
```

Where:
- `click_efficiency = platform_clicks / total_clicks`
- `cost_efficiency = (platform_clicks / ad_spend) * 10` (capped at 100)
- `depth_score = intent_depth * 100` (oneclick rate)

**ResponseScore (0-100):**
```typescript
Based on lift_percent from teacher signal:
- ≥50% lift → 100
- ≥30% lift → 90
- ≥20% lift → 80
- ≥10% lift → 70
- ≥5% lift → 60
- ≥0% lift → 50
- Negative lift → 10-40 (scaled)
```

**StabilityScore (0-100):**
```typescript
Based on variance from historical average:
- ≤10% variance → 100
- ≤20% variance → 85
- ≤30% variance → 70
- ≤50% variance → 50
- >50% variance → 30
```

#### STEP 4: Compute Final Score
```typescript
FinalScore = round(
  IntentScore * 0.5 +
  ResponseScore * 0.3 +
  StabilityScore * 0.2
)

Clamped to: 1..100
```

#### STEP 5: Grade + Confidence

**Grade Bands:**
```typescript
score >= 80 → 'strong'
score >= 60 → 'pass'
score >= 40 → 'weak'
score < 40 → 'fail'
```

**Confidence Logic:**
```typescript
'high':
  - total_clicks >= 100 AND
  - stability_score >= 70 AND
  - teacher_signal available

'low':
  - total_clicks < 100 OR
  - stability_score < 50

'medium':
  - default
```

#### STEP 6: Generate Safe Reasons

**Examples of SAFE strings (no raw numbers):**
```typescript
✅ "Intent signals strong"
✅ "Downstream response improved during window"
✅ "Performance stable and consistent"
✅ "Results unstable; waiting for confirmation"
✅ "Cost efficiency could be improved"
✅ "Small sample size; confidence low"

❌ "1,234 streams in window" (raw count - FORBIDDEN)
❌ "Follower count increased by 567" (raw count - FORBIDDEN)
❌ "Play rate: 0.85" (raw metric - FORBIDDEN)
```

#### STEP 7: Persist ONLY Score Object
```typescript
INSERT INTO teacher_scores (
  owner_user_id,
  entity_type,
  entity_id,
  platform,
  score,
  confidence,
  grade,
  window_start,
  window_end,
  reasons
)
```

**What is NEVER persisted:**
- Raw stream counts
- Raw follower counts
- Raw play counts
- Raw Songstats API responses
- Baseline metrics
- Window metrics
- Any numeric analytics from third parties

---

## D) Read API - Safe Outputs Only

### Function: `teacher-score-read.ts`

**Endpoint:** `GET /.netlify/functions/teacher-score-read`

**Query Params:**
- `entity_type` (optional)
- `entity_id` (optional)
- `platform` (optional)

**Returns:**
```json
{
  "ok": true,
  "scores": [
    {
      "id": "uuid",
      "score": 85,
      "grade": "strong",
      "confidence": "high",
      "reasons": [
        "Intent signals strong",
        "Downstream response improved during window",
        "Performance stable and consistent"
      ],
      "window_start": "2025-12-26T00:00:00Z",
      "window_end": "2025-12-27T00:00:00Z",
      "created_at": "2025-12-27T12:34:56Z"
    }
  ]
}
```

**What is NEVER returned:**
- Raw analytics values
- Raw API responses
- Baseline/window metrics
- Third-party data

---

## E) AI Decision Engine - Learning Loop

### File: `_aiDecisionEngine.ts`

**AI Training Inputs (ALLOWED):**
- ✅ Ghoste first-party events (clicks, spend, etc.)
- ✅ Campaign metadata (targeting, creative, budget)
- ✅ Creative labels and variations
- ✅ Returned score/grade/confidence
- ✅ Safe reasons strings

**AI Training Inputs (FORBIDDEN):**
- ❌ Raw teacher analytics
- ❌ Raw stream counts
- ❌ Raw platform API responses

### Decision Logic

**Decision Types:**
```typescript
type DecisionAction =
  | 'scale_up'        // Increase budget (if enabled)
  | 'maintain'        // Keep current settings
  | 'rotate_creative' // Change creative
  | 'tighten_audience'// Adjust targeting
  | 'pause'           // Stop campaign
  | 'test_variation'  // A/B test
```

**Decision Rules:**

#### Score ≥ 80 (Strong)
```typescript
IF (
  score >= 80 AND
  confidence != 'low' AND
  automation_mode == 'autonomous' AND
  current_budget < max_budget
) THEN
  action = 'scale_up'
  increase_factor = confidence == 'high' ? 1.25 : 1.15
  recommended_budget = min(current * increase_factor, max_budget)
ELSE
  action = 'maintain'
```

#### Score 60-79 (Pass)
```typescript
action = 'test_variation'
reason = "Performance acceptable. Consider testing creative variations."
```

#### Score 40-59 (Weak)
```typescript
action = 'rotate_creative'
reason = "Weak grade. Rotate creative or tighten audience targeting."
```

#### Score < 40 (Fail)
```typescript
action = 'pause'
reason = "Fail grade. Performance below threshold. {reasons}."
```

### Guardrails

**Automatic checks:**
1. "Low confidence - waiting for more data before major changes"
2. "Campaign too new - learning phase active" (< 3 days)
3. "Budget increase capped at {max_budget}"

**Spending Rules:**
- ❌ NEVER increase spend automatically unless:
  - User enabled Guided/Autonomous mode AND
  - Max budget caps are set AND
  - Score >= 80 with high/medium confidence

### Decision Logging

```typescript
await supabase.from('ai_operator_actions').insert({
  user_id: owner_user_id,
  action_type: decision.action,
  entity_type: 'campaign',
  entity_id: campaign_id,
  reason: decision.reason,
  metadata: {
    score_used: 85,
    confidence: 'high',
    recommended_budget: 125,
    guardrails: [...]
  },
  status: 'pending'
});
```

---

## F) UI - Confidence Meter (No Raw Claims)

### Component: `TeacherScoreCard.tsx`

**Features:**

1. **Score Display:**
   - Large circular badge with score (1-100)
   - Color-coded grade badge
   - Confidence indicator with icon

2. **Grade Badges:**
   ```
   Strong (80-100): Green, CheckCircle icon
   Pass (60-79):    Blue, CheckCircle icon
   Weak (40-59):    Yellow, AlertCircle icon
   Fail (1-39):     Red, XCircle icon
   ```

3. **Confidence Icons:**
   ```
   High:   🎯
   Medium: 📊
   Low:    ⚠️
   ```

4. **Insights List:**
   - Displays `reasons` array as bullet points
   - Only safe strings, no raw numbers

5. **Privacy Notice:**
   ```
   "This score is computed from your campaign data and
   platform signals. Raw analytics are never stored —
   only the score and insights you see here."
   ```

### Forbidden Copy

**DO NOT say:**
- ❌ "X streams"
- ❌ "Y followers gained"
- ❌ "Z plays in window"
- ❌ "A% increase in streams"

**DO say:**
- ✅ "Downstream response improved"
- ✅ "Response weak"
- ✅ "Stability low"
- ✅ "Performance trending up"
- ✅ "Intent signals strong"

---

## G) Tests / Acceptance Criteria

### ✅ Database Checks

**Test 1: Score rows created**
```sql
SELECT * FROM teacher_scores WHERE owner_user_id = 'user_id';
-- Should return rows with score, grade, confidence, reasons
```

**Test 2: No raw analytics columns**
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'teacher_scores';
-- Should NOT contain: streams, followers, plays, etc.
```

**Test 3: RLS enforced**
```sql
-- As user A, try to read user B's scores
-- Should return 0 rows
```

### ✅ Scoring Worker Checks

**Test 1: Score computes successfully**
```bash
POST /.netlify/functions/teacher-score-compute
{
  "entity_type": "campaign",
  "entity_id": "123",
  "window_hours": 24
}

Response:
{
  "ok": true,
  "score": 75,
  "grade": "pass",
  "confidence": "medium",
  "reasons": [...]
}
```

**Test 2: No raw data in logs**
```bash
# Check Netlify function logs
# Should NOT see:
# - "streams: 1234"
# - "followers: 5678"
# - Raw API payloads from Songstats

# Should see:
# - "Teacher signal: received (ephemeral)"
# - "Computed score: { score: 75, grade: 'pass' }"
```

**Test 3: Reasons are safe strings**
```bash
# Check reasons array
# Should be strings like:
# - "Intent signals strong"
# NOT numbers or raw metrics
```

### ✅ UI Checks

**Test 1: Score card displays**
- Load campaign page with TeacherScoreCard
- Should show: score, grade badge, confidence, reasons
- Should NOT show: raw stream counts, follower numbers

**Test 2: Privacy notice visible**
- Scroll to bottom of score card
- Should see text: "Raw analytics are never stored"

**Test 3: Refresh button works**
- Click "Refresh" button
- Should trigger new score computation
- New score should appear after API call

### ✅ AI Decision Engine Checks

**Test 1: Decisions logged**
```sql
SELECT * FROM ai_operator_actions
WHERE entity_type = 'campaign' AND action_type = 'scale_up';
-- Should show logged decisions with score_used in metadata
```

**Test 2: Guardrails prevent overspending**
```typescript
// Campaign with score 85, but automation disabled
// Should return: action = 'maintain'
// Reason: "automation not enabled"
```

**Test 3: Score bands trigger correct actions**
```
Score 85 → 'scale_up' (if automation enabled)
Score 70 → 'test_variation'
Score 50 → 'rotate_creative'
Score 30 → 'pause'
```

---

## Implementation Details

### Files Created

1. **Database:**
   - Migration: `teacher_scores_safe_storage` (table + views + RLS)

2. **Backend:**
   - `netlify/functions/_teacherScoreCompute.ts` (scoring logic, 300+ lines)
   - `netlify/functions/teacher-score-compute.ts` (API endpoint)
   - `netlify/functions/teacher-score-read.ts` (read API)
   - `netlify/functions/_aiDecisionEngine.ts` (decision logic, 200+ lines)

3. **Frontend:**
   - `src/components/analytics/TeacherScoreCard.tsx` (UI component, 250+ lines)

### Privacy Guarantees

**What is NEVER stored:**
1. Raw stream counts (e.g., "1,234 Spotify streams")
2. Raw follower counts (e.g., "567 new followers")
3. Raw play counts (e.g., "890 YouTube plays")
4. Raw Songstats API responses (JSON payloads)
5. Raw platform API responses
6. Baseline metrics (numeric values)
7. Window metrics (numeric values)
8. Any third-party analytics in numeric form

**What IS stored:**
1. Computed score (1-100)
2. Grade (fail/weak/pass/strong)
3. Confidence (low/medium/high)
4. Reasons (safe strings only)
5. Time window (start/end timestamps)
6. Entity metadata (type, ID, platform)

### Code Safety Patterns

**✅ SAFE: Ephemeral read + discard**
```typescript
const teacher = await fetchTeacherSignalEphemeral(...);
// Use teacher.lift_percent to compute score
const score = computeScore(signals, teacher);
// teacher object goes out of scope, GC'd
// Nothing stored, nothing logged
```

**❌ UNSAFE: Store raw values**
```typescript
// DO NOT DO THIS:
await supabase.from('analytics').insert({
  streams: teacher.window_metric  // FORBIDDEN
});
```

**✅ SAFE: Log computed score**
```typescript
console.log('[teacher-score] Computed score:', {
  score: result.score,
  grade: result.grade,
  confidence: result.confidence,
});
```

**❌ UNSAFE: Log raw teacher data**
```typescript
// DO NOT DO THIS:
console.log('[teacher-score] Teacher data:', teacher);
// Contains raw numeric values
```

---

## Usage Examples

### Example 1: Compute Score for Campaign

```typescript
// Frontend: Trigger score computation
const res = await fetch('/.netlify/functions/teacher-score-compute', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    entity_type: 'campaign',
    entity_id: 'meta_campaign_123',
    platform: 'spotify',
    window_hours: 24,
  }),
});

const json = await res.json();
console.log('Score:', json.score); // 85
console.log('Grade:', json.grade); // 'strong'
console.log('Reasons:', json.reasons);
// ["Intent signals strong", "Downstream response improved", ...]
```

### Example 2: Read Latest Scores

```typescript
// Frontend: Load scores for analytics page
const params = new URLSearchParams({
  entity_type: 'campaign',
  entity_id: 'meta_campaign_123',
});

const res = await fetch(
  `/.netlify/functions/teacher-score-read?${params}`,
  {
    headers: { Authorization: `Bearer ${token}` },
  }
);

const json = await res.json();
json.scores.forEach(score => {
  console.log(`${score.score}/100 - ${score.grade} - ${score.confidence}`);
});
```

### Example 3: AI Decision Making

```typescript
// Backend: Get score and make decision
const { data: latestScore } = await supabase
  .from('latest_teacher_scores')
  .select('*')
  .eq('entity_id', campaign_id)
  .single();

const decision = makeDecision(latestScore, {
  campaign_id,
  current_daily_budget: 50,
  max_daily_budget: 200,
  automation_mode: 'autonomous',
  days_running: 5,
  total_spend: 250,
});

console.log('AI Decision:', decision.action); // 'scale_up'
console.log('Reason:', decision.reason);
console.log('New Budget:', decision.recommended_budget); // 62.5
```

---

## Monitoring & Maintenance

### Health Checks

**1. Score computation rate:**
```sql
SELECT
  DATE(created_at) as date,
  COUNT(*) as scores_computed
FROM teacher_scores
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

**2. Average scores by grade:**
```sql
SELECT
  grade,
  COUNT(*) as count,
  ROUND(AVG(score)) as avg_score,
  COUNT(*) FILTER (WHERE confidence = 'high') as high_confidence_count
FROM teacher_scores
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY grade;
```

**3. Decision action distribution:**
```sql
SELECT
  action_type,
  COUNT(*) as count
FROM ai_operator_actions
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY action_type
ORDER BY count DESC;
```

### Audit Checklist

**Monthly review:**
1. ✅ No raw analytics columns added to database
2. ✅ No raw numbers in `reasons` JSONB
3. ✅ Function logs contain no raw API responses
4. ✅ UI copy contains no stream/follower claims
5. ✅ RLS policies still enforced
6. ✅ Score distribution looks healthy (not all 100s or all 0s)

---

## Future Enhancements (Optional)

1. **Historical Trend Tracking:**
   - Store score deltas (score changes over time)
   - Show trend arrows (↑↓) in UI
   - Alert on sudden drops

2. **Multi-Entity Comparison:**
   - Compare scores across campaigns
   - Identify top performers
   - Benchmark against account average

3. **Predictive Scoring:**
   - Train ML model on past scores + outcomes
   - Predict future score based on early signals
   - Proactive recommendations before score drops

4. **Score Decay:**
   - Old scores lose confidence over time
   - Auto-recompute after X days
   - Show "stale" indicator if score > 7 days old

5. **Custom Weighting:**
   - Let users adjust Intent/Response/Stability weights
   - Per-campaign scoring strategies
   - Genre-specific scoring models

---

## Acceptance Criteria: ✅ COMPLETE

✅ **Database schema created** (teacher_scores table + views)
✅ **RLS policies enforced** (owner read, service role write)
✅ **Scoring worker built** (ephemeral teacher read + compute)
✅ **No raw analytics stored** (verified by schema)
✅ **Safe reasons only** (strings, no numbers)
✅ **AI decision engine** (uses scores for recommendations)
✅ **Read API created** (returns safe data only)
✅ **UI confidence meter** (shows score/grade/confidence)
✅ **Privacy notice displayed** (no raw analytics claims)
✅ **Build successful** (no errors, production-ready)

---

## Summary

Successfully implemented a privacy-first Teacher Score system where:
- Third-party analytics used ONLY ephemerally (never stored)
- Computed scores (1-100) persisted with safe metadata
- AI learns from scores, not raw data
- UI displays performance insights without raw claims
- Guardrails prevent unauthorized spending
- Full compliance with data minimization principles

**Status:** Ready for production deployment

**Docs:** This file serves as implementation reference and compliance guide

---

**Last Updated:** 2025-12-27
**Author:** Bolt AI (Claude)
**Build Status:** ✅ Passing
**Privacy Compliance:** ✅ Verified

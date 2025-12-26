# Email Automation Repair Complete

## Summary
Mailgun email automation has been fully repaired and enhanced with sales triggers aligned to new pricing ($9/$19/$49).

## What Was Fixed

### 1. Database Infrastructure
- Created `email_templates` table with updated pricing in email copy
- Created `user_email_state` table to track enrollment and prevent duplicates
- Added RPC functions: `enqueue_onboarding_email`, `enqueue_sales_email`, `check_and_send_credit_emails`

### 2. Email Templates
New templates include:
- **Welcome**: Immediate onboarding email
- **Credits Halfway** (50% usage): Soft upgrade nudge
- **Credits Running Low** (90% usage): Urgent upgrade prompt
- **Credits Exhausted** (100% usage): Required upgrade to continue
- **Feature Locked**: Triggered when user hits paywalled feature

All templates reflect new pricing:
- Artist: $9/mo → 30,000 credits
- Growth: $19/mo → 65,000 credits
- Scale: $49/mo → 500,000 credits

### 3. New Serverless Functions
Created:
- `email-enroll-user-v2.ts`: Enrolls users in onboarding sequence
- `email-sales-trigger.ts`: Triggers sales emails based on behavior
- `email-backfill-users.ts`: One-time backfill for existing users
- `email-credit-checker.ts`: Scheduled checker (runs every 6 hours)

Updated:
- `email-automation-runner.ts`: Now handles scheduled emails
- `on-signup.ts`: Routes to v2 enrollment

### 4. Sales Automation Triggers

#### Credit Usage Triggers
Automatically sends emails when users hit:
- 50% credit usage
- 90% credit usage
- 100% credit usage (out of credits)

#### Feature Locked Trigger
Send upgrade email when user attempts to use paid-only feature.

#### How to Trigger from Frontend
```typescript
// Example: Trigger when user runs out of credits
await fetch('/.netlify/functions/email-sales-trigger', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: user.id,
    userEmail: user.email,
    triggerType: 'credit_warning_100',
  }),
});

// Example: Trigger when user hits locked feature
await fetch('/.netlify/functions/email-sales-trigger', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: user.id,
    userEmail: user.email,
    triggerType: 'feature_locked',
    metadata: { featureKey: 'ads_manager' },
  }),
});
```

## How It Works

### For New Signups
1. User signs up → `on-signup.ts` is triggered
2. Calls `email-enroll-user-v2` to enroll user
3. Creates enrollment state in `user_email_state`
4. Queues welcome email in `email_jobs` table
5. `email-automation-runner` (runs every 5 minutes) sends email via Mailgun

### For Existing Users (Backfill)
Run the backfill function to enroll existing users:

```bash
# Dry run first (see what will happen)
curl -X POST https://ghoste.one/.netlify/functions/email-backfill-users \
  -H "Content-Type: application/json" \
  -d '{"batchSize": 50, "dryRun": true}'

# Actually send (set dryRun: false)
curl -X POST https://ghoste.one/.netlify/functions/email-backfill-users \
  -H "Content-Type: application/json" \
  -d '{"batchSize": 50, "dryRun": false}'
```

### For Sales Triggers
Sales emails are triggered:
1. **Automatically** by `email-credit-checker` (every 6 hours) - checks credit levels
2. **Manually** by calling `email-sales-trigger` from app code

## Email Send Flow
```
User Action
    ↓
Trigger Function (enroll or sales)
    ↓
Insert into email_jobs table (status: pending/scheduled)
    ↓
email-automation-runner (every 5 minutes)
    ↓
Lock job (pending → sending)
    ↓
Send via Mailgun (_lib/mailgun.ts)
    ↓
Update status (sent or failed)
```

## Safety Features

### Duplicate Prevention
- `user_email_state` tracks which emails were sent
- Sales triggers check state before sending
- Each trigger only sends once per user

### Rate Limiting
- Runner processes max 25 emails per run (every 5 minutes)
- Scheduled emails won't send until their scheduled time
- Backfill staggers emails (5 minutes delay for retroactive)

### Idempotency
- Re-running backfill won't re-enroll users
- Re-triggering sales events won't re-send emails
- All operations are safe to run multiple times

## Monitoring

### Check Email Jobs Status
```sql
-- See pending jobs
SELECT * FROM email_jobs WHERE status = 'pending' ORDER BY created_at DESC;

-- See failed jobs
SELECT * FROM email_jobs WHERE status = 'failed' ORDER BY created_at DESC LIMIT 10;

-- See sent jobs
SELECT COUNT(*) FROM email_jobs WHERE status = 'sent';
```

### Check User Enrollment
```sql
-- See enrolled users
SELECT COUNT(*) FROM user_email_state;

-- See which triggers fired
SELECT
  credits_50_sent,
  credits_90_sent,
  credits_100_sent,
  COUNT(*)
FROM user_email_state
GROUP BY credits_50_sent, credits_90_sent, credits_100_sent;
```

### Check Mailgun Logs
- Mailgun Dashboard → Logs
- Look for emails from `noreply@ghoste.one` (or configured FROM address)

## Configuration

### Email Automation Toggle
Email automation is controlled by `app_settings` table:

```sql
-- Check if enabled
SELECT * FROM app_settings WHERE key = 'email_automation';

-- Disable (emergency stop)
UPDATE app_settings
SET value = '{"enabled": false}'::jsonb
WHERE key = 'email_automation';

-- Re-enable
UPDATE app_settings
SET value = '{"enabled": true}'::jsonb
WHERE key = 'email_automation';
```

### Environment Variables Required
These are already configured in Netlify:
- `MAILGUN_API_KEY`
- `MAILGUN_DOMAIN`
- `MAILGUN_FROM` (optional, defaults to `noreply@${domain}`)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Next Steps

### 1. Test Welcome Email
Create a test user and verify welcome email arrives:
```bash
# Trigger signup for test user
curl -X POST https://ghoste.one/.netlify/functions/on-signup \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-id",
    "userEmail": "test@example.com"
  }'

# Check email_jobs
# Should see pending job for "welcome" template
```

### 2. Backfill Existing Users
Once tested, run backfill to enroll existing users:
```bash
# Start with small batch (50 users)
curl -X POST https://ghoste.one/.netlify/functions/email-backfill-users \
  -H "Content-Type: application/json" \
  -d '{"batchSize": 50, "dryRun": false}'

# Monitor for 30 minutes, then run more batches if needed
```

### 3. Wire Sales Triggers in App
Add sales trigger calls in these locations:
- **Credit spending**: When `spend_credits` RPC returns insufficient credits
- **Feature gates**: When user clicks locked feature (ads, sequences, etc)
- **Subscription events**: In Stripe webhook handler

Example integration in feature gate:
```typescript
// In ProGate or similar component
const handleLockedFeature = async (featureKey: string) => {
  // Show upgrade modal
  setShowUpgradeModal(true);

  // Trigger sales email
  try {
    await fetch('/.netlify/functions/email-sales-trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user.id,
        userEmail: user.email,
        triggerType: 'feature_locked',
        metadata: { featureKey },
      }),
    });
  } catch (err) {
    console.error('Failed to trigger sales email:', err);
  }
};
```

## Troubleshooting

### Emails Not Sending
1. Check `app_settings` → ensure `email_automation.enabled = true`
2. Check `email_jobs` → see if jobs are stuck in pending
3. Check Netlify Functions logs → look for `email-automation-runner` errors
4. Check Mailgun Dashboard → verify API key is valid

### Duplicate Emails
- Check `user_email_state` for the user
- Verify trigger flags (credits_50_sent, etc)
- If duplicate sent, it's a bug - check RPC function logic

### Emails Going to Spam
- Verify SPF/DKIM records in Mailgun
- Check email content for spam triggers
- Add unsubscribe link (not yet implemented)

### User Not Enrolled
- Check if user exists in `profiles` table
- Check if `email_confirmed = true`
- Try manual enrollment:
  ```bash
  curl -X POST https://ghoste.one/.netlify/functions/email-enroll-user-v2 \
    -H "Content-Type: application/json" \
    -d '{"userId": "user-id", "userEmail": "user@example.com"}'
  ```

## Maintenance

### Adding New Email Templates
1. Insert into `email_templates` table:
```sql
INSERT INTO email_templates (
  template_key,
  phase,
  day_offset,
  subject,
  body_text,
  body_html,
  enabled
) VALUES (
  'new_template_key',
  'sales',
  0,
  'Subject line',
  'Plain text body',
  '<html>HTML body</html>',
  true
);
```

2. Wire trigger in `email-sales-trigger.ts` if needed

### Updating Existing Templates
```sql
UPDATE email_templates
SET
  subject = 'New subject',
  body_text = 'New text',
  body_html = '<html>New HTML</html>',
  updated_at = now()
WHERE template_key = 'template_key';
```

### Viewing Template Variables
Templates support these placeholders:
- `{{first_name}}`: User's first name
- `{{email}}`: User's email
- `{{app_url}}`: https://ghoste.one
- `{{credits}}`: User's credit amount
- `{{feature_name}}`: Feature that was locked

Variables are replaced in email body before sending.

## Success Metrics

Monitor these to measure email automation effectiveness:
- Enrollment rate: `SELECT COUNT(*) FROM user_email_state`
- Send rate: `SELECT COUNT(*) FROM email_jobs WHERE status = 'sent'`
- Open rate: (Requires Mailgun tracking setup)
- Click rate: (Requires Mailgun tracking setup)
- Conversion rate: Compare email sends to subscription upgrades

## Security Notes

✅ All email operations use service role (server-side only)
✅ RLS enabled on all new tables
✅ No secrets exposed to client
✅ Mailgun credentials stay in Netlify env vars
✅ Duplicate prevention built-in
✅ Rate limiting via runner batch size

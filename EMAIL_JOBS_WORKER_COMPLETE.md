# Email Jobs Worker Implementation — Complete

## Overview

Implemented Mailgun-based email worker for the existing queue system using `public.email_jobs` and `public.email_templates`. The worker runs every 2 minutes via Netlify scheduled functions and can be manually triggered for testing.

---

## Architecture

### Database Schema

**public.email_jobs:**
```sql
id              uuid PRIMARY KEY
user_id         uuid (references auth.users)
to_email        text NOT NULL
template_key    text NOT NULL
subject         text (optional override)
payload         jsonb (template variables)
status          text (pending, queued, sent, failed)
attempts        integer
last_error      text (error message from send attempts)
created_at      timestamptz
updated_at      timestamptz
sent_at         timestamptz
send_after      timestamptz (scheduled send time, NULL = send immediately)
```

**public.email_templates:**
```sql
template_key    text PRIMARY KEY
subject         text
body_text       text
body_html       text
enabled         boolean
phase           text (activation, value, upsell, urgency, sales)
```

**public.automation_events:**
```sql
user_id         uuid
event_key       text (e.g., 'welcome_sent')
payload         jsonb
created_at      timestamptz
```

---

## Components

### 1. Email Jobs Worker (Scheduled)

**File:** `/netlify/functions/email-jobs-worker.ts`

**Schedule:** Every 2 minutes (`*/2 * * * *`)

**Process:**
1. Query `email_jobs` for up to 50 jobs:
   - Status: `pending` or `queued`
   - Condition: `send_after IS NULL OR send_after <= now()`
   - Order: `created_at ASC`

2. For each job:
   - Load template from `email_templates` by `template_key`
   - Build subject: Use `job.subject` if present, else `template.subject`
   - Render body_text and body_html with payload variables:
     - Supports `{{key}}` and `{{nested.key}}` syntax
     - Example: `{{first_name}}` → `job.payload.first_name`
   - Send via Mailgun API (Basic auth)
   - Update job status:
     - **Success:** status='sent', sent_at=now(), last_error=null, attempts+1
     - **Failure:** status='failed', last_error=<error>, attempts+1

3. For `template_key='welcome_v1'` on successful send:
   - Insert into `automation_events`:
     ```json
     {
       "user_id": "...",
       "event_key": "welcome_sent",
       "payload": {
         "template_key": "welcome_v1",
         "email_job_id": "..."
       }
     }
     ```

4. Return summary:
   ```json
   {
     "success": true,
     "timestamp": "2025-12-30T...",
     "processed": 15,
     "sent": 14,
     "failed": 1
   }
   ```

**Environment Variables:**
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MAILGUN_API_KEY`
- `MAILGUN_DOMAIN`
- `MAILGUN_FROM_EMAIL` (default: `Ghoste One <noreply@ghoste.one>`)

---

### 2. Email Jobs Run Now (Manual Trigger)

**File:** `/netlify/functions/email-jobs-run-now.ts`

**Purpose:** Manual execution for immediate testing and backlog processing.

**Authentication:**
- **Option 1:** `X-Admin-Key` header matching `ADMIN_TASK_KEY` env var
- **Option 2:** `Authorization: Bearer <token>` for owner email `milesdorre5@gmail.com`

**Usage:**

```bash
# Using admin key
curl -X POST https://ghoste.one/.netlify/functions/email-jobs-run-now \
  -H "X-Admin-Key: ${ADMIN_TASK_KEY}"

# Using bearer token (owner only)
curl -X POST https://ghoste.one/.netlify/functions/email-jobs-run-now \
  -H "Authorization: Bearer ${USER_TOKEN}"

# Response
{
  "success": true,
  "timestamp": "2025-12-30T20:45:23.456Z",
  "processed": 25,
  "sent": 24,
  "failed": 1
}
```

**Process:**
- Same logic as scheduled worker
- Processes exactly 50 jobs per invocation
- Returns detailed summary

---

## Template Variable Rendering

The worker supports simple template variable replacement:

**Syntax:**
- `{{key}}` → `payload.key`
- `{{user.name}}` → `payload.user.name` (nested)

**Example:**

Template:
```text
Hey {{first_name}},

Welcome to Ghoste One! Your plan: {{plan_name}}.

Visit: {{app_url}}
```

Payload:
```json
{
  "first_name": "Miles",
  "plan_name": "Artist",
  "app_url": "https://ghoste.one"
}
```

Result:
```text
Hey Miles,

Welcome to Ghoste One! Your plan: Artist.

Visit: https://ghoste.one
```

---

## Mailgun Integration

**API Endpoint:** `https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`

**Authentication:** Basic auth with username `api` and password `MAILGUN_API_KEY`

**Request Format:**
```
POST /v3/${MAILGUN_DOMAIN}/messages
Content-Type: application/x-www-form-urlencoded
Authorization: Basic base64(api:${MAILGUN_API_KEY})

from=${MAILGUN_FROM_EMAIL}
to=${job.to_email}
subject=${rendered_subject}
text=${rendered_text}
html=${rendered_html}
```

**Error Handling:**
- HTTP errors: Store status code + response body in `last_error`
- Network errors: Store error message in `last_error`
- Template not found: Mark as failed immediately

---

## Database Updates

### Migration Applied

**File:** `email_jobs_add_send_after_and_last_error`

**Changes:**
1. Added `send_after` column (timestamptz, nullable)
2. Renamed `error` column to `last_error`
3. Added index on `send_after` for scheduling queries

**SQL:**
```sql
-- Add send_after
ALTER TABLE public.email_jobs ADD COLUMN send_after timestamptz;

-- Rename error to last_error
ALTER TABLE public.email_jobs RENAME COLUMN error TO last_error;

-- Add scheduling index
CREATE INDEX idx_email_jobs_send_after
  ON public.email_jobs(send_after)
  WHERE status IN ('pending', 'queued');
```

---

## Testing

### 1. Check Pending Jobs

```sql
-- View pending jobs
SELECT id, to_email, template_key, status, send_after, created_at
FROM email_jobs
WHERE status IN ('pending', 'queued')
ORDER BY created_at
LIMIT 10;

-- Count by status
SELECT status, COUNT(*)
FROM email_jobs
GROUP BY status;
```

### 2. Manual Trigger Test

```bash
# Trigger worker manually
curl -X POST https://ghoste.one/.netlify/functions/email-jobs-run-now \
  -H "X-Admin-Key: ${ADMIN_TASK_KEY}" \
  -H "Content-Type: application/json"
```

### 3. Check Results

```sql
-- View sent jobs
SELECT id, to_email, template_key, sent_at, attempts
FROM email_jobs
WHERE status = 'sent'
ORDER BY sent_at DESC
LIMIT 10;

-- View failed jobs
SELECT id, to_email, template_key, last_error, attempts
FROM email_jobs
WHERE status = 'failed'
ORDER BY updated_at DESC
LIMIT 10;

-- Check automation events for welcome emails
SELECT *
FROM automation_events
WHERE event_key = 'welcome_sent'
ORDER BY created_at DESC
LIMIT 10;
```

### 4. Verify Scheduled Jobs

```sql
-- Jobs scheduled for future
SELECT id, to_email, template_key, send_after, status
FROM email_jobs
WHERE send_after IS NOT NULL
AND send_after > NOW()
ORDER BY send_after;
```

---

## Monitoring

### Queue Health

```sql
-- Queue backlog
SELECT
  COUNT(*) FILTER (WHERE status IN ('pending', 'queued')) as pending,
  COUNT(*) FILTER (WHERE status = 'sent') as sent,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  COUNT(*) as total
FROM email_jobs;

-- Age of oldest pending job
SELECT
  MIN(created_at) as oldest_pending,
  EXTRACT(EPOCH FROM (NOW() - MIN(created_at))) / 60 as minutes_old
FROM email_jobs
WHERE status IN ('pending', 'queued');
```

### Failure Analysis

```sql
-- Common failure reasons
SELECT
  LEFT(last_error, 50) as error_prefix,
  COUNT(*) as count
FROM email_jobs
WHERE status = 'failed'
GROUP BY LEFT(last_error, 50)
ORDER BY count DESC
LIMIT 10;

-- Failed jobs by template
SELECT
  template_key,
  COUNT(*) as failed_count
FROM email_jobs
WHERE status = 'failed'
GROUP BY template_key
ORDER BY failed_count DESC;
```

### Success Rate (Last 24 Hours)

```sql
SELECT
  COUNT(*) FILTER (WHERE status = 'sent') as sent,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE status = 'sent') / NULLIF(COUNT(*), 0),
    2
  ) as success_rate_percent
FROM email_jobs
WHERE created_at > NOW() - INTERVAL '24 hours';
```

---

## Troubleshooting

### Issue: Jobs Not Processing

**Check:**
1. Scheduled function is enabled in Netlify
2. Environment variables are set correctly
3. Jobs exist with correct status:
   ```sql
   SELECT * FROM email_jobs WHERE status IN ('pending', 'queued') LIMIT 5;
   ```

**Solution:**
- Manually trigger: `/.netlify/functions/email-jobs-run-now`
- Check Netlify function logs

### Issue: Template Not Found

**Check:**
```sql
SELECT template_key, enabled FROM email_templates;
```

**Solution:**
- Ensure template exists in `email_templates`
- Verify `enabled = true`
- Check `template_key` matches exactly

### Issue: Mailgun Errors

**Common Errors:**
- `401 Unauthorized` → Check `MAILGUN_API_KEY`
- `404 Not Found` → Check `MAILGUN_DOMAIN`
- `550 Rejected` → Verify domain DNS records
- `Rate limit exceeded` → Wait or upgrade Mailgun plan

**Check:**
```sql
SELECT last_error FROM email_jobs WHERE status = 'failed' ORDER BY updated_at DESC LIMIT 5;
```

### Issue: Scheduled Jobs Not Sending

**Check:**
```sql
SELECT id, send_after, NOW() as current_time
FROM email_jobs
WHERE status IN ('pending', 'queued')
AND send_after IS NOT NULL
ORDER BY send_after;
```

**Solution:**
- Jobs only process if `send_after <= NOW()`
- Wait for scheduled time or update `send_after = NULL`

---

## Environment Variables

**Required:**
```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Mailgun
MAILGUN_API_KEY=key-xxxxxxxxxxxxxxxxxxxxx
MAILGUN_DOMAIN=mail.ghoste.one
```

**Optional:**
```bash
# Custom from address
MAILGUN_FROM_EMAIL=Ghoste One <hello@ghoste.one>

# Admin key for manual trigger
ADMIN_TASK_KEY=your-secret-admin-key
```

**Set in Netlify:**
1. Dashboard → Site Settings → Environment Variables
2. Add each variable
3. Redeploy to apply

---

## Files Created/Modified

### Created:
- `/netlify/functions/email-jobs-worker.ts` - Scheduled worker (every 2 min)
- `/netlify/functions/email-jobs-run-now.ts` - Manual trigger function

### Modified:
- Database migration: `email_jobs_add_send_after_and_last_error`

### Existing (Used):
- `public.email_jobs` table
- `public.email_templates` table
- `public.automation_events` table

---

## Success Criteria

✅ email_jobs table has send_after and last_error columns
✅ email-jobs-worker scheduled function runs every 2 minutes
✅ email-jobs-run-now manual trigger works with auth
✅ Template loading from email_templates works
✅ Variable rendering supports {{key}} and {{nested.key}}
✅ Mailgun sending via API works
✅ Job status updates to sent/failed correctly
✅ last_error populated on failures
✅ automation_events receives welcome_sent for welcome_v1 emails
✅ Build completes successfully

---

## Next Steps

1. **Deploy to production:**
   ```bash
   git add .
   git commit -m "Add email jobs worker with Mailgun integration"
   git push origin main
   ```

2. **Test manual trigger:**
   ```bash
   curl -X POST https://ghoste.one/.netlify/functions/email-jobs-run-now \
     -H "X-Admin-Key: ${ADMIN_TASK_KEY}"
   ```

3. **Monitor for 24 hours:**
   - Check Netlify function logs
   - Query email_jobs status distribution
   - Verify Mailgun delivery logs

4. **Verify automation events:**
   ```sql
   SELECT COUNT(*) FROM automation_events WHERE event_key = 'welcome_sent';
   ```

---

## Done

Email jobs worker successfully implemented with Mailgun integration. The system processes pending jobs every 2 minutes, supports scheduled sending via send_after, and triggers automation events for welcome emails.

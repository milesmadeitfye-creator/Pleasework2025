# Email Admin Dashboard — Complete Implementation

## Overview

A comprehensive admin dashboard for monitoring and controlling all email operations in the Ghoste One platform. Provides real-time visibility into the email queue, automation events, and manual control over email sending.

---

## Access

**Primary Route:** `/admin/email`
**Alternative Route:** `/studio/admin/email` (redirects to `/admin/email`)

**Protection:**
- Requires authentication (ProtectedRoute wrapper)
- Requires `ADMIN_TASK_KEY` for all operations
- Admin key stored in React state only (never in localStorage)
- No secrets exposed to client

**Note:** Currently protected by auth only. For production, consider adding an additional admin check (e.g., email allowlist or `user_profiles.is_admin` flag).

---

## Architecture

### Backend Functions

#### 1. `/.netlify/functions/admin-email-stats`

**Purpose:** Fetch email statistics and recent outbox rows

**Method:** GET

**Headers:**
- `X-Admin-Key: <ADMIN_TASK_KEY>` (required)

**Query Parameters:**
- `limit`: Number of recent rows to fetch (default: 50, max: 200)
- `includeEvents`: Set to `true` to include automation events

**Response:**
```json
{
  "ok": true,
  "stats": {
    "queued": 10,
    "sending": 2,
    "sent": 150,
    "failed": 5,
    "sent_last_24h": 45
  },
  "recent": [
    {
      "id": 123,
      "user_id": "uuid",
      "to_email": "user@example.com",
      "template_key": "welcome_v1",
      "status": "sent",
      "error": null,
      "created_at": "2025-01-01T12:00:00Z",
      "sent_at": "2025-01-01T12:01:00Z",
      "attempts": 1
    }
  ],
  "events": [
    {
      "id": 456,
      "user_id": "uuid",
      "event_key": "welcome_sent",
      "payload": { "email": "user@example.com" },
      "created_at": "2025-01-01T12:01:00Z"
    }
  ],
  "lastRefreshed": "2025-01-01T12:30:00Z"
}
```

**Security:**
- Protected by `ADMIN_TASK_KEY`
- Uses Supabase service role
- Returns 401 if key invalid

---

#### 2. `/.netlify/functions/admin-email-retry`

**Purpose:** Retry failed emails by resetting status to 'queued'

**Method:** POST

**Headers:**
- `X-Admin-Key: <ADMIN_TASK_KEY>` (required)
- `Content-Type: application/json`

**Body Options:**

Option A - Retry specific IDs:
```json
{
  "ids": [123, 456, 789]
}
```

Option B - Retry all failed (with limit):
```json
{
  "status": "failed",
  "limit": 50
}
```

**Response:**
```json
{
  "ok": true,
  "retriedCount": 3,
  "requestedIds": 3
}
```

**Actions:**
- Resets `status` from 'failed' to 'queued'
- Clears `error` field
- Updates `updated_at` timestamp
- Allows worker to retry sending

**Security:**
- Protected by `ADMIN_TASK_KEY`
- Uses Supabase service role
- Returns 401 if key invalid

---

#### 3. Reused Functions

**`/.netlify/functions/email-enqueue-welcome`**
- Enqueues welcome emails for all users (backfill)
- Already documented in `WELCOME_EMAIL_SYSTEM_COMPLETE.md`

**`/.netlify/functions/email-worker`**
- Processes email queue and sends via Mailgun
- Already documented in `WELCOME_EMAIL_SYSTEM_COMPLETE.md`

---

## Frontend Dashboard

### Location
`/src/pages/admin/EmailAdmin.tsx`

### Features

#### A) Admin Controls (Top Section)

**Admin Key Input:**
- Password field to enter `ADMIN_TASK_KEY`
- Stored in React state only (never persisted)
- Required for all operations

**Control Buttons:**
1. **Refresh** - Reload stats and outbox data
2. **Enqueue Welcome to All** - Backfill welcome emails to all users
3. **Run Worker (50)** - Process up to 50 queued emails
4. **Run Worker x5 (250)** - Run worker 5 times sequentially (up to 250 emails)
5. **Retry Failed (50)** - Reset up to 50 failed emails to queued

**Features:**
- All buttons disabled if admin key not entered
- Loading spinner during operations
- Confirmation prompts for destructive actions
- Toast notifications for results

---

#### B) Metrics Cards

**Five stat cards:**
1. **Queued** (blue) - Emails waiting to be sent
2. **Sending** (yellow) - Currently being processed
3. **Sent (Total)** (green) - All successfully sent emails
4. **Sent (24h)** (green) - Emails sent in last 24 hours
5. **Failed** (red) - Failed email sends

**Display:**
- Large font for numbers
- Color-coded by status
- Icons for visual clarity

---

#### C) Filters

**Three filter controls:**

1. **Search by Email**
   - Text input with search icon
   - Filters outbox by email address (contains match)
   - Case-insensitive

2. **Status Dropdown**
   - Options: All, Queued, Sending, Sent, Failed
   - Filters outbox by status

3. **Template Dropdown**
   - Options: All, [dynamic list of template_key values]
   - Filters outbox by template

**Bulk Actions:**
- Shows count of selected rows
- "Retry Selected" button (appears when rows selected)
- "Clear Selection" button

---

#### D) Email Outbox Table

**Columns:**
- Checkbox (select row)
- Created (timestamp)
- Email (recipient)
- Template (template_key)
- Status (color-coded badge)
- Sent At (timestamp or -)
- Attempts (number)
- Error (truncated, hover for full text)

**Features:**
- Select all checkbox in header
- Individual row checkboxes
- Status badges with colors:
  - Blue: queued
  - Yellow: sending
  - Green: sent
  - Red: failed
- Hover effects on rows
- Responsive table with horizontal scroll
- Shows filtered count: "Email Outbox (50 rows)"

**Empty State:**
- "No emails found" message when filtered results empty

---

#### E) Automation Events Table

**Visibility:** Only shown when events exist (includeEvents=true)

**Columns:**
- Created (timestamp)
- User ID (truncated to 8 chars)
- Event Key (e.g., "welcome_sent")
- Payload (JSON formatted)

**Purpose:**
- Shows automation events triggered by email sends
- Helps verify automation sequences are working
- Debugging tool for sequence triggers

---

### User Experience

**Toast Notifications:**
- Success messages (green)
- Error messages (red)
- Auto-dismiss after 5 seconds
- Position: top-right corner

**Loading States:**
- Spinner icons on buttons
- Disabled state during operations
- "Processing..." text feedback

**Last Refreshed:**
- Timestamp shown in header
- Updates after each refresh

**Responsive Design:**
- Mobile-friendly layout
- Grid collapses on small screens
- Horizontal scroll for tables
- Touch-friendly controls

---

## Usage Guide

### First Time Setup

1. Navigate to `/admin/email`
2. Enter `ADMIN_TASK_KEY` in password field
3. Click "Refresh" to load current stats

### Monitoring Operations

**Check Queue Status:**
1. View metrics cards for quick overview
2. Use filters to drill down into specific statuses
3. Check "Sent (24h)" to monitor daily volume

**Review Failed Emails:**
1. Set status filter to "Failed"
2. Check error messages in table
3. Review common failure patterns

### Manual Operations

**Backfill Welcome Emails:**
1. Click "Enqueue Welcome to All"
2. Confirm the action
3. Wait for completion toast
4. Click "Refresh" to see queued count
5. Click "Run Worker (50)" to send batch

**Process Email Queue:**
1. Check "Queued" metric
2. Click "Run Worker (50)" for single batch
3. Or click "Run Worker x5" for larger batch (250 max)
4. View "Sent" count increase in real-time

**Retry Failed Emails:**

Option A - Retry all failed:
1. Click "Retry Failed (50)"
2. Confirm the action
3. Failed emails reset to queued
4. Run worker to retry sending

Option B - Retry specific emails:
1. Set status filter to "Failed"
2. Check boxes next to specific emails
3. Click "Retry Selected"
4. Selected emails reset to queued

### Troubleshooting

**No emails sending?**
- Check "Queued" count
- Run worker manually
- Check Netlify function logs for errors
- Verify Mailgun credentials in env vars

**High failure rate?**
- Filter by "Failed" status
- Review error messages
- Common issues:
  - Invalid email addresses
  - Mailgun rate limits
  - Missing env vars
  - Network timeouts

**Automation events not triggering?**
- Check "Automation Events" table
- Verify `welcome_sent` events created
- Check `user_profiles.welcome_email_sent_at` populated
- Review email-worker function logs

---

## Security

### Access Control

**Current Implementation:**
- Requires authentication (user must be signed in)
- Admin key required for all operations
- Admin key never sent to client (only in request headers)

**Recommended Production Enhancement:**
Add server-side admin check:

```typescript
// In admin-email-stats.ts and admin-email-retry.ts
const { data: profile } = await supabase
  .from('user_profiles')
  .select('is_admin')
  .eq('id', userId)
  .maybeSingle();

if (!profile?.is_admin) {
  return {
    statusCode: 403,
    body: JSON.stringify({ error: 'Admin access required' }),
  };
}
```

### Data Protection

**What's Protected:**
- Mailgun API key (server-only)
- Supabase service role key (server-only)
- Admin task key (prompted, never stored client-side)
- User emails (visible to authenticated admins only)

**What's Exposed:**
- Email addresses (to admin users with valid key)
- Template keys (to admin users with valid key)
- Error messages (to admin users with valid key)
- Automation events (to admin users with valid key)

**RLS Note:**
- `email_outbox` and `automation_events` have service role policies
- Client cannot directly query these tables
- All reads go through admin functions with key validation

---

## Database Tables Used

### email_outbox

**Columns:**
- `id` (bigserial, primary key)
- `user_id` (uuid, references auth.users)
- `to_email` (text)
- `template_key` (text)
- `subject` (text)
- `payload` (jsonb)
- `status` (text: queued/sending/sent/failed)
- `attempts` (integer)
- `sent_at` (timestamptz)
- `error` (text)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

**Indexes:**
- `idx_email_outbox_status_created` (for queue processing)
- `idx_email_outbox_user_id`
- `idx_email_outbox_template_key`
- `idx_email_outbox_welcome_unique` (prevents duplicates)

**RLS:**
- Service role: full access
- Authenticated users: read own rows only

---

### automation_events

**Columns:**
- `id` (bigserial, primary key)
- `user_id` (uuid, references auth.users)
- `event_key` (text)
- `payload` (jsonb)
- `created_at` (timestamptz)

**Indexes:**
- `idx_automation_events_user_id`
- `idx_automation_events_event_key`
- `idx_automation_events_created`

**RLS:**
- Service role: full access
- Authenticated users: read own rows only

---

## Environment Variables

**Required in Netlify:**
```bash
# Supabase
SUPABASE_URL=https://knvvdeomfncujsiiqxsg.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>

# Mailgun (used by email-worker)
MAILGUN_API_KEY=<api_key>
MAILGUN_DOMAIN=mg.ghoste.one
MAILGUN_FROM_EMAIL="Ghoste One <hello@mg.ghoste.one>"

# Admin Protection
ADMIN_TASK_KEY=<random_secret_key>
```

**Generate Admin Key:**
```bash
# Generate secure random key
openssl rand -hex 32
```

---

## Testing

### Manual Testing

**Test Stats Fetch:**
```bash
curl -H "X-Admin-Key: YOUR_ADMIN_KEY" \
  https://ghoste.one/.netlify/functions/admin-email-stats?limit=10&includeEvents=true
```

**Test Retry All Failed:**
```bash
curl -X POST \
  -H "X-Admin-Key: YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status":"failed","limit":50}' \
  https://ghoste.one/.netlify/functions/admin-email-retry
```

**Test Retry Specific IDs:**
```bash
curl -X POST \
  -H "X-Admin-Key: YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"ids":[123,456]}' \
  https://ghoste.one/.netlify/functions/admin-email-retry
```

### UI Testing

1. Navigate to `/admin/email`
2. Enter admin key
3. Click "Refresh" - should load stats
4. Click "Run Worker (50)" - should process emails
5. Set status filter to "Failed"
6. Select rows and click "Retry Selected"
7. Verify toast notifications appear
8. Check table updates after operations

---

## Monitoring Queries

**Check queue health:**
```sql
SELECT
  status,
  COUNT(*) as count,
  MIN(created_at) as oldest,
  MAX(created_at) as newest
FROM email_outbox
GROUP BY status;
```

**Find stuck emails:**
```sql
SELECT *
FROM email_outbox
WHERE status = 'sending'
  AND created_at < now() - interval '10 minutes';
```

**Check send rate:**
```sql
SELECT
  DATE_TRUNC('hour', sent_at) as hour,
  COUNT(*) as sent_count
FROM email_outbox
WHERE status = 'sent'
  AND sent_at > now() - interval '24 hours'
GROUP BY hour
ORDER BY hour DESC;
```

**Review failures:**
```sql
SELECT
  template_key,
  error,
  COUNT(*) as failure_count
FROM email_outbox
WHERE status = 'failed'
GROUP BY template_key, error
ORDER BY failure_count DESC
LIMIT 10;
```

**Check automation triggers:**
```sql
SELECT
  DATE(created_at) as date,
  COUNT(*) as events_triggered
FROM automation_events
WHERE event_key = 'welcome_sent'
GROUP BY date
ORDER BY date DESC
LIMIT 7;
```

---

## Troubleshooting

### Common Issues

**"Unauthorized - invalid admin key"**
- Verify `ADMIN_TASK_KEY` matches env var in Netlify
- Check for typos in key entry
- Ensure env var is set in correct Netlify environment

**"Failed to fetch stats"**
- Check Netlify function logs
- Verify Supabase credentials in env vars
- Check network connectivity

**"Worker processed 0 emails"**
- No emails in queue (check "Queued" metric)
- All emails already processed
- Worker may have been called multiple times in parallel

**Emails stuck in "sending" status**
- Worker crashed mid-process
- Use retry to reset to "queued"
- Check Netlify function logs for errors

**High failure rate**
- Check Mailgun dashboard for API errors
- Verify Mailgun domain is verified
- Check for rate limit errors
- Review error messages in outbox table

---

## Future Enhancements

### Suggested Features

1. **Email Preview**
   - View rendered email HTML before sending
   - Test template rendering with sample data

2. **Scheduled Sends**
   - Queue emails for future send time
   - Timezone-aware scheduling

3. **Email Templates Management**
   - CRUD operations for email templates
   - Template versioning
   - A/B test templates

4. **Advanced Filtering**
   - Date range picker
   - User ID search
   - Template version filter

5. **Bulk Operations**
   - Delete old sent emails
   - Archive failed emails
   - Export to CSV

6. **Real-time Updates**
   - WebSocket connection for live stats
   - Auto-refresh every 30 seconds
   - Push notifications for failures

7. **Analytics Dashboard**
   - Send success rate over time
   - Template performance metrics
   - Failure rate by template
   - Delivery time statistics

8. **Rate Limiting**
   - Configure per-template send limits
   - Throttle sends to avoid spam filters
   - Mailgun API rate monitoring

---

## File Structure

```
netlify/functions/
  ├── admin-email-stats.ts        # Stats and outbox API
  ├── admin-email-retry.ts        # Retry failed emails
  ├── email-enqueue-welcome.ts    # Enqueue welcome emails
  └── email-worker.ts             # Process email queue

src/
  ├── pages/
  │   └── admin/
  │       └── EmailAdmin.tsx      # Admin dashboard UI
  └── App.tsx                      # Route configuration

supabase/migrations/
  └── [timestamp]_welcome_email_automation_system.sql
```

---

## Success Criteria

✅ Dashboard accessible at `/admin/email`
✅ Admin key required for all operations
✅ Real-time stats display (queued, sending, sent, failed)
✅ Email outbox table with filters and search
✅ Bulk retry for failed emails
✅ Manual worker execution
✅ Toast notifications for feedback
✅ No secrets exposed client-side
✅ Mobile-responsive design
✅ Build completes successfully
✅ Automation events tracking visible

---

## Done

The Email Admin Dashboard is complete and ready for production use. All email operations can be monitored and controlled from a single interface with proper security and admin key protection.

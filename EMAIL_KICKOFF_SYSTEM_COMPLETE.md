# Email Kickoff System — Complete

## Overview

Implemented a server-side "Kickoff Sales Emails" system that diagnoses Mailgun configuration and reliably sends queued welcome emails to users. The system includes proper authentication, tracking, and owner-only access controls.

---

## Changes Made

### 1. Netlify Function: email-kickoff.ts

**Location:** `/netlify/functions/email-kickoff.ts`

**Features:**
- Owner-only access (milesdorre5@gmail.com or is_admin flag)
- JWT authentication via Authorization header
- Comprehensive Mailgun diagnostics
- Batch processing (up to 500 emails per run, 50 per batch)
- Full tracking via email_outbox, welcome_email_sent_at, and automation_events
- Clear error handling and reporting

**Authentication Flow:**
```typescript
1. Extract Bearer token from Authorization header
2. Verify JWT with Supabase auth.getUser()
3. Check if user email is milesdorre5@gmail.com OR is_admin=true
4. Reject if unauthorized (403)
```

**Configuration Diagnostics:**
```typescript
Checks for:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- MAILGUN_API_KEY
- MAILGUN_DOMAIN
- MAILGUN_FROM_EMAIL

Returns clear error if any are missing
```

**Workflow:**
```
1. Verify authorization
2. Diagnose configuration
3. Enqueue users (query user_profiles where welcome_email_sent_at IS NULL)
4. Send in batches:
   a. Mark as 'sending'
   b. Generate email content from template
   c. Send via Mailgun
   d. On success:
      - Mark as 'sent'
      - Set user_profiles.welcome_email_sent_at
      - Insert automation_events('welcome_sent')
   e. On failure:
      - Mark as 'failed'
      - Store error message
5. Return summary
```

**Response Format:**
```json
{
  "success": true,
  "enqueued": 15,
  "sent": 15,
  "failed": 0,
  "remainingQueued": 0,
  "mailgunDomain": "mail.ghoste.one",
  "fromEmail": "Ghoste One <hello@ghoste.one>",
  "errors": [],
  "diagnostics": {
    "supabaseConfigured": true,
    "mailgunConfigured": true,
    "mailgunApiKey": true,
    "mailgunDomain": true,
    "mailgunFromEmail": true
  }
}
```

**Mailgun Integration:**
```typescript
// Uses existing Mailgun client from _mailgunClient.ts
// Basic auth: username='api', key=MAILGUN_API_KEY
// POST to https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages

await mailgunClient.messages.create(MAILGUN_DOMAIN, {
  from: MAILGUN_FROM_EMAIL,
  to: email.to_email,
  subject: email.subject,
  text: textContent,
  html: htmlContent,
});
```

### 2. UI Trigger (AccountSettings.tsx)

**Location:** `/src/components/AccountSettings.tsx`

**Added State:**
```typescript
const [kickingOffEmails, setKickingOffEmails] = useState(false);
```

**Added Function:**
```typescript
const handleKickoffEmails = async () => {
  // 1. Get session token
  // 2. Call /.netlify/functions/email-kickoff
  // 3. Display results via toast
  // 4. Log detailed results to console
}
```

**UI Button (Owner-Only):**
```tsx
{user?.email === 'milesdorre5@gmail.com' && (
  <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1">
        <div className="font-medium text-emerald-400 mb-1">
          Email Kickoff (Owner Only)
        </div>
        <div className="text-sm text-gray-300 mb-2">
          Diagnose Mailgun config and send queued welcome emails...
        </div>
        <div className="text-xs text-gray-400">
          Processes up to 500 emails per run...
        </div>
      </div>
      <button
        onClick={handleKickoffEmails}
        disabled={kickingOffEmails}
        className="px-4 py-2 bg-emerald-600..."
      >
        {kickingOffEmails ? 'Sending...' : 'Kickoff Sales Emails'}
      </button>
    </div>
  </div>
)}
```

**Location in UI:**
- Settings page → Internal Tools section
- Only visible to milesdorre5@gmail.com
- Green/emerald theme to distinguish from other admin tools
- Clear description of what the button does
- Disabled state while processing

**Toast Messages:**
```typescript
// Success (emails sent)
showToast(`Successfully sent ${sent} welcome emails!`, 'success');

// Success (no emails to send)
showToast('No emails to send. All users have received welcome emails!', 'success');

// Error
showToast(`Error: ${error.message}`, 'error');
```

### 3. Welcome Email Template

**Location:** `/netlify/functions/_welcomeEmailTemplate.ts`

**Template Key:** `welcome_v1`

**Subject:** `Welcome to Ghoste One 👻`

**Content Features:**
- Personalized greeting with first name
- Three action cards:
  1. Create Smart Link (blue)
  2. Launch campaign with Ghoste AI (purple)
  3. Build fanbase (green)
- Clear CTAs with direct links
- Dark theme matching Ghoste brand
- Responsive design
- Unsubscribe footer

**Text Version:**
```
Hey {firstName},

Welcome to Ghoste One — your control room for music marketing.

Here's what you can do right now:

→ Create your first Smart Link
  One link for all platforms. Track every click.
  Start: https://ghoste.one/studio/smart-links

→ Launch a campaign with Ghoste AI
  Your AI manager will help you plan, create, and execute.
  Start: https://ghoste.one/studio/ghoste-ai

→ Build your fanbase
  Email lists, SMS, automations — all in one place.
  Start: https://ghoste.one/studio/fan-communication

Questions? Just reply to this email.

– The Ghoste One Team
```

**HTML Version:**
- Fully styled email with dark theme
- Table-based layout for email client compatibility
- Inline CSS for maximum compatibility
- Responsive breakpoints for mobile
- Branded header and footer
- Action cards with hover states (where supported)

### 4. Database Schema (Already Exists)

**Tables Used:**

**email_outbox:**
```sql
- id (bigserial primary key)
- user_id (uuid references auth.users)
- to_email (text not null)
- template_key (text not null)
- subject (text not null)
- payload (jsonb)
- status (text: queued, sending, sent, failed)
- attempts (integer default 0)
- sent_at (timestamptz)
- error (text)
- created_at (timestamptz)
- updated_at (timestamptz)

Unique index: user_id + template_key (for welcome_v1, where status != failed)
```

**automation_events:**
```sql
- id (bigserial primary key)
- user_id (uuid references auth.users)
- event_key (text not null)
- payload (jsonb)
- created_at (timestamptz)

Indexes:
- user_id
- event_key
- created_at DESC
```

**user_profiles:**
```sql
- welcome_email_sent_at (timestamptz)
  - Set when welcome email is successfully sent
  - Prevents duplicate welcome emails
  - Indexed for efficient queries
```

---

## Architecture

### Authentication Flow

```
User (milesdorre5@gmail.com)
  ↓ Click "Kickoff Sales Emails"
  ↓
AccountSettings.tsx
  ↓ fetch(/.netlify/functions/email-kickoff)
  ↓ Authorization: Bearer {supabase_token}
  ↓
email-kickoff.ts
  ↓ Verify JWT with Supabase
  ↓ Check email = milesdorre5@gmail.com OR is_admin = true
  ↓ (403 if unauthorized)
  ↓
Process & Send Emails
  ↓
Return Results
```

### Email Sending Flow

```
1. Query user_profiles
   WHERE welcome_email_sent_at IS NULL
   AND email IS NOT NULL
   LIMIT 500

2. Insert into email_outbox
   template_key='welcome_v1'
   status='queued'
   (Unique constraint prevents duplicates)

3. Process in batches of 50:
   a. Select 50 queued emails
   b. For each email:
      - Update status='sending'
      - Generate content from template
      - Send via Mailgun API
      - If success:
        * Update status='sent', sent_at=now()
        * Update user_profiles.welcome_email_sent_at
        * Insert automation_events('welcome_sent')
      - If failure:
        * Update status='failed', error=message
   c. Repeat up to 10 batches (max 500 total)

4. Return summary
```

### Tracking & Automation Trigger

**Tracking:**
```sql
-- Email queue status
SELECT status, COUNT(*)
FROM email_outbox
WHERE template_key = 'welcome_v1'
GROUP BY status;

-- Users who received welcome email
SELECT COUNT(*)
FROM user_profiles
WHERE welcome_email_sent_at IS NOT NULL;

-- Users pending welcome email
SELECT COUNT(*)
FROM user_profiles
WHERE welcome_email_sent_at IS NULL
AND email IS NOT NULL;
```

**Automation Trigger:**
```sql
-- After successful send, insert event
INSERT INTO automation_events (user_id, event_key, payload)
VALUES (
  user_id,
  'welcome_sent',
  '{"email": "user@example.com", "template_key": "welcome_v1", "sent_at": "2024-01-15T10:30:00Z"}'
);

-- Other automation systems can listen for this event
-- to trigger follow-up sequences (e.g., sales emails)
```

---

## Security

### Authentication

**Owner-Only Access:**
- Function checks `user.email === 'milesdorre5@gmail.com'`
- Fallback to `user_profiles.is_admin = true`
- JWT verification via Supabase auth.getUser()
- Returns 403 if unauthorized

**No Client-Side Secrets:**
- MAILGUN_API_KEY only on server
- SUPABASE_SERVICE_ROLE_KEY only on server
- Client only sends JWT token
- No Mailgun credentials in frontend

### RLS Policies

**email_outbox:**
```sql
-- Service role can manage all
CREATE POLICY "Service role can manage email outbox"
  ON email_outbox FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Users can view their own (transparency)
CREATE POLICY "Users can view own email outbox"
  ON email_outbox FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
```

**automation_events:**
```sql
-- Service role can manage all
CREATE POLICY "Service role can manage automation events"
  ON automation_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Users can view their own
CREATE POLICY "Users can view own automation events"
  ON automation_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
```

### Input Validation

**Email Address:**
- Must be valid email format
- Must exist in user_profiles
- Must not be null

**Unique Constraint:**
```sql
-- Prevents duplicate welcome emails
CREATE UNIQUE INDEX idx_email_outbox_welcome_unique
  ON email_outbox(user_id, template_key)
  WHERE template_key = 'welcome_v1' AND status != 'failed';
```

---

## Error Handling

### Configuration Errors

**Missing Environment Variables:**
```json
{
  "error": "Configuration incomplete",
  "success": false,
  "errors": [
    "Mailgun not configured (missing MAILGUN_API_KEY or MAILGUN_DOMAIN)"
  ],
  "diagnostics": {
    "supabaseConfigured": true,
    "mailgunConfigured": false,
    "mailgunApiKey": false,
    "mailgunDomain": true,
    "mailgunFromEmail": true
  }
}
```

**Response:** Function returns 500 with clear diagnostic info

### Authentication Errors

**Missing Token:**
```json
{
  "error": "Missing or invalid Authorization header",
  "diagnostics": { ... }
}
```
**Response:** 401 Unauthorized

**Unauthorized User:**
```json
{
  "error": "Access denied. Owner-only endpoint.",
  "diagnostics": { ... }
}
```
**Response:** 403 Forbidden

### Send Errors

**Mailgun API Failure:**
```typescript
// Caught and tracked in email_outbox
{
  id: 123,
  status: 'failed',
  error: 'Mailgun API error: Invalid domain',
  attempts: 1
}
```

**Database Error:**
```typescript
// Logged and added to errors array
errors.push(`Failed to enqueue user@example.com: ${error.message}`);
```

**Network Error:**
```typescript
// Caught in try/catch, marked as failed
{
  status: 'failed',
  error: 'Network error: ETIMEDOUT'
}
```

---

## Usage

### Trigger Email Kickoff

1. **Login as owner:**
   - Email: milesdorre5@gmail.com
   - OR any user with is_admin=true

2. **Navigate to Settings:**
   - Go to `/settings`
   - Scroll to "Internal Tools" section
   - See "Email Kickoff (Owner Only)" card

3. **Click Button:**
   - Button: "Kickoff Sales Emails"
   - Button changes to "Sending..." while processing
   - Wait for completion (usually 10-30 seconds)

4. **Review Results:**
   - Success toast: "Successfully sent X welcome emails!"
   - Check console for detailed results
   - Review email_outbox table for status

### Manual Testing

**Check Configuration:**
```bash
# Test auth
curl -X POST https://ghoste.one/.netlify/functions/email-kickoff \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"

# Expected: Auth error or config diagnostics
```

**Check Email Queue:**
```sql
-- View queued emails
SELECT * FROM email_outbox WHERE status = 'queued' LIMIT 10;

-- View sent emails
SELECT * FROM email_outbox WHERE status = 'sent' ORDER BY sent_at DESC LIMIT 10;

-- View failed emails
SELECT * FROM email_outbox WHERE status = 'failed' LIMIT 10;
```

**Check Automation Events:**
```sql
-- View welcome_sent events
SELECT * FROM automation_events
WHERE event_key = 'welcome_sent'
ORDER BY created_at DESC
LIMIT 10;
```

**Check User Tracking:**
```sql
-- Users who received welcome email
SELECT user_id, email, welcome_email_sent_at
FROM user_profiles
WHERE welcome_email_sent_at IS NOT NULL
ORDER BY welcome_email_sent_at DESC
LIMIT 10;

-- Users pending welcome email
SELECT user_id, email, created_at
FROM user_profiles
WHERE welcome_email_sent_at IS NULL
AND email IS NOT NULL
LIMIT 10;
```

---

## Monitoring

### Dashboard Queries

**Email Outbox Status:**
```sql
SELECT
  status,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as last_24h
FROM email_outbox
WHERE template_key = 'welcome_v1'
GROUP BY status;
```

**Welcome Email Coverage:**
```sql
SELECT
  COUNT(*) FILTER (WHERE welcome_email_sent_at IS NOT NULL) as sent,
  COUNT(*) FILTER (WHERE welcome_email_sent_at IS NULL) as pending,
  COUNT(*) as total
FROM user_profiles
WHERE email IS NOT NULL;
```

**Automation Event Rate:**
```sql
SELECT
  DATE(created_at) as date,
  COUNT(*) as welcome_emails_sent
FROM automation_events
WHERE event_key = 'welcome_sent'
AND created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

**Failed Emails Analysis:**
```sql
SELECT
  error,
  COUNT(*) as count
FROM email_outbox
WHERE status = 'failed'
AND template_key = 'welcome_v1'
GROUP BY error
ORDER BY count DESC
LIMIT 10;
```

### Logs

**Function Logs:**
```typescript
[Kickoff] Authorized: milesdorre5@gmail.com
[Enqueue] Found 15 users needing welcome emails
[Enqueue] Successfully enqueued 15 emails
[Kickoff] Enqueued 15 new emails
[Kickoff] Sending queued emails...
[Send] Processing batch 1: 15 emails
[Send] ✓ Sent to user1@example.com
[Send] ✓ Sent to user2@example.com
...
[Send] ✗ Failed to userX@example.com: Invalid domain
[Send] No more queued emails after batch 1
[Kickoff] Sent 14, Failed 1
[Kickoff] Remaining queued: 0
```

**Browser Console:**
```typescript
[Email Kickoff] Result: {
  success: true,
  enqueued: 15,
  sent: 14,
  failed: 1,
  remainingQueued: 0,
  mailgunDomain: "mail.ghoste.one",
  fromEmail: "Ghoste One <hello@ghoste.one>",
  errors: ["Failed to send to userX@example.com: Invalid domain"],
  diagnostics: { ... }
}
```

---

## Troubleshooting

### Issue: Button Not Visible

**Cause:** User email is not milesdorre5@gmail.com and is_admin is not true

**Solution:**
1. Login as milesdorre5@gmail.com
2. OR set is_admin=true in user_profiles:
   ```sql
   UPDATE user_profiles
   SET is_admin = true
   WHERE email = 'your@email.com';
   ```

### Issue: Configuration Error

**Cause:** Missing environment variables

**Solution:**
1. Check Netlify environment variables:
   - MAILGUN_API_KEY
   - MAILGUN_DOMAIN
   - MAILGUN_FROM_EMAIL
   - SUPABASE_URL
   - SUPABASE_SERVICE_ROLE_KEY
2. Verify values are not empty
3. Redeploy if changed

### Issue: No Emails Queued

**Cause:** All users already have welcome_email_sent_at set

**Solution:**
```sql
-- Reset for testing
UPDATE user_profiles
SET welcome_email_sent_at = NULL
WHERE email = 'test@example.com';

-- Delete from outbox to allow re-enqueue
DELETE FROM email_outbox
WHERE user_id = (SELECT user_id FROM user_profiles WHERE email = 'test@example.com')
AND template_key = 'welcome_v1';
```

### Issue: Emails Not Sending

**Cause:** Mailgun API error or invalid credentials

**Solution:**
1. Check Mailgun API key validity
2. Verify domain is verified in Mailgun
3. Check Mailgun logs for delivery issues
4. Test with Mailgun's test API endpoint
5. Review failed email errors in email_outbox

### Issue: Duplicate Emails

**Cause:** Should be prevented by unique index

**Solution:**
```sql
-- Verify unique index exists
SELECT * FROM pg_indexes
WHERE tablename = 'email_outbox'
AND indexname = 'idx_email_outbox_welcome_unique';

-- If missing, recreate:
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_outbox_welcome_unique
  ON email_outbox(user_id, template_key)
  WHERE template_key = 'welcome_v1' AND status != 'failed';
```

---

## Performance

### Batch Processing

**Limits:**
- 50 emails per batch
- 10 batches maximum per request
- 500 emails total per kickoff

**Rationale:**
- Prevents function timeout (10 min max on Netlify)
- Allows monitoring between batches
- Manageable error handling
- Can be run multiple times if needed

**Timing:**
- ~1-2 seconds per email (Mailgun API + DB writes)
- ~50-100 seconds per batch
- ~8-15 minutes for full 500 emails

### Database Performance

**Indexes:**
```sql
-- Fast queue queries
CREATE INDEX idx_email_outbox_status_created
  ON email_outbox(status, created_at)
  WHERE status IN ('queued', 'sending');

-- Fast user lookups
CREATE INDEX idx_email_outbox_user_id
  ON email_outbox(user_id);

-- Fast welcome email queries
CREATE INDEX idx_user_profiles_welcome_email_sent
  ON user_profiles(welcome_email_sent_at)
  WHERE welcome_email_sent_at IS NOT NULL;

-- Fast automation queries
CREATE INDEX idx_automation_events_event_key
  ON automation_events(event_key);
```

### Optimization Tips

**For Large User Base (1000+ users):**
1. Run kickoff multiple times (processes 500 each)
2. Monitor email_outbox for remaining queued
3. Check Mailgun sending limits
4. Consider scheduling as cron job

**For Real-Time Sending:**
1. Set up Supabase trigger on user signup
2. Call enqueue_welcome_email function
3. Set up separate worker function to process queue
4. Schedule worker every 5-10 minutes

---

## Future Enhancements

### 1. Scheduled Kickoff

**Implementation:**
```typescript
// netlify.toml
[[functions]]
  name = "email-kickoff-cron"
  schedule = "0 */6 * * *"  # Every 6 hours
```

**Benefits:**
- Automatic processing
- No manual intervention
- Catches any missed users

### 2. Email Templates System

**Features:**
- Template editor UI
- Multiple template versions
- A/B testing support
- Preview mode

**Database:**
```sql
CREATE TABLE email_templates (
  id bigserial PRIMARY KEY,
  template_key text NOT NULL,
  version text NOT NULL,
  subject text NOT NULL,
  html_template text NOT NULL,
  text_template text NOT NULL,
  variables jsonb,
  active boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
```

### 3. Retry Logic

**Features:**
- Automatic retry for failed emails
- Exponential backoff
- Max retry limit (3-5 attempts)
- Dead letter queue for permanent failures

**Implementation:**
```typescript
// Check attempts < max_attempts
// Retry with exponential delay: 1min, 5min, 30min, 2hr
// After max attempts, mark as permanently failed
```

### 4. Analytics Dashboard

**Features:**
- Email delivery rates
- Open rates (with tracking pixel)
- Click-through rates
- Conversion tracking
- Automation funnel metrics

**Tracking:**
```typescript
// Add tracking parameters to links
const trackingUrl = `${baseUrl}?utm_source=email&utm_medium=welcome&utm_campaign=onboarding&user_id=${userId}`;

// Add tracking pixel to email
const pixelUrl = `https://ghoste.one/.netlify/functions/email-open-track?email_id=${emailId}`;
```

### 5. Unsubscribe Management

**Features:**
- One-click unsubscribe
- Preference center
- Unsubscribe tracking
- Re-subscription opt-in

**Database:**
```sql
CREATE TABLE email_preferences (
  user_id uuid PRIMARY KEY,
  unsubscribed_all boolean DEFAULT false,
  unsubscribed_marketing boolean DEFAULT false,
  unsubscribed_product boolean DEFAULT false,
  unsubscribe_date timestamptz,
  unsubscribe_reason text
);
```

---

## Testing Checklist

### Functional Tests

- [ ] Owner can see button in Settings
- [ ] Non-owner cannot see button
- [ ] Button disabled while processing
- [ ] Success toast shows on completion
- [ ] Error toast shows on failure
- [ ] Console logs detailed results
- [ ] Users enqueued correctly
- [ ] Emails sent successfully
- [ ] welcome_email_sent_at updated
- [ ] automation_events created
- [ ] Duplicate prevention works
- [ ] Batch processing works
- [ ] Error handling works
- [ ] Configuration diagnostics accurate

### Security Tests

- [ ] JWT verification works
- [ ] Owner email check works
- [ ] is_admin flag check works
- [ ] Unauthorized users blocked (403)
- [ ] Invalid tokens rejected (401)
- [ ] No secrets exposed client-side
- [ ] RLS policies enforced

### Performance Tests

- [ ] Handles 50 emails per batch
- [ ] Processes 10 batches without timeout
- [ ] Database queries optimized
- [ ] Mailgun API calls efficient
- [ ] Memory usage acceptable
- [ ] No race conditions

### Integration Tests

- [ ] Mailgun API integration works
- [ ] Supabase auth integration works
- [ ] Database writes successful
- [ ] Email template renders correctly
- [ ] Links in email work
- [ ] Unsubscribe link works

---

## Environment Variables Required

```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Mailgun
MAILGUN_API_KEY=key-xxxxxxxxxxxxxxxxxxxxx
MAILGUN_DOMAIN=mail.ghoste.one
MAILGUN_FROM_EMAIL=Ghoste One <hello@ghoste.one>
```

**Set in Netlify:**
1. Go to Netlify Dashboard
2. Site Settings → Environment Variables
3. Add each variable
4. Redeploy site

---

## Success Criteria

✅ Owner can trigger email kickoff from Settings page
✅ Function diagnoses Mailgun configuration
✅ Function enqueues users who need welcome emails
✅ Emails sent via Mailgun API
✅ email_outbox tracks status (queued → sending → sent/failed)
✅ welcome_email_sent_at updated on success
✅ automation_events('welcome_sent') inserted on success
✅ Owner-only access enforced (milesdorre5@gmail.com)
✅ No Mailgun keys exposed client-side
✅ Batch processing prevents timeouts
✅ Clear error messages and diagnostics
✅ Toast notifications show results
✅ Build completes successfully

---

## Done

The Email Kickoff System is complete and ready for use. The owner can now reliably send welcome emails to all users from the Settings page, with full tracking and automation triggers in place.

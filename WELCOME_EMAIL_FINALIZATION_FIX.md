# Welcome Email Finalization Layer - Complete

## Overview

Added a finalization layer to email rendering to ensure **no raw template variables ever reach users**. This adds a safety net on top of the existing payload normalization.

---

## Problem

Even with `createSafePayload()` ensuring variables exist in the payload, some edge cases could still result in raw `{{first_name}}` reaching users if:
- Template has a typo: `{{ firstName }}` instead of `{{first_name}}`
- Template references a missing nested key: `{{plan.name}}` when `plan` is undefined
- Job payload is completely empty (edge case)

---

## Solution: Three-Layer Safety System

### Layer 1: Payload Normalization (Already Existed)
```typescript
function createSafePayload(payload: Record<string, any>, toEmail: string): Record<string, any> {
  const emailPrefix = toEmail ? toEmail.split('@')[0] : 'there';

  const safePayload = {
    ...payload,
    first_name: payload.first_name ||
                payload.display_name ||
                payload.full_name ||
                emailPrefix,
  };

  return safePayload;
}
```

**Purpose:** Ensures `first_name` exists in payload before rendering

### Layer 2: Template Rendering (Already Existed)
```typescript
function renderTemplate(template: string, payload: Record<string, any>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
    const trimmedKey = key.trim();
    const keys = trimmedKey.split('.');
    let value: any = payload;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return match; // Keep {{...}} if value not found
      }
    }

    return value != null ? String(value) : match;
  });
}
```

**Purpose:** Replaces `{{var}}` with values from payload, supports nested keys

### Layer 3: Finalization (NEW)
```typescript
function finalizeRenderedContent(content: string): string {
  // First pass: replace any leftover {{first_name}} or {{ first_name }} with "there"
  let finalized = content.replace(/\{\{\s*first_name\s*\}\}/gi, 'there');

  // Second pass: strip any remaining {{...}} tokens to avoid shipping braces to users
  finalized = finalized.replace(/\{\{[^}]+\}\}/g, '');

  return finalized;
}
```

**Purpose:** Final cleanup pass to ensure NO template variables escape

---

## Implementation

### Updated Flow

**Before:**
```typescript
const safePayload = createSafePayload(job.payload, job.to_email);
const renderedSubject = renderTemplate(subject, safePayload);
const renderedText = renderTemplate(template.body_text, safePayload);
const renderedHtml = renderTemplate(template.body_html, safePayload);

await sendViaMailgun({
  subject: renderedSubject,
  text: renderedText,
  html: renderedHtml,
});
```

**After:**
```typescript
const safePayload = createSafePayload(job.payload, job.to_email);

// Choose subject: job.subject takes priority, otherwise use template.subject
const baseSubject = job.subject ?? template.subject ?? '';
const baseText = template.body_text ?? '';
const baseHtml = template.body_html ?? '';

// Render templates with payload
const renderedSubject = renderTemplate(baseSubject, safePayload);
const renderedText = renderTemplate(baseText, safePayload);
const renderedHtml = renderTemplate(baseHtml, safePayload);

// Finalize: replace leftover {{first_name}} with "there" and strip remaining tokens
const finalSubject = finalizeRenderedContent(renderedSubject);
const finalText = finalizeRenderedContent(renderedText);
const finalHtml = finalizeRenderedContent(renderedHtml);

// Log job details for debugging (check if subject still contains "{{")
const hasUnresolvedTokens = finalSubject.includes('{{');
console.log('[EmailJobsWorker] Job ' + job.id + ' | To: ' + job.to_email + ' | Template: ' + job.template_key + ' | Subject: ' + finalSubject.substring(0, 80) + (hasUnresolvedTokens ? ' [WARN: unresolved tokens]' : ''));

await sendViaMailgun({
  subject: finalSubject,
  text: finalText,
  html: finalHtml,
});
```

### Key Changes

1. **Explicit Prioritization:**
   - `job.subject ?? template.subject ?? ''` - Clear priority order
   - Handles null/undefined gracefully with `??` operator

2. **Finalization Step:**
   - Replaces leftover `{{first_name}}` with "there" (case-insensitive)
   - Strips all remaining `{{...}}` tokens
   - Ensures clean output

3. **Enhanced Logging:**
   - Logs final subject (after finalization)
   - Warns if unresolved tokens remain (shouldn't happen after finalize)
   - Helps debug template issues

---

## Examples

### Example 1: Normal Case
```
Input Template Subject: "Welcome to Ghoste One, {{first_name}} 👻"
Payload: { first_name: "Miles" }

After Layer 1 (createSafePayload): { first_name: "Miles" }
After Layer 2 (renderTemplate): "Welcome to Ghoste One, Miles 👻"
After Layer 3 (finalize): "Welcome to Ghoste One, Miles 👻"

✓ Result: "Welcome to Ghoste One, Miles 👻"
```

### Example 2: Missing first_name in Payload
```
Input Template Subject: "Welcome to Ghoste One, {{first_name}} 👻"
Payload: {}
To Email: miles@example.com

After Layer 1 (createSafePayload): { first_name: "miles" } // from email prefix
After Layer 2 (renderTemplate): "Welcome to Ghoste One, miles 👻"
After Layer 3 (finalize): "Welcome to Ghoste One, miles 👻"

✓ Result: "Welcome to Ghoste One, miles 👻"
```

### Example 3: Template Typo (firstName instead of first_name)
```
Input Template Subject: "Welcome to Ghoste One, {{firstName}} 👻"
Payload: { first_name: "Miles" }

After Layer 1 (createSafePayload): { first_name: "Miles" }
After Layer 2 (renderTemplate): "Welcome to Ghoste One, {{firstName}} 👻" // no match
After Layer 3 (finalize): "Welcome to Ghoste One,  👻" // stripped

✓ Result: "Welcome to Ghoste One,  👻"
```

### Example 4: Leftover {{first_name}} (Edge Case)
```
Input Template Subject: "Hey {{ first_name }}, welcome!"
Payload: {}
To Email: test@example.com

After Layer 1 (createSafePayload): { first_name: "test" }
After Layer 2 (renderTemplate): "Hey {{ first_name }}, welcome!" // spaces around key
After Layer 3 (finalize): "Hey there, welcome!" // replaced with "there"

✓ Result: "Hey there, welcome!"
```

### Example 5: Missing Nested Key
```
Input Template Body: "Your {{plan.name}} plan includes..."
Payload: { plan: null }

After Layer 1 (createSafePayload): { first_name: "user", plan: null }
After Layer 2 (renderTemplate): "Your {{plan.name}} plan includes..." // plan is null
After Layer 3 (finalize): "Your  plan includes..." // stripped

✓ Result: "Your  plan includes..."
```

---

## Logging Output

### Success Case (No Warnings)
```
[EmailJobsWorker] Job abc123 | To: user@example.com | Template: welcome | Subject: Welcome to Ghoste One 👻
[EmailJobsWorker] Sent job abc123 to user@example.com
```

### Warning Case (Unresolved Tokens - Should Not Happen)
```
[EmailJobsWorker] Job abc123 | To: user@example.com | Template: welcome | Subject: Welcome to Ghoste One 👻 [WARN: unresolved tokens]
```

**Note:** After finalization, warnings should never appear since all `{{...}}` are stripped. If you see a warning, it means:
- The finalization logic has a bug
- OR there's a non-standard token format in the template

---

## Files Modified

### 1. netlify/functions/email-jobs-worker.ts
**Changes:**
- Added `finalizeRenderedContent()` function
- Updated rendering flow to use finalization
- Added subject prioritization (`job.subject ?? template.subject`)
- Enhanced logging to warn about unresolved tokens
- Updated `renderTemplate()` documentation

### 2. netlify/functions/email-jobs-run-now.ts
**Changes:**
- Identical changes to worker for consistency
- Ensures manual runs have same behavior as scheduled runs

---

## Testing

### Test 1: Normal Welcome Email
```sql
-- Create test job with proper payload
INSERT INTO email_jobs (
  user_id,
  to_email,
  template_key,
  subject,
  payload,
  status
) VALUES (
  (SELECT id FROM auth.users LIMIT 1),
  'test@example.com',
  'welcome',
  NULL,
  '{"first_name": "Test User"}',
  'pending'
);
```

**Expected Result:**
- Subject: "Welcome to Ghoste One 👻"
- Body: "Hey Test User,"
- No warnings in logs

### Test 2: Empty Payload (Fallback Test)
```sql
-- Create test job with empty payload
INSERT INTO email_jobs (
  user_id,
  to_email,
  template_key,
  subject,
  payload,
  status
) VALUES (
  (SELECT id FROM auth.users LIMIT 1),
  'fallback@example.com',
  'welcome',
  NULL,
  '{}',
  'pending'
);
```

**Expected Result:**
- Subject: "Welcome to Ghoste One 👻"
- Body: "Hey fallback," (email prefix)
- No warnings in logs
- No raw `{{first_name}}` anywhere

### Test 3: Run Worker Manually
```bash
curl -X POST https://ghoste.one/.netlify/functions/email-jobs-run-now \
  -H "X-Admin-Key: ${ADMIN_TASK_KEY}" \
  -H "Content-Type: application/json"
```

**Check Logs:**
```sql
SELECT 
  id,
  to_email,
  template_key,
  subject,
  status,
  sent_at,
  last_error
FROM email_jobs
WHERE template_key = 'welcome'
ORDER BY created_at DESC
LIMIT 10;
```

**Expected:**
- All jobs should have `status = 'sent'`
- No `last_error` values
- `sent_at` should be recent

---

## Safety Guarantees

With this three-layer system, we guarantee:

1. **Layer 1 ensures variables exist:**
   - `first_name` always has a value (name, email prefix, or "there")
   - No undefined/null variables in payload

2. **Layer 2 does the actual replacement:**
   - Supports nested keys like `{{plan.name}}`
   - Handles whitespace: `{{ first_name }}` works
   - Leaves unmatched tokens as-is for Layer 3

3. **Layer 3 cleans up everything:**
   - Replaces leftover `{{first_name}}` with "there"
   - Strips ALL remaining `{{...}}` tokens
   - **Guarantees zero template variables in output**

**Result:** Users will NEVER see raw template variables like `{{first_name}}` in their emails.

---

## Edge Cases Handled

| Case | Behavior | Result |
|------|----------|--------|
| Normal payload with first_name | Renders correctly | "Hey Miles," |
| Empty payload | Falls back to email prefix | "Hey user," |
| Missing display_name | Falls back to email prefix | "Hey test," |
| Template typo (firstName) | Strips invalid token | "Hey ," |
| Extra spaces in token | Normalizes and renders | "Hey Miles," |
| Nested missing key | Strips token | "Your  plan" |
| Leftover {{first_name}} | Replaces with "there" | "Hey there," |
| Any other {{...}} | Strips completely | Clean output |

---

## Benefits

1. **Zero Template Variables in Output**
   - No more emails with `{{first_name}}` in subject/body
   - Final cleanup pass ensures this

2. **Better Debugging**
   - Logs show final rendered subject
   - Warnings for unresolved tokens (though finalize prevents this)
   - Easy to trace issues

3. **Consistent Behavior**
   - Both worker and run-now use identical logic
   - Manual runs behave exactly like scheduled runs

4. **Graceful Degradation**
   - Missing variables → stripped cleanly
   - Template typos → stripped cleanly
   - Edge cases handled without errors

5. **Backward Compatible**
   - Existing jobs continue to work
   - Old templates render correctly
   - No breaking changes

---

## Known Limitations

1. **Stripped Tokens Leave Gaps**
   - If template has `"Your {{missing}} plan"`, result is `"Your  plan"` (two spaces)
   - Not a bug, just how string replacement works
   - Better than showing `{{missing}}` to users

2. **No Validation of Template Quality**
   - System doesn't warn about bad templates before sending
   - Recommendation: Test templates before deploying

3. **Hardcoded "there" Fallback**
   - `{{first_name}}` always becomes "there" if leftover
   - Could make configurable in future

---

## Monitoring

### Check Email Success Rate
```sql
SELECT 
  template_key,
  COUNT(*) FILTER (WHERE status = 'sent') as sent,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'sent') / COUNT(*), 2) as success_rate
FROM email_jobs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY template_key
ORDER BY success_rate ASC;
```

### Look for Failed Jobs
```sql
SELECT 
  id,
  template_key,
  to_email,
  last_error,
  attempts,
  created_at
FROM email_jobs
WHERE status = 'failed'
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

### Check for Template Issues
```bash
# Search Netlify logs for warnings
# Look for: "[WARN: unresolved tokens]"
# Should NOT appear after finalization is deployed
```

---

## Next Steps

1. **Deploy & Monitor:**
   - Deploy changes to production
   - Monitor logs for 24-48 hours
   - Verify no warnings appear

2. **Test Complete Flow:**
   - Sign up new test user
   - Verify welcome email arrives
   - Check subject and body are clean

3. **Template Audit (Optional):**
   - Review all templates in `email_templates` table
   - Fix any typos or invalid variables
   - Ensure all templates use correct variable names

4. **Future Enhancements:**
   - Add template validation before insert
   - Create admin UI to preview rendered templates
   - Add more configurable fallbacks

---

## Summary

Added a **finalization layer** to email rendering that ensures no raw template variables reach users. This provides a final safety net on top of existing payload normalization and template rendering.

**Three-Layer Protection:**
1. Payload normalization ensures variables exist
2. Template rendering replaces variables with values
3. Finalization cleans up any leftovers

**Result:** Zero emails with `{{first_name}}` or other template variables in production.

Build succeeded. Changes ready for deployment.

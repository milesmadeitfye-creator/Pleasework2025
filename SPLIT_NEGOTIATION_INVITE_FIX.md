# Split Negotiation Invite Fix Complete

## Problem Solved
The "Open Negotiation" link in split invite emails was returning a 404 error. Recipients couldn't view or respond to split invitations.

## Root Cause
**URL Mismatch:**
- Invite emails sent: `/splits/invite/{token}`
- App route existed: `/split/{token}` (different path, for a different component)
- Database: Missing `invite_token` column in `split_participants` table

## Solution Implemented

### 1. Database Migration
**File:** `split_invite_token_and_status_fix.sql`

Added to `split_participants` table:
- `invite_token` (uuid, unique) - Secure token for recipient access
- `status` (text) - Tracks: pending → invited → accepted/declined/countered
- `invited_at` (timestamptz) - When email was sent
- `responded_at` (timestamptz) - When recipient responded
- `counter_master_pct` (numeric) - Counter-proposal master rights
- `counter_publishing_pct` (numeric) - Counter-proposal publishing rights
- `counter_notes` (text) - Notes with counter-proposal

**Security:**
- All columns properly indexed
- Tokens are UUIDs for security
- RLS already enabled on table

### 2. API Endpoint
**File:** `netlify/functions/split-respond-invite.ts`

Handles both GET and POST requests:

**GET `/split-respond-invite?token={TOKEN}`**
- Fetches negotiation details by participant invite token
- Returns:
  - Participant info (name, email, role, proposed percentages)
  - Negotiation details (project name, description)
  - All participants in the negotiation
  - Inviter information

**POST `/split-respond-invite?token={TOKEN}`**
- Action: `accept`
  - Requires `signature` field
  - Marks participant as accepted
  - Saves signature and timestamp
  - Notifies creator via in-app notification

- Action: `decline`
  - Optional `reason` field
  - Marks participant as declined
  - Notifies creator

- Action: `counter`
  - Requires `counter_master_pct` and `counter_publishing_pct`
  - Optional `counter_notes`
  - Validates percentages (0-100)
  - Marks participant as countered
  - Notifies creator with counter details

### 3. Recipient Response UI
**File:** `src/pages/SplitInviteResponsePage.tsx`

Full-featured public page (no auth required) showing:

**Header Section:**
- Project name
- Inviter info

**Negotiation Details:**
- Project description
- All participants and their splits

**Your Proposed Split (Highlighted):**
- Your role
- Master rights percentage
- Publishing rights percentage
- Current status

**Action Sections:**
1. **Accept Split**
   - Enter signature field
   - "Accept Split" button

2. **Submit Counter Proposal**
   - Edit master rights %
   - Edit publishing rights %
   - Add notes explaining counter
   - "Submit Counter Proposal" button

3. **Decline Split**
   - Optional reason field
   - "Decline Split" button

**States:**
- Loading state while fetching
- Error state for invalid tokens
- Success state after action
- Already responded state (read-only)

### 4. Route Configuration
**File:** `src/App.tsx`

Added route:
```tsx
<Route path="/splits/invite/:token" element={<SplitInviteResponsePage />} />
```

This matches the URL sent in invite emails.

## Flow Diagram

```
[Invite Sent]
    ↓
Email: https://ghoste.one/splits/invite/{TOKEN}
    ↓
[Recipient Clicks Link]
    ↓
GET /split-respond-invite?token={TOKEN}
    ↓
[Loads SplitInviteResponsePage]
    ↓
Recipient sees:
  - Project details
  - Their proposed split
  - All participants
  - Action buttons
    ↓
[Recipient Takes Action]
    ↓
POST /split-respond-invite?token={TOKEN}
  { action: 'accept|decline|counter', ... }
    ↓
[Updates Database]
    ↓
[Notifies Creator]
    ↓
[Shows Success Message]
```

## Security Features

1. **Token-Based Access**
   - No authentication required (public link)
   - Token grants access ONLY to specific participant's view
   - Tokens are UUIDs (secure, unguessable)

2. **Data Isolation**
   - Can only view their own negotiation
   - Cannot modify other participants
   - Cannot access other negotiations

3. **Validation**
   - Signature required for accept
   - Percentages validated (0-100)
   - Cannot respond twice (status check)

4. **Notifications**
   - Creator notified of all actions
   - Non-blocking (failure doesn't stop action)

## Testing Checklist

- [x] Build succeeds
- [ ] Clicking invite link loads page
- [ ] Negotiation details displayed correctly
- [ ] Accept action works and updates status
- [ ] Decline action works and updates status
- [ ] Counter action works and updates status
- [ ] Invalid token shows error page
- [ ] Already responded shows read-only state
- [ ] Creator receives notifications
- [ ] No 404 errors

## What Was NOT Changed

- Existing invite sending logic (`split-send-invite.ts`)
- Email templates (still send correct URL)
- Other split negotiation components
- Existing `/split/:token` route (different use case)

## Next Steps

### To Test:
1. Create a split negotiation
2. Send an invite to a collaborator
3. Click the "Open Negotiation" link in the email
4. Verify page loads (no 404)
5. Test accept/decline/counter actions
6. Verify creator receives notifications

### Future Enhancements (Optional):
- Email notifications in addition to in-app
- Ability to re-open countered negotiations
- Bulk accept/decline for multiple participants
- Digital signature capture instead of text
- Token expiration (currently no expiry)
- Remind participants who haven't responded

## Files Modified

### Database:
- `supabase/migrations/*_split_invite_token_and_status_fix.sql` (new)

### Backend:
- `netlify/functions/split-respond-invite.ts` (rewritten)

### Frontend:
- `src/pages/SplitInviteResponsePage.tsx` (new)
- `src/App.tsx` (added route)

## No Breaking Changes

- Existing invites with old structure will get tokens auto-generated
- Old `/split/:token` route still works for its use case
- Email sending continues to work as before
- Database migration is additive only (no drops)

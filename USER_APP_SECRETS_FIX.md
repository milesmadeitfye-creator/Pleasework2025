# Fix: Netlify Build Error - user_app_secrets Integration

## Issue Fixed

**Error:** Netlify build failing with bundling error:
```
ERROR: No matching export in "netlify/functions/_lib/appSecrets.ts" for import "upsertAppSecret"
```

## Solution Applied

Updated `netlify/functions/_lib/appSecrets.ts` to support BOTH:
- **Global secrets** (for system-wide keys like Apple Music credentials)
- **Per-user secrets** (for user-specific Meta Pixel IDs, CAPI tokens, etc.)

## Files Modified

### 1. `netlify/functions/_lib/appSecrets.ts`

**Added Functions:**
- `upsertAppSecret(userId, key, value)` - Persists to `user_app_secrets` table
- `getAppSecret(userId, key)` - Retrieves single user secret
- `getAppSecrets(userId, keys)` - Retrieves multiple user secrets
- `getServiceClient()` - Helper with fallback env var support

**Kept Existing Functions:**
- `getAdminSupabase()` - Original admin client
- `upsertGlobalSecret(key, value)` - For global app secrets
- `getGlobalSecret(key)` - For global app secrets
- `getGlobalSecrets(keys)` - For global app secrets

### 2. `netlify/functions/meta-save-config.ts`

**No changes needed** - already imports and uses `upsertAppSecret` correctly:
```typescript
import { upsertAppSecret } from './_lib/appSecrets';

// Lines 371-384
await upsertAppSecret(userId, 'META_PIXEL_ID', pixelId);
await upsertAppSecret(userId, 'META_CAPI_ACCESS_TOKEN', token);
await upsertAppSecret(userId, 'META_CAPI_ENABLED', 'true');
await upsertAppSecret(userId, 'META_TEST_EVENT_CODE', code);
```

## Database Schema

The `user_app_secrets` table already exists with schema:
```sql
CREATE TABLE public.user_app_secrets (
  user_id uuid NOT NULL,
  key text NOT NULL,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

ALTER TABLE public.user_app_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_app_secrets FROM anon, authenticated;
```

## Implementation Details

### Environment Variable Fallbacks

The `getServiceClient()` function supports multiple env var names:
- `SUPABASE_URL` (primary)
- `VITE_SUPABASE_URL` (fallback)
- `SUPABASE_SERVICE_ROLE_KEY` (primary)
- `SUPABASE_SERVICE_KEY` (fallback)
- `VITE_SUPABASE_SERVICE_ROLE_KEY` (fallback)

### Error Handling

All functions validate inputs and throw descriptive errors:
- Missing userId
- Missing key
- Invalid value type
- Supabase operation failures

### Security

- All user secrets operations use service-role client
- No secrets logged to console
- RLS prevents client-side access
- Per-user isolation via `user_id` PK

## Build Status

✅ **Build successful** (30.15s)
✅ No TypeScript errors
✅ No bundling errors
✅ All Netlify functions compile correctly

## Next Steps

1. Deploy to production
2. Test Meta configuration save flow:
   - Studio → Ad Campaigns → Settings
   - Configure Pixel ID and CAPI token
   - Verify saves to both `meta_credentials` AND `user_app_secrets`
3. Verify Smart Link tracking continues to work

## Testing Commands

**Test user secret write:**
```bash
# From Netlify function context
await upsertAppSecret(userId, 'TEST_KEY', 'test_value');
```

**Test user secret read:**
```bash
const value = await getAppSecret(userId, 'TEST_KEY');
console.log(value); // 'test_value'
```

**Test multiple user secrets:**
```bash
const secrets = await getAppSecrets(userId, ['META_PIXEL_ID', 'META_CAPI_ACCESS_TOKEN']);
console.log(secrets);
// { META_PIXEL_ID: '123456', META_CAPI_ACCESS_TOKEN: 'abc...' }
```

## Rollback (If Needed)

If issues arise, the changes are isolated to `appSecrets.ts`. The original global secret functions remain unchanged, so no breaking changes to existing code.

---

**Status:** ✅ COMPLETE - Ready for production deployment

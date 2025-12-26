# AI Debug Setup Authentication Flow

## Endpoint
`GET /.netlify/functions/ai-debug-setup`

## Authentication Method
**Supabase Auth** (NOT Netlify Identity)

## Request Flow

1. **Client sends request** with Supabase session token:
   ```javascript
   const session = await supabase.auth.getSession();
   const token = session.data.session?.access_token;

   fetch('/.netlify/functions/ai-debug-setup', {
     headers: { Authorization: `Bearer ${token}` }
   });
   ```

2. **Server validates token**:
   - Extract Authorization header
   - Verify format starts with "Bearer "
   - Call `supabaseAdmin.auth.getUser(token)` to validate
   - Extract `user.id` from validated user

3. **Server calls RPC**:
   ```typescript
   const { data, error } = await supabaseAdmin.rpc('ai_get_setup_status', {
     p_user_id: userId
   });
   ```

4. **Server returns response**:
   ```json
   {
     "ok": true,
     "userId": "uuid-here",
     "setupStatus": { ... },
     "supabaseUrlUsed": "knvvdeom...",
     "hasServiceRoleKey": true,
     "timestamp": "2025-12-26T..."
   }
   ```

## Error Responses

### Missing Authorization Header
```json
{
  "ok": false,
  "error": "missing_auth"
}
```

### Invalid Format (not Bearer token)
```json
{
  "ok": false,
  "error": "invalid_auth_format"
}
```

### Invalid/Expired Token
```json
{
  "ok": false,
  "error": "invalid_token",
  "details": "JWT expired" // or other error message
}
```

### RPC Execution Error
```json
{
  "ok": false,
  "error": "rpc_error",
  "rpcErrorMessage": "...",
  "rpcErrorCode": "...",
  "userId": "uuid-here"
}
```

## Security Notes

- Uses Supabase service role key to validate tokens
- Does NOT rely on Netlify Identity context
- Only returns data for the authenticated user
- No secrets exposed in responses (URLs are truncated)
- Comprehensive logging for debugging

## Testing

Click the "Debug" button in Ghoste AI chat header, which:
1. Gets current Supabase session
2. Extracts access token
3. Fetches endpoint with Bearer token
4. Displays JSON response in new window

## Logs to Check

In Netlify function logs, look for:
```
[ai-debug-setup] Request received
[ai-debug-setup] Supabase admin client created successfully
[ai-debug-setup] Extracted token, verifying with Supabase...
[ai-debug-setup] User authenticated successfully: <uuid>
[ai-debug-setup] Fetching setup status for user: <uuid>
```

If auth fails, you'll see:
```
[ai-debug-setup] Auth verification failed: { hasError: true, errorMessage: "...", ... }
```

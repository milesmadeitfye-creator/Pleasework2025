# Ghoste Internal — Deploy Guide

Everything for `internal.ghoste.one` lives in `/internal/`. It's a standalone Vite app with its own Netlify site, its own Netlify functions, and its own build — but it shares the same Supabase project as `ghoste.one`.

---

## 1. Apply the database migration

The migration `supabase/migrations/20260414000000_admin_users.sql` creates:

- `admin_users` — allowlist for internal access (RLS locked to `service_role`)
- `admin_action_logs` — audit trail for every privileged action (RLS locked to `service_role`)
- Seeds `milesdorre5@gmail.com` as the super admin

Run from the **repo root**:

```bash
npm run supabase:push
```

Then, to add additional admins:

```sql
insert into admin_users (email, role) values
  ('teammate@ghoste.one', 'admin'),
  ('support@ghoste.one', 'support')
on conflict (email) do update set role = excluded.role, is_active = true;
```

Roles: `super_admin` | `admin` | `support` (Billing page is hidden from `support`).

---

## 2. Create the Netlify site

In the Netlify dashboard:

1. **Add new site → Import from Git** → pick the same repo as `ghoste.one`.
2. **Base directory**: `internal`
3. **Build command**: `npm ci --no-audit --no-fund && npm run build` (already in `internal/netlify.toml`)
4. **Publish directory**: `internal/dist` (also in toml)
5. **Branch to deploy**: `main`

Because `base = "internal"`, Netlify only picks up `internal/netlify.toml`, `internal/src/**`, and `internal/netlify/functions/**`. The root `ghoste.one` site is unaffected.

---

## 3. Environment variables (Netlify dashboard → Site settings → Environment)

Set these on the **internal** site only:

| Variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://knvvdeomfncujsiiqxsg.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | (same anon key as ghoste.one) |
| `VITE_PUBLIC_APP_URL` | `https://ghoste.one` |
| `SUPABASE_URL` | same as above |
| `SUPABASE_ANON_KEY` | same as above |
| `SUPABASE_SERVICE_ROLE_KEY` | **service-role key** — do NOT set this on the public ghoste.one site |
| `ADMIN_SESSION_SECRET` | 96-char random hex (see below) |

Generate the secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

> **Security note:** the service-role key bypasses RLS. Only the internal site's Netlify functions ever see it. The public ghoste.one site must never carry it.

---

## 4. DNS — point `internal.ghoste.one` at the Netlify site

1. In the Netlify dashboard for the internal site → **Domain management → Add custom domain** → `internal.ghoste.one`.
2. In your DNS provider (Cloudflare / Vercel DNS / whatever hosts `ghoste.one`), add a CNAME:

   ```
   internal   CNAME   <your-site-name>.netlify.app
   ```

3. Wait for propagation (usually <5 min). Netlify auto-provisions TLS via Let's Encrypt.

---

## 5. Supabase Auth — allow the new redirect URL

Supabase Dashboard → **Authentication → URL Configuration → Redirect URLs**, add:

```
https://internal.ghoste.one/?access=ghoste
http://localhost:5173/?access=ghoste
```

Magic-link emails won't work without this.

---

## 6. Smoke test

1. Visit `https://internal.ghoste.one` → should show a blank black screen (stealth).
2. Visit `https://internal.ghoste.one/?access=ghoste` → login form appears.
3. Enter `milesdorre5@gmail.com` → magic link sent → click it → redirected back → verified as `super_admin` → Overview page loads with live Supabase counts.
4. Try logging in with a non-admin email → session is immediately killed and you're redirected to `https://ghoste.one`.

---

## 7. Local development

```bash
cd internal
cp .env.example .env.local   # then fill in real values (never commit)
npm install
npm run dev                  # http://localhost:5173/?access=ghoste
```

To run the Netlify functions locally:

```bash
cd internal
npx netlify dev
```

---

## Security isolation — what guarantees the public site can't reach admin endpoints

- Root `netlify.toml` uses `functions = "netlify/functions"` (not recursive). Netlify only bundles `/netlify/functions/*` for the public site, so `/internal/netlify/functions/*` are **physically absent** from ghoste.one deployments.
- `admin_users` and `admin_action_logs` have RLS policies `using (false) with check (false)` for everyone, plus explicit `revoke all` from `anon` and `authenticated`. Only the `service_role` key (held only by the internal site's functions) can read/write them.
- Every admin function calls `requireAdmin(event)` — validates the Supabase JWT, then re-checks `admin_users.is_active = true`. The client's role claim is **never** trusted.
- The frontend shows nothing until `?access=ghoste` is present, and `<meta name="robots" content="noindex, nofollow">` keeps it out of crawlers.

---

## What's built (Phase 1)

| Module | Status |
| --- | --- |
| Stealth auth + magic link + admin gate | ✅ |
| App shell (sidebar, topbar, ⌘K command palette) | ✅ |
| Company Overview (live Supabase counts + health + activity feed) | ✅ |
| User Control Center (paginated list, search, grant/revoke credits, change plan, suspend) | ✅ |
| AI Monitor | placeholder (Phase 2) |
| Ad Creatives (Claude → Sora → Remotion) | placeholder (Phase 3) |
| Meta Ads Control | placeholder (Phase 3) |
| Distribution | placeholder (Phase 4) |
| Links | placeholder (Phase 4) |
| Billing | placeholder (Phase 2) |
| Errors & Logs | placeholder (Phase 4) |

When you want to keep going, point me at a phase (e.g. "build phase 2 AI Monitor") and I'll wire it to the existing `ghoste-ai` Netlify function's logs, the `ai_action_audit_logs` table, and add replay/inject controls.

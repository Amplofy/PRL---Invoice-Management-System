# PRL-EOMS Production Deployment

Frontend on Netlify, API on Render, database + auth on Supabase.
Repo is already on GitHub, so both Netlify and Render connect to it directly.

## 0. Prerequisites

- GitHub repo: `abdulmoizliaquatali-create/Invoice-Management-System` (pushed)
- Accounts: netlify.com, render.com, supabase.com (free tiers work)

## 1. Supabase (database + auth)

1. Create a project at supabase.com — pick region closest to Pakistan
   (Singapore or Mumbai) for lowest latency.
2. SQL Editor → run these in order:
   1. `supabase/schema.sql` (tables)
   2. `supabase/seed.sql` (roles, permissions, settings)
   3. `supabase/rls-hardening.sql` (locks anon access; API is the only data path)
3. Create auth users: Authentication → Users → Add user.
   Create one user per real account, then link each to an EOMS role by
   inserting into `public.users` (role, auth_id) via SQL editor.
4. Collect values for later steps:
   - Project URL → `SUPABASE_URL`
   - Settings → API → `anon` key → `SUPABASE_ANON_KEY` (frontend + backend)
   - Settings → API → `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (backend ONLY)
   - Settings → API → JWT Secret → `SUPABASE_JWT_SECRET` (backend)

## 2. Render (backend API)

1. New → Blueprint → connect the GitHub repo → Render reads `render.yaml`.
2. Fill the `sync: false` variables when prompted:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`,
     `SUPABASE_ANON_KEY`
   - `CORS_ORIGIN`: after step 3 you know the Netlify URL — use
     `https://<your-netlify-site>.netlify.app` (no trailing slash).
     Update it after the first Netlify deploy and the service redeploys.
3. Deploy. Note the service URL, e.g. `https://prl-eoms-backend.onrender.com`.
   Verify: `curl https://<render-url>/api/health` → `{"status":"ok"}`.

## 3. Netlify (frontend SPA)

1. Add new site → Import from Git → pick the repo.
2. `netlify.toml` at the repo root is auto-detected (build + SPA redirects).
3. Site configuration → Environment variables:
   - `VITE_API_URL` = `https://<render-url>` (NO trailing slash, NO `/api`)
   - `VITE_SUPABASE_URL` = `https://<project>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = anon key
4. Deploy. Netlify URL example: `https://<site>.netlify.app`.

## 4. Close the loop

1. Set `CORS_ORIGIN` on Render to the final Netlify URL → save → redeploy.
2. Optional custom domains on both platforms (HTTPS is automatic).
3. Log in with a Supabase auth user (not demo mode) and smoke-test:
   invoices list → create → reports → import wizard.

## Environment variable summary

| Variable | Where | Value |
|---|---|---|
| `SUPABASE_URL` | Render + Netlify (`VITE_` prefixed on Netlify) | project URL |
| `SUPABASE_ANON_KEY` | Render + Netlify (`VITE_` prefixed) | anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Render only — NEVER the frontend | service key |
| `SUPABASE_JWT_SECRET` | Render only | JWT secret |
| `CORS_ORIGIN` | Render only | Netlify site URL |
| `VITE_API_URL` | Netlify only | Render URL, no trailing slash |
| `RESEND_API_KEY` | Render only (optional) | enables email sends |

## Notes and recommendations

- Render's free plan sleeps after inactivity (~50s cold start on first hit).
  Use the `starter` plan (already set in `render.yaml`) to avoid cold starts.
- The service-role key bypasses RLS — keep it in Render env vars only.
  `rls-hardening.sql` guarantees the exposed anon key cannot read tables.
- Email (Resend) is optional; the app runs without it.
- Demo mode (sessionStorage flag) still works on production builds — it is a
  client-side escape hatch and touches no real data.

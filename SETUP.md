# Pacific Realty Solution Ltd setup guide

This project is a static website. The pages and assets are in `site/`; the build generates `site/config.js` from environment variables. Do not put database credentials or private keys in the browser.

## 1. Cloudflare Workers Builds settings

This repository deploys the static website through a **Worker with static assets**, not a Pages project. The Wrangler manifest `wrangler.jsonc` tells `npx wrangler deploy` to publish the `site/` directory. The account and admin pages load `config.js` from that same directory.

In the Cloudflare dashboard, open **Workers & Pages**, choose the `pacific-realty-site` Worker, then open **Settings -> Build**:

- **Root directory:** the folder containing `scripts/`, `site/`, `supabase/`, and `wrangler.jsonc`. If the repository root contains these, use `/`.
- **Build command:** `node scripts/build-config.mjs`
- **Deploy command:** `npx wrangler deploy`

Under **Build variables and secrets** for the Worker build, add these exact names:

| Variable name | Value |
|---|---|
| `SUPABASE_URL` | Supabase project URL, for example `https://your-project-id.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase public anon/publishable key |
| `WHATSAPP_NUMBER` | WhatsApp number including country code, digits only, such as `234...` |

Add them for the production build, and to preview builds too if you deploy previews. All three are required by the build. These **build variables** are available to `scripts/build-config.mjs`; they are not Worker runtime bindings. `SUPABASE_ANON_KEY` is embedded into the public site config, so use only the public anon/publishable key. Never use a `service_role` or `sb_secret_` key.

The “Variables cannot be added to a Worker that only has static assets” message refers to **runtime** variables. Do not add these under **Settings -> Variables & Secrets** for the running Worker. Add them under **Settings -> Build -> Build variables and secrets** instead.

## 2. Build and redeploy

After adding the settings:

1. Save the Worker build settings and build variables.
2. Retry the latest build or push a commit to the connected branch.
3. Check the build log: the build command must finish successfully before the deploy command runs.
4. Test the home page, `/account.html`, and `/admin.html` on the deployed Worker domain.

The build fails before changing `site/config.js` if a variable is missing or invalid. Cloudflare builds from a fresh checkout, and `npx wrangler deploy` publishes the `site/` directory specified in `wrangler.jsonc`; that directory contains `config.js` and `admin.html` at `/admin.html`.

## 3. Supabase project and existing database

The website uses the existing schema in `supabase/schema.sql`. It expects these tables:

- `public.owners` and `public.profiles`
- `public.properties`, `public.saved_properties`, and `public.enquiries`
- The `public.is_owner()` function, the new-user profile trigger, and the `property-images` storage bucket

The SQL file enables RLS and grants admin changes only to accounts listed in `owners`. It does not make ordinary client accounts administrators. **If your Supabase project already contains tables or real data, do not reset the project or blindly rerun SQL.** First compare the existing tables, functions, triggers, storage bucket, and policies with the schema. Back up the project before applying any needed migration. Do not disable RLS or add broad policies to fix a login problem.

For a new Supabase project only:

1. Create the project in Supabase.
2. In **SQL Editor**, run `supabase/schema.sql`.
3. In **Project Settings -> API**, copy the Project URL and the public anon/publishable key into the Workers Builds build variables above. Do not copy the service-role/secret key.

The repository cannot confirm whether your hosted Supabase project has this schema installed or whether its current Auth settings match these instructions. If sign-in works but profile/listing/admin requests fail, check the browser message and the Supabase table/function/policy setup before changing policies.

## 4. Supabase email authentication and redirects

In Supabase, open **Authentication -> Providers -> Email** and make sure email/password sign-up is enabled. If email confirmation is enabled, new users must click the confirmation email before signing in. The account page handles confirmation links, sign-in, password reset, and password updates.

Under **Authentication -> URL Configuration**:

- Set **Site URL** to the live website origin, for example `https://your-domain.example`.
- Add `https://your-domain.example/account.html` to **Redirect URLs**.
- If you use a Cloudflare preview hostname, add its account-page URL too.
- For local development, add `http://localhost:8000/account.html` and, if used, `http://127.0.0.1:8000/account.html`.

Replace the example domain with the exact deployed domain, including `https://`. Before inviting real clients, configure a production SMTP sender under **Authentication -> SMTP Settings**; Supabase's default sender is rate-limited and intended for testing.

## 5. Give the owner admin access

First create your account at `https://your-domain.example/account.html` and finish email confirmation. Then, in Supabase **SQL Editor**, replace the example address with that same confirmed account email and run:

```sql
insert into public.owners (user_id)
select id
from auth.users
where lower(email) = lower('owner@example.com')
on conflict (user_id) do nothing;
```

Open `/admin.html` and sign in with that account. A signed-in user not listed in `public.owners` remains denied, and the database RLS policies still decide which rows the browser can read or change.

## 6. Local development

Open a terminal in the project root (the folder containing `scripts/`, `site/`, and `supabase/`). If the repository was opened from its parent directory, first enter the nested `pacific-realty-site` project folder.

1. If `.env` does not already exist, copy `.env.example` to `.env`. If it already exists, edit only missing or incorrect entries rather than replacing the file.
2. Set your Supabase Project URL, public anon/publishable key, and WhatsApp number in `.env`. Do not commit `.env`.
3. Build the site:

   ```powershell
   node --env-file=.env scripts/build-config.mjs
   ```

4. Serve the `site` folder on `localhost:8000`, for example with VS Code Live Server pointed at `site`, or with Python:

   ```powershell
   python -m http.server 8000 --directory site
   ```

5. Open `http://localhost:8000/`. Use `http://localhost:8000/account.html` for the account page.

The build checks that the Supabase URL and public key are valid, rejects known secret/service-role keys, and checks the WhatsApp number. It prints no variable values and does not change `site/config.js` at all unless all checks pass.

## 7. Contact and WhatsApp behavior

The existing website enquiry/contact links and property visit links continue to use WhatsApp and the existing email/form links. `WHATSAPP_NUMBER` supplies the WhatsApp destination. The `enquiries` table and dashboard tab exist, but the contact forms are not currently wired to insert enquiries into that table or send email through a server-side function; that requires a separate backend feature.

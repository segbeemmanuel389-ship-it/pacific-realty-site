# Pacific Realty Solution Ltd - setup guide (for beginners)

This folder is your website plus the database setup for **client sign-up** and the **admin dashboard**.
Do the steps in order. Nothing here needs coding. Everything is free to start.

```
site/                 <- the website (this is what Netlify publishes)
  index.html          main website
  account.html        client sign-up / sign-in / saved properties
  admin.html          admin dashboard (owner only)
  site-db.js          makes the main website read listings from the database
  assets/             styles, scripts, logo, and your 15 starter listings + photos
supabase/schema.sql   the database (paste into Supabase once)
scripts/build-config.mjs   copies your public settings into the site on Netlify
netlify.toml          tells Netlify how to publish
.env.example          the NAMES of the settings you will add in Netlify
```

## Step 1 - Create the database (Supabase)
1. Go to supabase.com, create a free account, click **New project**. Choose a name, a strong database password (save it), and the region closest to Nigeria.
2. When the project is ready open **SQL Editor -> New query**.
3. Open `supabase/schema.sql`, copy **everything**, paste it, press **Run**. You should see "Success".
4. Go to **Project Settings -> API**. Copy two things:
   - **Project URL** (looks like `https://abcdxyz.supabase.co`)
   - **anon public key** (a long text). This key is meant to be public.
   Do **not** copy or share the `service_role` key anywhere in this website.

## Step 2 - Put the website online (Netlify)
1. Go to netlify.com and sign up. Click **Add new site -> Import an existing project** (connect GitHub) **or** use **Deploy manually** and drag this whole folder in.
   - Easiest with the build step: put this folder on GitHub and import it. Netlify reads `netlify.toml` automatically.
2. In Netlify open **Site configuration -> Environment variables** and add:
   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | your Project URL |
   | `SUPABASE_ANON_KEY` | your anon public key |
   | `WHATSAPP_NUMBER` | `2347065239666` (country code, no + or spaces) |
3. Click **Deploys -> Trigger deploy**. Your site opens at `something.netlify.app`.
   (If you drag-and-drop only the `site` folder instead, open `site/config.js` first and paste your URL and key between the quotes.)

## Step 3 - Tell Supabase your website address
In Supabase open **Authentication -> URL Configuration**:
- **Site URL**: your Netlify address, for example `https://pacific-realty.netlify.app`
- **Redirect URLs**: add the same address with `/account.html` at the end.
This makes the confirmation and password-reset links in emails land on your site.

## Step 4 - Make yourself the administrator
1. Open your website's `/account.html`, press **Create account**, and sign up with the email you will use as owner. Open the confirmation email and click the link.
2. In Supabase **SQL Editor** run (put your email in):
   ```sql
   insert into public.owners (user_id)
   select id from auth.users where email = 'YOUR-OWNER-EMAIL-HERE';
   ```
3. Open `/admin.html` and sign in. Only accounts in the `owners` table can change anything. Clients who sign up can **not** reach the dashboard.

## Step 5 - Load your listings
In the dashboard, the first time, you will see **"Import my current 15 listings"**. Press it once. It uploads the photos and creates the 15 listings. From then on the website shows what is in the database. Use **+ Add property** to add more, **Edit** to change, the **Available** tick to hide or show, and **Delete** to remove.

Writing descriptions: a line starting with `- ` becomes a bullet; a line ending with `:` becomes a heading.
"Highlights" are the small tags on each card, separated by commas.
The listing marked **Featured** appears in the Featured property section.

## Emails from Supabase (important before real clients sign up)
Supabase's built-in email sender is only for testing (a few emails per hour). Before launch, in **Authentication -> SMTP Settings** connect a real sender. Resend works well (resend.com): create an account, add and verify **a domain you own** (you add the DNS records they show you), create an SMTP key, and enter it there. You cannot send from a Gmail address.

## What is NOT connected yet
- The contact form and property enquiry forms still use WhatsApp / email links and the earlier form service. Saving enquiries in the database and emailing you through a Supabase Edge Function + Resend is the next step. The dashboard's **Enquiries** tab is ready and will fill up once that is built.
- Sections written directly in the page (New project, Ongoing projects, Services) are not editable from the dashboard yet.

## Security notes
- Only the public URL and anon key are in the website. Secret keys never go in these files.
- Row Level Security is switched on for every table (see `schema.sql`): visitors can only read available properties; enquiries and client data are private; only the owner can add, edit or delete listings and photos.
- The admin page is hidden from search engines, but its safety comes from the database rules, not from hiding the page.

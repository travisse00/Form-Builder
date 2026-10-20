# FormChat

Build chat-style forms, embed a chatbot widget on any website and manage responses from one dashboard.

**Live demo:** <your-vercel-url>

## Features

- Landing page with features, how-it-works and chatbot demo
- Email + password auth (Supabase Auth) with show/hide password
- Dashboard with total forms, published forms and total responses
- Create, edit, delete, publish and unpublish forms
- Form builder with text, email, multiple choice and yes/no questions
  - Reorder, delete, required toggle and live preview
  - Customise chat colour, welcome message and completion message
- Public chat-style form at `/f/<slug>` (one question at a time, validation, skip for optional questions)
- Embeddable floating chat widget (one script tag, works on desktop and mobile)
- Responses page with every submission and its timestamp
- Light and dark theme

## Tech stack

- Next.js 16 (App Router), React 19, TypeScript
- Tailwind CSS 4
- Supabase (PostgreSQL + Auth)
- lucide-react icons

## Getting started

### 1. Clone and install

```bash
git clone <your-repo-url>
cd my-form-generator
npm install
```

### 2. Create a Supabase project

Create a free project at [supabase.com](https://supabase.com). For local testing you can switch off email confirmation under **Authentication → Sign In / Providers → Email → Confirm email** (turn it back on in production).

### 3. Environment variables

Create `.env.local` in the project root:

```
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-secret-key
```

Find these in **Project Settings → API Keys**. Never commit this file or expose the secret key in the browser.

### 4. Create the database

Open the Supabase **SQL Editor** and run the following.

```sql
-- Tables
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  created_at timestamptz default now()
);

create table forms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  title text not null,
  description text,
  slug text unique not null,
  is_published boolean default false,
  welcome_message text default 'Hi! Let''s get started.',
  completion_message text default 'Thanks for your response!',
  primary_color text default '#4f46e5',
  created_at timestamptz default now()
);

create table questions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid references forms(id) on delete cascade,
  type text not null check (type in ('text','email','multiple_choice','yes_no')),
  label text not null,
  options jsonb,
  required boolean default false,
  position int not null
);

create table submissions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid references forms(id) on delete cascade,
  answers jsonb not null,
  created_at timestamptz default now()
);

-- Auto-create a profile when someone signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, new.raw_user_meta_data->>'full_name', new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Row Level Security
alter table profiles enable row level security;
alter table forms enable row level security;
alter table questions enable row level security;
alter table submissions enable row level security;

create policy "owners manage own forms" on forms
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "public read published forms" on forms
  for select to anon, authenticated
  using (is_published = true);

create policy "owners manage questions" on questions
  for all to authenticated
  using (exists (select 1 from forms where forms.id = questions.form_id and forms.owner_id = auth.uid()))
  with check (exists (select 1 from forms where forms.id = questions.form_id and forms.owner_id = auth.uid()));

create policy "public read published questions" on questions
  for select to anon, authenticated
  using (exists (select 1 from forms where forms.id = questions.form_id and forms.is_published = true));

create policy "anyone submits to published forms" on submissions
  for insert to anon, authenticated
  with check (exists (select 1 from forms where forms.id = submissions.form_id and forms.is_published = true));

create policy "owners read submissions" on submissions
  for select to authenticated
  using (exists (select 1 from forms where forms.id = submissions.form_id and forms.owner_id = auth.uid()));

create policy "read own profile" on profiles
  for select to authenticated
  using (id = auth.uid());
```

### 5. Run it

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How to use

1. Sign up and log in.
2. Click **New form**, add questions and set your colours and messages.
3. Click **Publish**. You get a public link (`/f/<slug>`) and an embed snippet.
4. View answers from the dashboard via **Responses**.

## Embedding the chatbot widget

Paste this before the closing `</body>` tag of any website:

```html
<script src="https://your-domain.com/widget.js" data-form="YOUR_FORM_SLUG" defer></script>
```

- `src` points to the deployed app's `widget.js`.
- `data-form` is the form's slug (the last part of its public link).
- The widget only appears while the form is published.

The script adds a floating button that opens the form in an iframe. It goes full screen on small phones.

## Project structure

```
app/
  page.tsx                          Landing page
  login/ signup/                    Auth pages
  dashboard/page.tsx                Form list and stats
  dashboard/forms/[id]/page.tsx     Form builder
  dashboard/forms/[id]/responses/   Submissions
  f/[slug]/page.tsx                 Public chat form
  embed/[slug]/page.tsx             Chat form used inside the widget iframe
  api/widget/[slug]/route.ts        Widget config endpoint (public)
components/
  AuthForm.tsx  ChatForm.tsx  ThemeToggle.tsx
lib/supabase/client.ts              Supabase browser client
public/widget.js                    Embeddable widget script
proxy.ts                            Route protection for /dashboard, /login, /signup
```

## Deployment (Vercel)

1. Push the repo to GitHub and import it in Vercel.
2. Add the three environment variables from step 3.
3. Deploy, then in Supabase go to **Authentication → URL Configuration** and set the **Site URL** to your Vercel URL.
4. Use your Vercel URL in the embed snippet's `src`.

## Scope notes

AI features, payments, subscriptions and advanced integrations are intentionally out of scope for this MVP.
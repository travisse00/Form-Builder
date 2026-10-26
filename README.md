# FormChat: Interactive Form Builder with Chatbot Widget

Build forms that feel like conversations, embed them on any website with one script tag, and manage everything from a dashboard.

- **Live demo:** https://form-builder-virid-pi.vercel.app/
- **Repository:** https://github.com/travisse00/Form-Builder
- **Test results:** 4 test files, 64 tests, all passing (see [Testing](#testing))

## Tech stack

| Area | Choice |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS v4, Lucide icons, light and dark themes |
| Database and auth | Supabase (Postgres, Auth, Row Level Security, Storage) |
| Email | Resend |
| Testing | Vitest |
| Hosting | Vercel |

## Features

### Form builder
- Question types: short text, email, multiple choice, dropdown, yes/no, rating, date and file upload
- Required fields, reordering, and per-question validation (length limits, error messages)
- **Conditional logic:** show a question only when an earlier answer matches a rule
- **Templates:** start from Contact, Feedback, Event registration or Job application
- **Autosave** with draft recovery after a refresh or crash
- **Live preview** that behaves exactly like the real widget
- **Reusable design presets:** save a colour and chat messages, apply them to any form
- **Duplicate** any form, with its questions and rules

### Chatbot widget
- One question at a time, with a typing indicator and progress bar
- Floating bubble or inline mode, left or right position, custom avatar and colour
- Custom welcome and completion messages
- Embed with one line:
  ```html
  <script src="https://form-builder-virid-pi.vercel.app//widget.js" data-form="YOUR-SLUG" defer></script>
  ```

### Analytics
- Views, conversation starts, completions and completion rate per form
- Charts over time and CSV export

### Notifications and integrations
- **Email notification** to the form owner on every submission (Resend)
- **Webhooks:** each submission is sent to a URL you choose, signed with an HMAC signature so the receiver can verify it came from FormChat
- Delivery logs for both emails and webhooks, so failures are visible

### Dashboard
- Search, filter by status, and sort forms (newest, oldest, A to Z, most responses)
- Per-form overview page with stats, share links, embed code and recent responses
- Responses table, with signed links for uploaded files

### Admin dashboard
- Platform overview: users, forms, submissions and a 14-day activity chart
- User management with search, suspend and reactivate, and role changes
- Audit log of admin actions and an error log
- Protected in three layers: route check, role check on every API call, and database rules

## Security

- **Row Level Security** on every table: users can only read and change their own forms, questions, responses and presets
- Public visitors never touch the database directly. Public forms load through server routes, and the public anon key has no table access
- **Server-side submission pipeline:** every submission is re-validated on the server, including conditional rules, so skipping the browser checks doesn't work
- **Session tickets:** signed, expiring tickets and a minimum-time rule reject scripted submissions
- **Rate limiting** stored in the database, so it holds across serverless instances
- **Private file storage** with signed URLs, a 5 MB limit and owner-only reads
- **Webhook safety:** HTTPS only, DNS check against private addresses, no redirects, timeouts
- Security headers set in `next.config.ts`
- Suspended accounts are blocked at both the app level and the auth level

## Getting started

### 1. Install
```bash
git clone https://github.com/travisse00/Form-Builder.git
cd Form-Builder
npm install
```

### 2. Environment variables
Create `.env.local` in the project root:

```bash
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key   # server only, never expose
RESEND_API_KEY=your-resend-key
EMAIL_FROM="FormChat <onboarding@resend.dev>"
```

| Variable | Used for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser and server Supabase client |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only routes: public forms, submissions, uploads, admin |
| `RESEND_API_KEY` / `EMAIL_FROM` | Submission notification emails |

### 3. Database
Run the SQL for the tables, policies and storage bucket in the Supabase SQL Editor. Tables:
`profiles`, `forms`, `questions`, `submissions`, `form_events`, `webhooks`, `webhook_deliveries`, `email_deliveries`, `design_presets`, `rate_limits`, `admin_audit_log`, `error_logs`.

To make yourself the first admin:
```sql
update profiles set role = 'admin' where email = 'you@example.com';
```

### 4. Run
```bash
npm run dev
```
Open http://localhost:3000.

## Testing

Tests run with Vitest. Keep `npm run dev` running in one terminal, then in another:

```bash
npm test
```

| File | What it proves |
|---|---|
| `tests/formLogic.test.ts` | Conditional logic and answer validation |
| `tests/spam.test.ts` | Session tickets and the too-fast rule |
| `tests/api.test.ts` | Server validation, rate limiting and closed admin routes |
| `tests/security.test.ts` | Users cannot read another user's forms or responses, strangers with only the public key can do nothing, and owners can reach their own data and files |

**Latest result:**
```
Test Files  4 passed (4)
     Tests  64 passed (64)
```

The security tests found real gaps in the database policies during development (public read access on forms and questions, and open analytics and storage writes). Those were fixed and are now covered by tests.

## Deployment

Deployed on Vercel. Add the five environment variables above in **Project Settings, Environment Variables**, then redeploy.

## Project structure

```
app/
  dashboard/        owner dashboard, form overview, builder, responses, analytics, integrations
  admin/            admin dashboard
  api/              submit, session, event, upload, public-form, widget, integrations, admin
components/         ChatForm, QuestionSettings, TemplatePicker, WidgetSettings, DesignPresets
lib/                formLogic, notify, ratelimit, spam, admin, audit, supabase clients
public/widget.js    the embeddable widget script
tests/              Vitest suites
proxy.ts            auth, suspended-account and admin route gating
```

## Known limitations
- Design presets store colour and chat messages. The avatar and bubble position are set per form.
- Email sending in test mode only delivers to the Resend account owner until a sending domain is verified.
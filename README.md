# TaskFlow — Project & Task Management App

A full-stack Trello/Jira-style project management app with kanban boards, team collaboration, and an analytics dashboard.


## Features

- **JWT authentication** — register/login with hashed passwords (bcrypt), protected API routes
- **Email verification (OTP)** — 6-digit codes for signup and password reset, with per-address throttling and a 10-minute expiry
- **Projects** — create projects with colors, progress bars, member management (invite by email)
- **Kanban board** — drag & drop tasks across To Do / In Progress / Review / Done (dnd-kit)
- **Tasks** — priority, due dates, assignees, labels, and threaded comments
- **Dashboard** — live stats, tasks-by-status donut chart, 7-day completion trend (Recharts), upcoming deadlines, recent activity
- **Access control** — only project owners/members can see a project; only owners can delete

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS v4, React Router 7 |
| Drag & drop | @dnd-kit/core |
| Charts | Recharts |
| Backend | Node.js, Express, Mongoose |
| Database | MongoDB (embedded via mongodb-memory-server in dev, Atlas in prod) |
| Auth | JWT (jsonwebtoken) + bcryptjs |

##For local

```bash
# Terminal 1 — API (port 5000)
cd server
npm install
npm run dev

# Terminal 2 — Frontend (port 3000)
cd client
npm install
npm run dev
```

Open http://localhost:3000, create an account, and start adding projects. 

> **No MongoDB install needed** — the server auto-starts an embedded MongoDB (data persists in `server/data/`). To use a real database, set `MONGODB_URI` in `server/.env` (e.g. a free MongoDB Atlas cluster).

## API Overview

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Status of the DB + mail transport |
| POST | `/api/auth/register` | Step 1 — validate and email a 6-digit code |
| POST | `/api/auth/register/verify` | Step 2 — check the code, create the account, return JWT |
| POST | `/api/auth/register/resend` | Re-send the signup code |
| POST | `/api/auth/forgot-password` | Email a password-reset code |
| POST | `/api/auth/reset-password` | Verify the code and set a new password |
| POST | `/api/auth/demo` | Throwaway guest account seeded with a sample project |
| POST | `/api/auth/login` | Login, returns JWT |
| GET | `/api/auth/me` | Current user |
| GET/POST | `/api/projects` | List / create projects |
| PUT/DELETE | `/api/projects/:id` | Update / delete project |
| POST | `/api/projects/:id/members` | Add member by email |
| GET | `/api/tasks?project=:id` | Tasks for a project |
| POST/PUT/DELETE | `/api/tasks[/:id]` | Task CRUD |
| PATCH | `/api/tasks/:id/move` | Kanban drag & drop |
| POST | `/api/tasks/:id/comments` | Add comment |
| GET | `/api/dashboard/stats` | Aggregated dashboard stats |

## Deployment

TaskFlow is two deployables, not one:

| Piece | What it is | Where it goes |
|---|---|---|
| `client/` | Static React build | Netlify |
| `server/` | Long-running Express process | Render / Railway / Fly |
| data | MongoDB | Atlas |

**Netlify cannot run the API.** It serves static files, so if `server/` isn't deployed anywhere,
every `/api/...` request falls through the SPA redirect and returns `index.html` instead of data —
logins hang and verification codes are never generated, because nothing is running to generate
them. Deploy the API first; the frontend is useless without it.

### 1. Database — MongoDB Atlas

Create a free M0 cluster, add a database user, and under **Network Access** allow `0.0.0.0/0`
(hosts like Render don't publish fixed egress IPs). Copy the `mongodb+srv://…` connection string.

### 2. API — Render

The repo ships a [`render.yaml`](render.yaml) blueprint: **New → Blueprint → pick this repo**.
Or create a Web Service manually with root directory `server`, build `npm ci --omit=dev`,
start `npm start`. Then set these under **Environment** (see [`server/.env.example`](server/.env.example)):

| Variable | Value |
|---|---|
| `MONGODB_URI` | **Required** — your Atlas string. The server refuses to boot in production without it, rather than silently using a database that resets on every restart. |
| `JWT_SECRET` | Long random string. Changing it logs everyone out. |
| `CLIENT_ORIGIN` | Exact frontend origin, no trailing slash. Wrong value ⇒ browser blocks every call on CORS. |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | Or the `SMTP_*` set. Without these, codes are only written to the server log — never emailed. |

Confirm it's alive before touching the frontend:

```bash
curl https://taskflow-api.onrender.com/api/health
```

You want `db.connected: true` and `mail.ready: true`. Anything else is a misconfiguration this
endpoint will name for you.

### 3. Frontend — Netlify

Base directory `client`, publish `client/dist`, build `npm run build`. Then set **one**
environment variable — this is the step whose absence causes the "everything just loads forever"
symptom:

```
VITE_API_URL = https://taskflow-api.onrender.com/api
```

It must include the `/api` suffix. It's read at build time, so **redeploy after changing it** —
editing it without rebuilding does nothing.

### 4. Custom subdomain (optional)

A subdomain uses a dot: `taskflow.aiuohall.dev`. A name like `taskflow-aiuohall.dev` is a
*different domain* you'd have to buy separately. Add two CNAMEs at your DNS provider:

| Record | Name | Points to |
|---|---|---|
| CNAME | `taskflow` | `your-site.netlify.app` |
| CNAME | `api.taskflow` | `taskflow-api.onrender.com` |

Then update both sides to match, and redeploy:

- Netlify → `VITE_API_URL=https://api.taskflow.aiuohall.dev/api`
- Render → `CLIENT_ORIGIN=https://taskflow.aiuohall.dev`

`.dev` is on the HSTS preload list, so HTTPS is mandatory — the site simply won't load until each
platform has issued its certificate (usually a few minutes, automatic and free on both).

## Troubleshooting

**Everything spins forever / no code ever arrives.** In order of likelihood:

1. **The API isn't deployed at all.** Netlify only serves static files. Open the browser devtools
   Network tab and look at an `/api/...` request — if the response is HTML rather than JSON, the
   request is being answered by the SPA redirect, not a server. Deploy `server/` (step 2 above).
2. **`VITE_API_URL` isn't set on Netlify**, so the build defaults to a relative `/api` and the
   requests never leave the Netlify domain. Set it and redeploy — it's baked in at build time.
3. **`CLIENT_ORIGIN` on the API doesn't exactly match the site's origin**, so CORS blocks
   everything. No trailing slash, and `https://` not `http://`.

Test the API directly, bypassing the browser entirely — if this returns JSON, the backend is fine
and the problem is frontend configuration:

```bash
curl -X POST https://your-api-host.com/api/auth/register -H "Content-Type: application/json" -d "{\"name\":\"Test\",\"email\":\"you@example.com\",\"password\":\"secret123\"}"
```

**Verification codes aren't arriving.** Check `GET /api/health` first — it reports the mail
transport state without needing log access:

```bash
curl https://your-api-host.com/api/health
```

`mail.ready: false` with a `lastError` tells you exactly what broke. The usual causes:

- **`mode: "console"`** — no SMTP credentials are set on the host, so codes are only being
  logged. Set `SMTP_*` or `GMAIL_*` in the host's environment (a local `.env` is not deployed).
- **Auth rejected** — a Gmail App Password stopped working. Google revokes them after a password
  change, a 2FA change, or a long idle period, which is why codes can work for weeks and then
  stop. Generate a new one at <https://myaccount.google.com/apppasswords>, or move to a
  transactional provider (Resend, Brevo, Mailgun) via the `SMTP_*` variables — more reliable,
  and no ~500/day cap.
- **Rate limited** — sending is capped at one code per minute and six per address per window.
  The response says how long to wait.

To test credentials in isolation, without the API or frontend involved:

```bash
cd server && node scripts/check-mail.js you@example.com
```

**Everyone got logged out / all data vanished.** `MONGODB_URI` isn't set on the API host, so it
was running on the ephemeral embedded database. Set it to your Atlas connection string.

**The first request after a quiet period takes ~50s.** Free API tiers suspend idle instances.
The app retries and shows a "waking the server up" banner; the fix is a paid instance or an
external uptime pinger hitting `/api/health`.

## Project Structure

```
taskflow/
├── server/          Express API
│   └── src/
│       ├── config/db.js        MongoDB connection (embedded or Atlas)
│       ├── config/mailer.js    SMTP transport for OTP mail
│       ├── models/             User, Project, Task, VerificationCode schemas
│       ├── middleware/auth.js  JWT verification
│       ├── middleware/rateLimiters.js
│       └── routes/             auth, projects, tasks, dashboard
└── client/          React app (Vite)
    └── src/
        ├── context/AuthContext.jsx
        ├── components/         Layout, TaskModal
        └── pages/              Login, Register, Dashboard, Projects, Board
```

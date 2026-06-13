# TaskFlow — Project & Task Management App

A full-stack Trello/Jira-style project management app with kanban boards, team collaboration, and an analytics dashboard.


## Features

- **JWT authentication** — register/login with hashed passwords (bcrypt), protected API routes
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
| POST | `/api/auth/register` | Create account, returns JWT |
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

## Project Structure

```
taskflow/
├── server/          Express API
│   └── src/
│       ├── config/db.js        MongoDB connection (embedded or Atlas)
│       ├── models/             User, Project, Task schemas
│       ├── middleware/auth.js  JWT verification
│       └── routes/             auth, projects, tasks, dashboard
└── client/          React app (Vite)
    └── src/
        ├── context/AuthContext.jsx
        ├── components/         Layout, TaskModal
        └── pages/              Login, Register, Dashboard, Projects, Board
```

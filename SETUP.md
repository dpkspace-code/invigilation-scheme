# Invigilation Scheme Builder — Full Stack Setup Guide

## What you're deploying
- **Frontend** (React) → Netlify
- **Backend** (Node/Express API) → Railway
- **Database** → Supabase (PostgreSQL)

---

## STEP 1 — Set up Supabase (database + auth)

1. Go to https://supabase.com and sign in / create a free account.
2. Click "New project". Name it `invigilation-scheme`, choose a region close to Mauritius (e.g. Singapore or Frankfurt), set a strong database password (save it somewhere).
3. Wait ~2 minutes for the project to be ready.
4. In the left sidebar, click **SQL Editor**.
5. Open `backend/schema.sql` from this project and paste the entire contents into the SQL editor.
6. Click **Run**. This creates all the tables, inserts your 68 staff members, and sets up security rules.
7. Go to **Project Settings → API** and copy:
   - **Project URL** (looks like `https://xxxx.supabase.co`)
   - **service_role key** (under "Project API keys" → "service_role" — click to reveal)

---

## STEP 2 — Deploy the backend to Railway

1. Go to https://railway.app and sign in with your GitHub account.
2. Click **New Project → Deploy from GitHub repo**.
3. Select (or push) this repository. Choose the `backend` folder as the root (Railway detects this via `railway.json`).
4. Once the project is created, go to **Variables** and add these environment variables:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_KEY=your-service-role-key
   JWT_SECRET=any-long-random-string-at-least-32-characters
   FRONTEND_URL=https://your-netlify-site.netlify.app
   PORT=3001
   ```
5. Railway will build and deploy automatically. Once done, copy the public URL (e.g. `https://invigilation-backend.up.railway.app`).

---

## STEP 3 — Deploy the frontend to Netlify

1. Go to https://app.netlify.com.
2. Click **Add new site → Import an existing project → GitHub**.
3. Select your repository. Set:
   - **Base directory**: `frontend`
   - **Build command**: `npm run build`
   - **Publish directory**: `frontend/dist`
4. Under **Site configuration → Environment variables**, add:
   ```
   VITE_API_URL=https://your-railway-backend.up.railway.app
   ```
5. Click **Deploy**. Once done, copy your Netlify URL.
6. Go back to Railway and update `FRONTEND_URL` to your actual Netlify URL.
7. Also go back to Supabase → **Authentication → URL Configuration** and add your Netlify URL to the "Site URL" field.

---

## STEP 4 — Create your first admin account

1. Open your Netlify URL in a browser.
2. Click "Create account" on the login screen.
3. Enter your name, email, and a password (min 8 characters).
4. You're in. All subsequent users who register will also be admin by default — you can change their role to "viewer" in the **Manage Users** page.

---

## STEP 5 — Push to GitHub (for automatic future deploys)

```bash
cd invigilation-app
git init
git add .
git commit -m "Initial commit — invigilation scheme builder"
git remote add origin https://github.com/YOUR_USERNAME/invigilation-scheme.git
git push -u origin main
```

After this, every time you push to GitHub:
- Netlify auto-rebuilds and redeploys the frontend
- Railway auto-redeploys the backend

---

## Local development (optional)

### Backend
```bash
cd backend
cp .env.example .env
# Fill in .env with your Supabase URL, service key, and JWT secret
npm run dev
# API runs at http://localhost:3001
```

### Frontend
```bash
cd frontend
echo "VITE_API_URL=http://localhost:3001" > .env
npm run dev
# App runs at http://localhost:5173
```

---

## File structure
```
invigilation-app/
├── backend/
│   ├── src/
│   │   ├── index.js          ← Express server entry point
│   │   ├── supabase.js       ← Supabase client
│   │   ├── scheduler.js      ← Schedule generation logic
│   │   ├── middleware/auth.js ← JWT auth middleware
│   │   └── routes/
│   │       ├── auth.js       ← Login, register, user management
│   │       ├── crud.js       ← Generic CRUD factory
│   │       ├── config.js     ← App configuration
│   │       └── schedule.js   ← Generate + workload endpoints
│   ├── schema.sql            ← Run this in Supabase SQL editor
│   ├── .env.example          ← Copy to .env and fill in
│   └── railway.json          ← Railway deployment config
│
└── frontend/
    ├── src/
    │   ├── api/index.js      ← Axios API client
    │   ├── context/AuthContext.jsx ← Global auth state
    │   ├── components/
    │   │   ├── Sidebar.jsx   ← Navigation sidebar
    │   │   └── ProtectedRoute.jsx
    │   └── pages/
    │       ├── Login.jsx     ← Login/register page
    │       ├── Dashboard.jsx ← Home/overview
    │       ├── Teachers.jsx  ← Staff management
    │       ├── StaffPages.jsx← Attendants, Pairs, Venues
    │       ├── Exams.jsx     ← Exam timetable
    │       ├── SchedulePages.jsx ← Workload + generate
    │       └── AdminPages.jsx← Users + settings
    ├── netlify.toml          ← Netlify deployment config
    └── vite.config.js        ← Vite build config
```

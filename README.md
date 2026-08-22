# ⚛️ Physics Exam Library — ระบบคลังข้อสอบอิเล็กทรอนิกส์

Electronic Exam Question Bank System for distance assessment with Computer-Based Testing (CBT).
Built per the Thai specification document: **5 core modules**, bilingual UI (**ไทย ⇄ English** toggle).

## Quick start

```bash
npm install        # express only (SQLite is built into Node via node:sqlite)
npm start          # -> http://localhost:3000
```

Requires **Node.js ≥ 23.4** (tested on Node 24). Database auto-creates and seeds at `data/app.db`.

### Default accounts (seeded demo)

| Role | Username | Password |
|------|----------|----------|
| Administrator | `admin` | `Admin@1234` |
| Examinee | `student1` … `student3` | `Student@1234` |

Registration of new examinees uses a simulated OTP (no SMS gateway — the code is shown on screen, as documented in the spec's Authentication requirement).

## Spec → Implementation map (the 5 modules)

| # | Module (from document) | Implemented in |
|---|------------------------|----------------|
| 1 | **การจัดการผู้ใช้งาน** User Management — 2 groups (Examinee / Administrator), registration, profile edit, exam status/history, **Authentication + Authorization**, OTP verification, admin CRUD users, usage history | `server/routes-auth.js`, `server/auth.js` (scrypt hashes, session cookies, login lockout), Admin → Users page |
| 2 | **การจัดการข้อสอบ** Item & Test Management — item bank CRUD, search/edit, categorize by topic × difficulty, **Test Blueprint** per subject, import/export | `server/routes-admin.js` (`/items`, `/exams/create` blueprint sampler), Admin → Item Bank & Exam Sets pages. Seeded with 36 bilingual physics MCQs across 6 topics × 3 difficulties |
| 3 | **การจัดการการสอบ** Examination Management — CBT engine, scheduled windows (auto-close outside window), real-time countdown, auto-save answers, prevent duplicate attempts, instant auto-grading, **5-choice multiple choice** | `server/routes-student.js` + Student runner UI (`views-student.js renderExam`). Server-side deadlines, one attempt per user (unique index), lazy auto-submit on expiry, live roster monitor polls every 5 s |
| 4 | **การประเมินและรายงานผล** Assessment & Reporting — bar / line / pie charts, summaries by individual / group / overview, printable reports | Admin → Scores & Reports page (SVG charts, no external CDN), per-item analysis, printable result report per examinee |
| 5 | **การจัดการคะแนน** Score Management — records, history, search by name/ID/date, statistics & ranking, export **CSV / Excel / PDF** | `/api/admin/scores` (+stats), export buttons: CSV (BOM), `.xls`, print-to-PDF |

## Architecture

```
api/
  index.js            Vercel serverless entry (exports the Express app)
  server/             Express backend (app.js wires routes; local entry: npm start -> dev.js)
  db.js               SQLite/libSQL adapter - schema (users, sessions, topics,
                      items, exams, exam_items, attempts, audit_log), tx(), audit()
  auth.js             scrypt password hashing, HttpOnly session cookies,
                      RBAC middleware, OTP store, brute-force lockout
  routes-auth.js      register → OTP verify → login/logout/profile/password
  routes-student.js   available exams, attempt start/resume, real-time answer save,
                      flags, submit, graded result with explanations
  routes-admin.js     dashboard stats, users/topics/items/exams CRUD, blueprint
                      sampling, live roster, per-item analysis, scores+stats, trend, audit
  seed.js             6 physics topics · 36 TH/EN questions · demo users ·
                      one closed exam (with graded results) + one open practice exam
public/
  index.html          SPA shell (classic scripts — no build step)
  js/app.js           hash router + role guards + header/nav/i18n toggle
  js/i18n.js          full Thai/English dictionary (button top-right toggles)
  js/views-auth.js    login, register, OTP modal
  js/views-student.js dashboard, CBT runner (timer/palette/autosave),
                      result review + explanations, my-results trend, profile
  js/views-admin.js   overview, users, item bank, exam wizard (blueprint matrix /
                      manual picker), live monitor + item analysis,
                      scores/reports/charts/exports, audit log
```

### Security notes (coursework level)
- Passwords: scrypt + per-user salt; timing-safe compare
- Sessions: random 256-bit tokens stored hashed; HttpOnly SameSite cookies
- Authorization: every admin route behind `requireAdmin`; students cannot touch admin APIs
- Correct answers are never sent to the client during an exam
- Duplicate submissions blocked at DB level (`UNIQUE(exam_id,user_id)`) and API level
- Audit log records logins, registrations, admin actions

## Manual test checklist

1. Login as `admin` → Overview shows stats; Item Bank lists 36 questions.
2. Exam Sets → "Create exam set" → blueprint matrix (e.g., 1 easy per topic = 6 Q) → save → publish 📢.
3. New browser/incognito: Register a student → OTP shown on screen → verify → Dashboard.
4. Start the open exam: timer counts down, answers save instantly ("Saved ✓"), palette tracks progress, submit → instant score + per-question explanations → Print/PDF report.
5. Re-entering the same exam is blocked (duplicate prevention).
6. Back as admin: Exam detail shows live roster; Scores page shows charts, ranking, stats; export CSV/Excel/print-PDF.

## Tech stack

Express 5 · SQLite via `node:sqlite` (zero native deps) · vanilla JS SPA · SVG charts · Thai/English i18n.

## Deploy to Vercel

The serverless filesystem is read-only, so Vercel runs the app against a free **libSQL/Turso** database instead of a local file.

1. Create a Turso database and auth token:
   ```bash
   turso db create exam-library
   turso db show exam-library --url      # -> DATABASE_URL  (libsql://...)
   turso db tokens create exam-library   # -> DATABASE_AUTH_TOKEN
   ```
   (No CLI? Create a free database at [turso.tech](https://turso.tech) — same two values.)

2. In your Vercel project → Settings → Environment Variables, add:
   - `DATABASE_URL` = `libsql://...`
   - `DATABASE_AUTH_TOKEN` = `...`

3. Push (or redeploy). On first request the function creates the schema and seeds demo data automatically.

Local dev stays unchanged: `npm start` uses built-in SQLite at `data/app.db`.

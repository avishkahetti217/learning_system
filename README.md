# LearnLog

Track your progress through a course: courses → modules → weekly lessons, with key points, flashcards and a spaced revision plan driven by each lesson's difficulty.

- **Frontend:** React + Vite (`src/`)
- **Backend:** Node + Express (`server/`)
- **Database:** SQLite via better-sqlite3 — a single file at `data/learnlog.db`, created automatically

## Run locally

Requires Node 20.19+ (or 22.12+).

```bash
npm install
npm run dev        # http://localhost:3000 — API + React with hot reload, one process
```

## Production / hosting

```bash
npm install
npm run build      # builds the React app into dist/
npm start          # serves dist/ and the API on one port
```

Environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Port to listen on |
| `HOST` | `127.0.0.1` | Set to `0.0.0.0` to accept connections from other machines |
| `DB_PATH` | `data/learnlog.db` | Location of the SQLite file |
| `LEARNLOG_PASSWORD` | — | If set, the whole app requires this password (HTTP Basic auth, any username) |

**Always set `LEARNLOG_PASSWORD` when the app is reachable from the internet** — otherwise anyone with the URL can read and edit your data. Put it behind HTTPS (e.g. a reverse proxy like Caddy, or a platform that provides TLS) so the password isn't sent in clear text.

Example on a small VPS:

```bash
HOST=0.0.0.0 PORT=8080 LEARNLOG_PASSWORD='choose-something-long' npm start
```

On a platform such as Render, Railway or Fly.io, use `npm install && npm run build` as the build command and `npm start` as the start command, and mount a persistent disk at `data/` (or point `DB_PATH` at one) so the database survives redeploys.

## Backups

Settings → **Export backup** downloads everything as JSON; **Import backup** restores it (replacing current data). Backups from the earlier browser-only version of LearnLog import too. You can also just copy `data/learnlog.db` while the server is stopped.

## Revision plan

Revisions are scheduled a number of days after a lesson's start date:

| Difficulty | Revisions | Days |
| --- | --- | --- |
| Easy | 3 | 1, 7, 30 |
| Medium | 5 | 1, 3, 7, 14, 30 |
| Hard | 7 | 1, 2, 4, 7, 14, 30, 60 |

Change these in Settings. Due and overdue revisions appear on the home page, where you can tick them off.

## Exam plans

**Exam plans** (top bar, or **Plan exam** on a course) projects a day-by-day schedule up to an exam:

- Each tested module has one lesson per week. Completed lessons are covered; everything else — including weeks not yet added — is spread evenly over your study days, interleaving modules week by week.
- Revisions are included: pending ones for completed lessons (several overdue ones collapse into one catch-up), plus projected ones for lessons as you learn them.
- The last few days before the exam are a final review window with no new lessons.
- Load is measured in lessons (a revision counts as half). Compared with your comfortable daily load, the plan is rated Relaxed → Overloaded and suggests how many study days a week you'd need.

The plan is recalculated from your actual progress every time you open it, so falling behind or getting ahead rebalances the remaining days.

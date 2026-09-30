# Build a Schedule by Yourself: Your Schedule

**Your calendar deserves your name.** The app's name is a template: **xxx's Schedule** — it ships as *Mitchell's Schedule*; double-click the title in the top-left corner and it instantly becomes *David's Schedule*, *Yuki's Schedule* … yours.

**A local-first, keyboard-first personal calendar**: events + a three-layer task system (Tasks > Todos > Events) + recurring schedules + an LLM scheduling API, with China timezone (UTC+8) built in.

[中文说明](./README.md)

> Core idea: your data lives entirely on your own machine (one plain JSON file) — no cloud, no account. At the same time, a REST API and a CLI let LLMs / scripts schedule your day for you.

## Features

### Views & Navigation
- **Four views**: Day / Week / Month / Agenda; the "today" column is fully highlighted and a red now-line tracks the current time
- **Streaming month view**: scroll like a feed — weeks render row by row, seamlessly connecting adjacent months, no scrollbar
- **Adaptive header**: while scrolling the month view, the top bar shows the year/month that dominates the viewport
- **Keyboard-first**: `Ctrl+K` command palette, `T` today, `1/2/3/4` switch views, `P/N` prev/next, `Shift+C` new todo, `?` all shortcuts

### Three-layer task model (Task > Todo > Event)
- **Task**: a multi-day work package, rendered as one connected bar pinned above the calendar in Week/Month views — always above calendar events
- **Todo**: a single-day DDL item; can be attached to a Task; grouped in the side panel
- **Event**: regular calendar items with four calendars (Work/Research/Exercise/Personal, custom colors) and RRULE recurrence (daily / every N days / weekdays / monthly, with UNTIL)

### Five-state automatic status machine
`Upcoming → Ongoing → Deferred` (derived from dates automatically) plus `Done / Done late` (manual). Refreshed daily: past-DDL items flip to Deferred automatically; drag one back over today and it becomes Ongoing again.

### Drag & drop
- Drag to create events (15-min snapping, Alt for 1-min precision); double-click a band to create tasks/todos
- **Edge-resize multi-day bars**: grab either end of a task bar to change its start/end date
- **Cross-week/month dragging**: hover at the viewport edge for ~0.6s to auto-flip pages — never let go
- Cross-week drag-select in Month view to create multi-day tasks in bulk

### Desktop experience (Electron)
- Standalone desktop window; closing it collapses into a **floating ball** (hover to expand today's agenda, click to bring back the main window); draggable across the whole screen, stops the instant you release
- System tray; `Ctrl+wheel` zooms the time grid; dark/light themes
- **DIY app name (xxx's Schedule)**: double-click the title in the top bar and put your own name on it — synced to the top bar, status bar, window title, and tray tooltip

### Built for LLM scheduling
- Built-in REST API (desktop: `http://127.0.0.1:5175`), full docs in [app/API.md](./app/API.md)
- Zero-dependency CLI `app/cli.mjs`: CRUD for events/tasks, status/attachment/color
- All "today/now" logic is computed in **China time (UTC+8)** regardless of the device's system timezone — correct scheduling even on overseas machines

## Getting started

Requires Node.js ≥ 18.

```bash
# Web (dev mode)
cd app
npm install
npm run dev          # open http://localhost:5173

# Desktop (Electron, builds first)
npm run desktop      # use `npm run desktop:only` afterwards to skip the build
```

On first launch the app creates `app/data/db.json` and seeds four calendars (Work / Research / Exercise / Personal).

### Desktop shortcut (Windows)

Point a shortcut at `app\node_modules\electron\dist\electron.exe` (arguments `desktop/main.mjs`, working directory `app`) for a one-click, no-console launch. Create it with PowerShell:

```powershell
$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut("$([Environment]::GetFolderPath('Desktop'))\Mitchell's Schedule.lnk")
$lnk.TargetPath = "D:\path\to\app\node_modules\electron\dist\electron.exe"
$lnk.Arguments  = "desktop\main.mjs"
$lnk.WorkingDirectory = "D:\path\to\app"
$lnk.IconLocation = "D:\path\to\app\assets\icon.ico"
$lnk.Save()
```

## Data & privacy

- Everything is stored in **`app/data/db.json`** (plain JSON) — back it up or edit it by hand; the UI picks up external changes within ~5 seconds
- **`app/data/` is git-ignored; no schedule data ever enters the repository**
- No cloud. No account. No telemetry.

## External API examples

```bash
# List tasks
node app/cli.mjs task-list

# New event today at 15:00 for 1 hour
node app/cli.mjs event-add "Team sync" --at 15:00 --for 1h --calendar 工作

# New task with a due date / attachment / color
node app/cli.mjs task-set "Finish refactor" --due 2026-10-08 --from 2026-10-01 --color basil

# Or hit the REST API directly
curl http://127.0.0.1:5175/api/tasks -d '{"title":"Weekly report","dueDate":"2026-10-09"}' -H "Content-Type: application/json"
```

Field reference, status-machine semantics, and the recurrence format: **[app/API.md](./app/API.md)**.

## Project layout

```
├── app/                  # Application
│   ├── src/              # React + TypeScript front end (views / drag engine / state machine / timezone)
│   ├── server/           # REST API (plain Node, shared by dev & desktop)
│   ├── desktop/          # Electron main process + preload
│   ├── scripts/          # Helper scripts (icon generation, etc.)
│   ├── cli.mjs           # Zero-dependency CLI
│   ├── API.md            # Full REST API docs
│   └── data/             # Local data (git-ignored)
├── 设计方案.md            # Design document (Chinese, with iteration log)
├── 调研报告/              # Pre-build research notes (Chinese)
├── README.md / README.en.md
└── LICENSE
```

## Tech stack

React 18 · TypeScript · Vite · Tailwind CSS · Zustand · dayjs · Electron · plain-Node REST API (no framework)

## Roadmap

- [ ] Three-branch editing for recurring events (this one / this series / all)
- [ ] System notification reminders
- [ ] Natural-language creation ("meeting tomorrow 3pm for 30 minutes")
- [ ] .ics import/export & subscriptions
- [ ] Lunar calendar / public holidays

## License

[MIT](./LICENSE) © 2026 MitchellYee

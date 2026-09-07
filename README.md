# sesh for Raycast

Run your [sesh](https://sesh.liyifan.us) focus timer from Raycast: start a session, check what is
running, finish it, work off your Things and Todoist to-dos, and set a custom intention — without
opening the web app.

Everything is stored on the sesh server, so a session started here shows up on the phone and in the
web app, and one started there can be finished from the menu bar.

## Commands

| Command | What it does |
|---|---|
| **Timer Status** | Menu-bar countdown. Pause, resume, finish or discard the session, and jump to any other command. Counts *up* behind a `+` once the session runs past its target. |
| **Check Session** | The running session in full: progress, remaining or overtime, category, intention and the to-dos it will log time against. Pause, extend by 5–25 minutes, finish (with an optional rating), or discard. |
| **Start Focus Session** | A form: intention, to-dos, category, duration and session type. Picking a to-do names the session, files it under a category and takes the length from the to-do's own estimate. |
| **Quick Start Focus** | Starts focusing immediately on whatever topic sesh already has queued up — including its linked to-dos — at your configured focus length. |
| **Tasks** | Your Things and Todoist to-dos in one list, by Today / Upcoming / All. Start a session on one, queue one up for later, tick one off, or add a new Things to-do. |
| **Set Intention** | Write a custom intention. With a session running it re-titles it without touching the clock; otherwise it parks the topic on the idle timer for whatever you start next. |
| **Pause/Resume Timer** | Toggle pause from anywhere. |
| **Finish Session** | End the running session and record it. |
| **View Session History** | Past sessions by day, with the day's focus total, ratings and category colours. |
| **View Analytics** | Today's focus time, session count and streak, plus the last seven days as a bar chart. |

## Setup

- **Server URL** — defaults to `https://sesh.liyifan.us`.
- **App Username** / **App Password** — required when the sesh deployment is behind the shared
  login wall. The extension signs in for you and caches the cookies in Raycast local storage.
- **Default Focus Duration** — a *fallback* only. sesh's own Focus Duration setting is what the
  commands use; this covers the case where the server's settings cannot be read.

### How signing in works

sesh gates itself with two cookies, and the extension collects both:

1. `sesh_app_session` — the shared app login, from `POST /api/login`.
2. `todoist_proxy_auth` — an extra gate on the Things and Todoist proxies, because those routes hand
   out the server's API token. sesh-web's middleware only issues it on a *page* request, so the
   extension asks for the app shell once after signing in. Without this step every to-do command
   would 401 forever, however good your password is.

Both are refreshed automatically on the next 401.

## Notes

- **Session types.** sesh stores `focus` and `break`; a long break is a break with a longer target.
  The three cells in Start Focus map onto that, and the durations come from your sesh settings.
- **To-do links.** A session remembers which to-dos it is against, across providers. When it
  finishes, the server writes the focused minutes back — a real duration in Todoist, a note in
  Things. Nothing is ticked off: finishing a session says the sitting is over, not the work.
- **Overtime.** A session that reaches zero keeps counting up rather than ending itself.
- **Finishing is safe to repeat.** The server compares and swaps on the start time, so finishing
  from Raycast a session the web app or the background completer already saved reports it as
  already saved instead of writing it twice.
- **Discarding is not finishing.** Discard says the sitting did not happen: nothing is recorded and
  no minutes reach your to-dos.

## Development

```bash
npm install
npm run dev        # ray develop
npm test           # vitest
npm run lint       # ray lint
npx ray build      # verify the extension compiles
```

### Test structure

```
src/__tests__/
├── format.test.ts       # durations, countdowns, overtime, phase and menu-bar labels
├── timer-state.test.ts  # payload builders, effective remaining time, coercion
├── task-ref.test.ts     # the task-reference encoding, which must match sesh-web exactly
├── task-view.test.ts    # how a picked to-do sets up a session
├── api.test.ts          # the request helper, the two-cookie sign-in, task merging
└── types.test.ts        # interface shapes against the real API responses
```

### Contributing

- Every new function gets unit tests; every bug fix gets a regression test.
- `src/task-ref.ts` is a deliberate copy of `sesh-web/src/lib/task-ref.ts`. If one changes, change
  both — the two write to the same database column.
- Run `npm test` and `npx ray build` before committing.

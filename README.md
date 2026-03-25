# TwinTracker

> Built for the parent with one hand free.

Decision-support app for parents of young children. One glance answers: **"what does this baby need right now?"** Tracks feeds, naps, diapers, and milestones across multiple children in a shared household.

---

## Architecture

npm workspaces monorepo:

| Workspace       | Purpose                                            |
| --------------- | -------------------------------------------------- |
| `packages/core` | Shared TypeScript: types, API client, hooks, logic |
| `packages/ui`   | Shared React Native Web components (web + native)  |
| `apps/web`      | Next.js 14 PWA                                     |
| `apps/native`   | Expo (iOS/Android)                                 |
| `api`           | Express + PostgreSQL                               |

Shared UI components use React Native primitives (`View`, `Text`, `Pressable`) which compile to DOM elements via `react-native-web`. One component works on both platforms.

```
┌──────────────────────────────────────────────────────────┐
│  apps/web (Next.js)      apps/native (Expo)              │
│       │                        │                         │
│       └──────────┬─────────────┘                         │
│                  ▼                                        │
│           packages/ui  ←── packages/core                 │
│                                   │                       │
│               api (Express + Postgres)                    │
└──────────────────────────────────────────────────────────┘
```

---

## Project structure

```
twintracker/
├── api/src/
│   ├── app.ts              # Express app
│   ├── db/migrate.js       # Idempotent schema migrations
│   ├── middleware/auth.ts  # JWT auth middleware
│   └── routes/             # auth, babies, events, alarms, preferences
├── packages/
│   ├── core/src/
│   │   ├── api/client.ts   # Fetch wrapper with auto-refresh
│   │   ├── hooks/          # useAuth, useEventStore, usePreferences, useTheme
│   │   ├── logic/          # Schedule, analytics, learned schedule, mock data
│   │   └── types/          # All shared TypeScript types
│   └── ui/src/components/  # BabyCard, LogSheet, HistoryFeed, NapTimerModal, …
└── apps/
    ├── web/app/            # Next.js App Router pages
    └── native/App.tsx      # Expo entry point
```

---

## Getting started

**Prerequisites:** Node 20+, Docker + Docker Compose, Expo Go (for native testing on device).

### Web

```bash
npm install
docker compose up
```

Web app: `http://localhost:3001`. API: `http://localhost:3000`.

### Native (real device)

```bash
# Terminal 1
docker compose up

# Terminal 2
cd apps/native
npm run dev:local   # auto-detects your Mac's LAN IP
```

Scan the QR code with Camera (iOS) or Expo Go (Android). Phone and Mac must be on the same WiFi.

| Script              | API target              | When to use                        |
| ------------------- | ----------------------- | ---------------------------------- |
| `npm run dev:local` | `http://<mac-ip>:3000`  | Daily dev — phone + Docker         |
| `npm run dev:prod`  | Railway prod URL        | Phone on cellular, UI-only testing |
| `npm run dev`       | `http://localhost:3000` | iOS Simulator                      |

### Native (iOS Simulator)

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
export PATH="$HOME/.rbenv/versions/3.1.2/bin:$PATH"
cd apps/native
npx expo prebuild --platform ios --clean
cd ios && LANG=en_US.UTF-8 pod install
open twintracker.xcworkspace
```

### Troubleshooting

| Problem                  | Fix                                                                             |
| ------------------------ | ------------------------------------------------------------------------------- |
| "Network request failed" | Phone and Mac not on same WiFi, or IP changed — re-run `ipconfig getifaddr en0` |
| White screen / crash     | Shake phone → "Open JS Debugger", or check Expo CLI terminal                    |
| Docker API not starting  | `docker compose down && docker compose up`                                      |

---

## Environment variables

Copy `.env.example` (or set these in your shell / Docker environment):

| Variable       | Description                                      |
| -------------- | ------------------------------------------------ |
| `DATABASE_URL` | Postgres connection string                       |
| `JWT_SECRET`   | Secret for signing JWTs (min 32 chars)           |
| `PORT`         | API port (default `3000`)                        |
| `APP_URL`      | Base URL used in email verification links        |
| `SMTP_HOST`    | SMTP server — blank = logs to console (dev mode) |
| `SMTP_PORT`    | Default 587                                      |
| `SMTP_SECURE`  | `"true"` for port 465/TLS                        |
| `SMTP_USER`    | SMTP auth username                               |
| `SMTP_PASS`    | SMTP auth password                               |
| `SMTP_FROM`    | From address, default `noreply@twintracker.app`  |

In local dev, leave all `SMTP_*` vars unset — the API logs verification links to the console instead of sending email.

---

## Running tests

```bash
npm test                  # all workspaces
npm test -w @tt/core      # core logic
npm test -w @tt/ui        # UI components
npm test -w api           # API routes + auth
```

`npm run type-check` runs `tsc --noEmit` across all workspaces.

---

## Editor setup

The repo includes a `.vscode/` workspace config with:

- **Prettier** — format on save (`singleQuote`, `semi`, `trailingComma: all`, `printWidth: 100`)
- **ESLint** — `@typescript-eslint/recommended` + `react-hooks/recommended`, `no-console` warn
- **TypeScript** — workspace version, strict mode
- **Debug configs** — F5 launches Next.js server-side debug or Jest (per-file or all)

---

## Contributing

### Rules

1. Business logic belongs in `packages/core` — platform-agnostic, no UI imports
2. UI components belong in `packages/ui` — React Native primitives only (`View`, `Text`, `Pressable`)
3. Never import from `apps/web` or `apps/native` in shared packages
4. Add tests for new schedule logic and API routes
5. `npm run type-check` must pass before pushing
6. After adding npm packages to a Dockerized service: `docker compose build --no-cache <service>`
7. After adding any package to `apps/native/package.json`: verify the Next.js web build still compiles

### Platform-specific component files

When a `packages/ui` component needs to import a native-only library (e.g. `react-native-svg`), create a `.web.tsx` sibling that swaps in a web-safe implementation. Next.js prefers `.web.tsx` automatically.

```
CountdownRing.tsx       ← native (react-native-svg)
CountdownRing.web.tsx   ← web (plain SVG)
```

### Migrations

Schema migrations live in `api/src/db/migrate.js` and are idempotent (`IF NOT EXISTS`). Add a new numbered migration block — never modify existing ones. Migrations run automatically on container start.

---

## License

Licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0).

You are free to use, modify, and distribute this software under the terms of the AGPL-3.0. If you run a modified version as a network service, you must make the source code of your modified version available under the same license.

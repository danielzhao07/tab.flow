<p align="center">
  <img src="https://img.shields.io/badge/Manifest-V3-blue?logo=googlechrome&logoColor=white" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white" alt="Express 5" />
  <img src="https://img.shields.io/badge/PostgreSQL-Neon-4169E1?logo=postgresql&logoColor=white" alt="Neon PostgreSQL" />
  <img src="https://img.shields.io/badge/Groq-LLaMA_3.3-F55036?logo=meta&logoColor=white" alt="Groq LLaMA 3.3" />
  <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License: MIT" />
</p>

# Tab.Flow

A full-stack Chrome extension that replaces the browser's native tab switcher with an intelligent, keyboard-driven HUD overlay. Built as a monorepo with a **React 19 extension frontend**, a **Groq-powered AI tab assistant** (LLaMA 3.3 70B), an **Express.js v5 REST API**, **Neon serverless PostgreSQL**, and **AWS Cognito/S3** for auth and storage.

<!-- ![Tab.Flow Demo](docs/demo.gif) -->

---

## Why Tab.Flow?

Power users juggle dozens of tabs across multiple windows. The native Chrome tab bar doesn't scale — tabs shrink to unreadable slivers, and Ctrl+Tab cycles linearly instead of by recency. Tab.Flow solves this with:

- **MRU-first navigation** — tabs sorted by last access, not position
- **Full-screen grid overlay** — inspired by Windows Alt+Tab, with live thumbnails
- **AI tab assistant** — natural-language control: "group my YouTube tabs", "close all Reddit"
- **Fuzzy search with structured filters** — `is:pinned`, `domain:github.com`, and more
- **Cloud-synced workspaces** — save and restore tab sets across devices
- **Zero-config analytics** — passive browsing insights without any setup

---

## Features

### Core Tab Management
- Full-screen HUD overlay triggered by **Alt+Q** with backdrop blur and staggered card entry animations
- Most Recently Used (MRU) ordering tracked by a persistent background service worker
- Fuzzy search across titles, URLs, and notes (Fuse.js with configurable threshold 0.1–0.8)
- Structured filters: `is:pinned`, `is:audible`, `is:duplicate`, `is:suspended`, `is:active`, `domain:x`, `group:x`
- 2D arrow-key grid navigation with Enter to switch, Backspace to close
- Drag-to-reorder, multi-select (Ctrl+Click / Shift+Click), and bulk operations
- Tab group support with Chrome's native colors, auto-group suggestions by domain, and group dissolve
- Duplicate detection with yellow "DUP" badge, tab count badge on extension icon
- Quick-switch: double-tap Alt+Q to jump to your previous tab instantly
- Live tab thumbnails captured via `captureVisibleTab` (JPEG, LRU cache of 40)
- Active tab highlighted with spinning border glow animation
- 300ms close animation with undo toast (5-second window to restore)

### AI Tab Assistant
- Type **@** in the search bar to activate the AI agent
- Powered by **Groq** running **LLaMA 3.3 70B Versatile** (temperature 0.1, JSON mode)
- Understands all open tabs with full context (titles, URLs, domains, groups, windows, flags)
- **21 action types**: group tabs, close tabs, open URLs, pin, mute, bookmark (with folder creation), switch, move to new window, split view, merge windows, create workspace, duplicate, reload, discard, rename groups, close by domain, and more
- Smart URL construction for 50+ services (YouTube, Spotify, Google Maps, Amazon, Reddit, etc.)
- Prompt history with arrow-up/down navigation (persisted across sessions, max 50)
- Thinking indicator with spinning sparkle, action checklist with checkmarks/spinners
- Users provide their own free Groq API key in settings

### Workspaces
- Save current window's tabs as a named workspace (auto-filters restricted URLs)
- Restore workspace in a new window with tab groups recreated (correct names + colors)
- Update existing workspace with current tabs, or delete
- Workspace chips show favicon stack (first 3 tabs) + name + tab count
- Stored locally + synced to cloud API when signed in

### Tab Suspender
- Automatically discards inactive tabs to reclaim memory
- Configurable inactivity threshold: 5 min to 2 hours (slider)
- Never suspends pinned, active, or audible tabs
- Runs via `chrome.alarms` every 5 minutes

### Notes
- Attach text notes to any URL — displayed as cyan italic text at the bottom of grid cards
- Notes included in fuzzy search (weight 0.2)
- Synced to cloud API when signed in

### Bookmarks
- Dual system: local Tab.Flow bookmarks + Chrome native bookmarks via `chrome.bookmarks` API
- Star (★) badge shown on bookmarked tabs in the grid
- Toggle via Ctrl+B or context menu; supports folder creation
- Synced to cloud when signed in

### Analytics
- Passive visit tracking: records URL, domain, title, and focus duration on every tab switch
- Top 3 visited domains shown in the HUD's top bar (with brand-name mapping for 50+ sites)
- Click a domain to jump to a matching tab, or open it
- Frecency scoring (frequency × recency with 24-hour half-life) for sort mode and fallback analytics
- Can be hidden via settings

### Multi-Window Management
- Window strip shows all open windows with active tab favicon, title, tab count, and current-window indicator
- Click to focus/switch windows
- Move tabs between windows, merge all windows, or split to new windows

### Group Suggestions
- Auto-detects ungrouped domains with 2+ tabs and suggests grouping them
- Smart color picking: brand-color hints for 25+ domains (YouTube → red, GitHub → purple, Spotify → green)
- Click existing group pills to filter the grid; X to dissolve a group
- Bulk group/ungroup buttons appear when 2+ tabs are selected

### Command Palette
- Type **>** in the search bar to open
- Commands: close duplicates, close selected, group/ungroup selected, reopen last closed, toggle window filter, sort by name (toggle MRU ↔ A–Z), select all

### Context Menu
- Right-click any tab card for: Pin/Unpin, Bookmark, Mute/Unmute, Duplicate, Move to new window, Reload, Group/Ungroup, Close
- Multi-select context menu: all above operations in bulk for N selected tabs
- Auto-clamps to viewport boundaries with directional animation

### Popup
- Compact 340px mini interface accessible from the toolbar icon
- **Tabs view**: stats bar (total tabs, windows, pinned, suspended, estimated memory saved) + top 7 recent tabs
- **Workspaces view**: save current window, list/restore/delete workspaces
- Footer hint: "Alt+Q for full switcher"

### Export / Import
- Export all data (settings, workspaces, bookmarks, notes) as a versioned JSON file
- Import from JSON with validation — available from the options page

### Keyboard Cheat Sheet
- Press **>** to access the command palette which lists all available commands and their shortcuts

---

## Keyboard Shortcuts

### Global (Chrome-level)

| Shortcut | Action |
|---|---|
| `Alt+Q` | Toggle HUD overlay |
| `Alt+Q` × 2 | Quick-switch to previous tab (< 400ms) |

### Navigation

| Shortcut | Action |
|---|---|
| `← → ↑ ↓` | 2D grid navigation |
| `Tab` / `Shift+Tab` | Forward / back navigation |
| `Enter` | Switch to selected tab |
| `Esc` | Close HUD |
| `1`–`9` | Quick-switch to tab by position |

### Tab Actions

| Shortcut | Action |
|---|---|
| `Ctrl+X` | Close selected tab |
| `Ctrl+Shift+X` | Close all multi-selected tabs |
| `Ctrl+Shift+T` | Reopen last closed tab |
| `Ctrl+B` | Bookmark / unbookmark selected tab |
| `Ctrl+M` | Mute / unmute selected tab |

### Selection & Grouping

| Shortcut | Action |
|---|---|
| `Ctrl+Click` | Toggle select |
| `Shift+Click` | Range select |
| `Ctrl+A` | Select / deselect all visible tabs |
| `Ctrl+G` | Group selected tabs |
| `Ctrl+Shift+G` | Ungroup selected tabs |

### View & Search

| Shortcut | Action |
|---|---|
| `Ctrl+S` | Sort by name (toggle MRU ↔ A–Z) |
| `Ctrl+F` | Toggle window filter (all / current) |
| `>` | Open command palette |
| `@` | Activate AI agent |

---

## Tech Stack

### Extension (`apps/extension/`)

| Technology | Purpose |
|---|---|
| **WXT 0.19** | Manifest V3 framework — shadow DOM content script, HMR dev server |
| **React 19** | HUD overlay UI injected via content script |
| **TypeScript 5.6** | End-to-end type safety |
| **Tailwind CSS 3.4** | Utility-first styling scoped to shadow DOM |
| **Fuse.js 7** | Weighted fuzzy search (title 0.7, URL 0.3, notes 0.2) |
| **Groq SDK** | LLaMA 3.3 70B AI tab assistant (client-side, user's API key) |
| **Chrome APIs** | tabs, tabGroups, sessions, storage, alarms, identity, bookmarks, captureVisibleTab |

### API (`apps/api/`)

| Technology | Purpose |
|---|---|
| **Express.js 5** | REST API server |
| **TypeScript 5.7** | Shared type safety with the extension |
| **Drizzle ORM** | Type-safe SQL queries and schema migrations |
| **postgres.js 3** | PostgreSQL driver (SSL for Neon serverless) |
| **Zod** | Runtime request validation |
| **express-jwt + jwks-rsa** | AWS Cognito JWT verification via JWKS rotation |
| **Google Gemini** | `gemini-embedding-001` for 768-dim tab embeddings |

### Infrastructure

| Service | Purpose |
|---|---|
| **Neon** | Serverless PostgreSQL — workspaces, bookmarks, notes, analytics, settings |
| **AWS Cognito** | OAuth 2.0 Authorization Code + PKCE authentication |
| **AWS S3** | Tab thumbnail storage with presigned URLs |
| **Groq** | LLaMA 3.3 70B inference for AI tab assistant |
| **Google Gemini** | Embedding model for server-side semantic search |

---

## Database Schema

| Table | Description |
|---|---|
| `users` | Cognito sub + email, created on first sign-in |
| `workspaces` | Named tab sets (JSONB array of url/title/favicon) |
| `bookmarks` | Cloud-synced bookmarks with URL, title, favicon |
| `notes` | Per-URL text notes |
| `tab_embeddings` | 768-dim Gemini vectors for semantic search |
| `tab_analytics` | Per-URL visit count, total duration, domain, title |
| `user_settings` | JSONB settings blob, upserted on change |

---

## API Endpoints

Authenticated endpoints require `Authorization: Bearer <cognito-token>` or `x-device-id` header.

### Auth (public)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/token` | Exchange Cognito PKCE auth code for tokens |
| `POST` | `/api/auth/login` | Email + password sign-in |
| `POST` | `/api/auth/signup` | Create account |
| `POST` | `/api/auth/confirm` | Verify email with confirmation code |
| `POST` | `/api/auth/resend` | Resend verification code |

### Sync

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/sync/workspaces` | List saved workspaces |
| `POST` | `/api/sync/workspaces` | Create workspace |
| `PATCH` | `/api/sync/workspaces/:id` | Update workspace |
| `DELETE` | `/api/sync/workspaces/:id` | Delete workspace |
| `GET` | `/api/sync/bookmarks` | List bookmarks |
| `POST` | `/api/sync/bookmarks` | Create bookmark |
| `DELETE` | `/api/sync/bookmarks/:id` | Delete bookmark |
| `GET` | `/api/sync/notes` | List notes |
| `POST` | `/api/sync/notes` | Create / update note |
| `GET` | `/api/sync/settings` | Get user settings |
| `PUT` | `/api/sync/settings` | Upsert settings |

### AI

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/ai/embed` | Generate + store Gemini embedding for a tab |
| `POST` | `/api/ai/search` | Semantic search over stored embeddings |
| `GET` | `/api/ai/history` | Semantic search across all tab history |
| `GET` | `/api/ai/health` | Check Gemini API availability |

### Analytics

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/analytics/visit` | Record a tab visit (URL, domain, duration) |
| `GET` | `/api/analytics/top-domains` | Top visited domains |
| `GET` | `/api/analytics/summary` | Aggregate usage statistics |
| `GET` | `/api/analytics/recent` | Recently visited tabs |

### Thumbnails

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/thumbnails/upload` | Upload screenshot (base64, max 2 MB) |
| `GET` | `/api/thumbnails/url` | Get presigned S3 download URL |
| `DELETE` | `/api/thumbnails` | Delete a stored thumbnail |

### Health

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Service status, version, auth mode |

---

## Settings

| Setting | Type | Default | Description |
|---|---|---|---|
| `searchThreshold` | number | 0.4 | Fuzzy match sensitivity (0.1 = strict, 0.8 = loose) |
| `maxResults` | number | 50 | Max tabs shown in HUD |
| `showPinnedTabs` | boolean | true | Include pinned tabs in grid |
| `showUrls` | boolean | true | Show domain below tab titles |
| `autoSuspend` | boolean | false | Auto-discard inactive tabs |
| `autoSuspendMinutes` | number | 30 | Inactivity threshold (5–120 min) |
| `hideTodayTabs` | boolean | false | Hide analytics bar in HUD |
| `groqApiKey` | string | — | Groq API key for AI agent (free at console.groq.com) |

---

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 9+ (`npm install -g pnpm`)
- Chrome or Chromium-based browser
- (Optional) Neon PostgreSQL database for cloud sync
- (Optional) AWS account for Cognito auth + S3 thumbnails
- (Optional) Groq API key for AI tab assistant (free)

### Installation

```bash
# Clone and install
git clone https://github.com/danielzhao07/TabFlowV1.git
cd TabFlowV1
pnpm install

# Build the extension
pnpm build
```

### Load in Chrome

1. Navigate to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select `apps/extension/.output/chrome-mv3`

### API Setup (optional — for cloud sync)

```bash
# Configure environment
cp apps/api/.env.example apps/api/.env
# Edit .env with your Neon DATABASE_URL, Cognito, S3, Gemini keys

# Push database schema
cd apps/api && npx drizzle-kit push && cd ../..

# Start API
pnpm dev:api
```

### Development

```bash
# Extension dev server with HMR
pnpm dev

# API dev server (tsx watch)
pnpm dev:api

# Run both concurrently
pnpm dev:all
```

### Build Commands

| Command | Description |
|---|---|
| `pnpm dev` | Extension dev server (hot reload) |
| `pnpm build` | Extension production build |
| `pnpm zip` | Package extension as .zip |
| `pnpm dev:api` | API dev server (tsx watch) |
| `pnpm build:api` | API production build (tsc) |
| `pnpm dev:all` | Run extension + API concurrently |

---

## Project Structure

```
TabFlow/
├── apps/
│   ├── extension/               # Chrome extension (WXT + React)
│   │   ├── components/hud/      # HUD overlay components
│   │   ├── entrypoints/         # background, content, popup, options, auth
│   │   ├── lib/                 # Core logic (search, storage, AI, hooks)
│   │   └── assets/              # Global CSS
│   └── api/                     # Express.js REST API
│       └── src/
│           ├── routes/          # auth, sync, ai, analytics, thumbnails
│           ├── db/              # Drizzle schema
│           ├── middleware/      # JWT auth
│           └── services/        # S3 client
├── docs/                        # Privacy policy, terms, uninstall page
└── package.json                 # Monorepo scripts
```

---

## License

This project is licensed under the [MIT License](LICENSE).

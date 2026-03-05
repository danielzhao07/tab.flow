<p align="center">
  <img src="apps/extension/public/TabFlowV4.png" alt="tab.flow logo" width="120" />
</p>

<h1 align="center">tab.flow</h1>

<p align="center">
  <strong>Your browser, beautifully organized.</strong><br/>
  Stop losing your tabs. tab.flow gives you a stunning visual grid, an AI tab assistant, and instant control. Just press Alt+Q.
</p>

<p align="center">
  <a href="https://tabflow.tech">Website</a> &nbsp;&bull;&nbsp;
  <a href="#demo">Demo</a> &nbsp;&bull;&nbsp;
  <a href="#tech-stack">Tech Stack</a> &nbsp;&bull;&nbsp;
  <a href="#features">Features</a> &nbsp;&bull;&nbsp;
  <a href="#getting-started">Getting Started</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Manifest-V3-blue?logo=googlechrome&logoColor=white" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white" alt="Express 5" />
  <img src="https://img.shields.io/badge/PostgreSQL-Neon-4169E1?logo=postgresql&logoColor=white" alt="Neon PostgreSQL" />
  <img src="https://img.shields.io/badge/Groq-LLaMA_3.3-F55036?logo=meta&logoColor=white" alt="Groq LLaMA 3.3" />
  <img src="https://img.shields.io/badge/AWS-Cognito%20%7C%20S3-FF9900?logo=amazonaws&logoColor=white" alt="AWS" />
  <img src="https://img.shields.io/badge/License-All%20Rights%20Reserved-red.svg" alt="License: All Rights Reserved" />
</p>

<p align="center">
  Free forever &nbsp;&middot;&nbsp; No sign up required &nbsp;&middot;&nbsp; Works on all Chromium browsers
</p>

---

<h2 id="tech-stack">Tech Stack</h2>

### Extension (`apps/extension/`)

| Technology | Purpose |
|---|---|
| **WXT 0.19** | Manifest V3 framework with shadow DOM content script and HMR dev server |
| **React 19** | HUD overlay UI injected via content script |
| **TypeScript 5.6** | End to end type safety |
| **Tailwind CSS 3.4** | Utility first styling scoped to shadow DOM |
| **Fuse.js 7** | Weighted fuzzy search (title 0.7, URL 0.3, notes 0.2) |
| **Groq SDK** | LLaMA 3.3 70B AI tab assistant (client side, user's API key) |
| **Chrome APIs** | tabs, tabGroups, sessions, storage, alarms, identity, bookmarks, captureVisibleTab |

### API (`apps/api/`)

| Technology | Purpose |
|---|---|
| **Express.js 5** | REST API server |
| **TypeScript 5.7** | Shared type safety with the extension |
| **Drizzle ORM** | Type safe SQL queries and schema migrations |
| **postgres.js 3** | PostgreSQL driver (SSL for Neon serverless) |
| **Zod** | Runtime request validation |
| **express-jwt + jwks-rsa** | AWS Cognito JWT verification via JWKS rotation |
| **Google Gemini** | `gemini-embedding-001` for 768 dim tab embeddings |

### Infrastructure

| Service | Purpose |
|---|---|
| **Neon** | Serverless PostgreSQL for workspaces, bookmarks, notes, analytics, and settings |
| **AWS Cognito** | OAuth 2.0 Authorization Code + PKCE authentication |
| **AWS S3** | Tab thumbnail storage with presigned URLs |
| **Groq** | LLaMA 3.3 70B inference for the AI tab assistant |
| **Google Gemini** | Embedding model for server side semantic search |

### Architecture

```
TabFlow/
├── apps/
│   ├── extension/               # Chrome extension (WXT + React 19)
│   │   ├── components/hud/      # HUD overlay, 12 components
│   │   ├── entrypoints/         # background, content, popup, options, auth
│   │   ├── lib/                 # Core logic: search, hooks, AI, storage
│   │   └── assets/              # Global CSS + animations
│   └── api/                     # Express.js v5 REST API
│       └── src/
│           ├── routes/          # auth, sync, ai, analytics, thumbnails
│           ├── db/              # Drizzle ORM schema (7 tables)
│           ├── middleware/      # Cognito JWT auth
│           └── services/        # S3 client
├── docs/                        # Website, privacy policy, terms
└── package.json                 # pnpm monorepo scripts
```

---

<h2 id="demo">Demo</h2>

> Visit [tabflow.tech](https://tabflow.tech) to see all demos with autoplay.

<!-- HOW TO ADD INLINE VIDEOS:
     1. Go to https://github.com/danielzhao07/TabFlowV1/issues/new
     2. Drag and drop each .mp4 file from docs/demo-videos/ into the comment box
     3. GitHub will generate a URL like: https://github.com/user/attachments/assets/xxxx/video.mp4
     4. Replace each VIDEO_URL_HERE below with the generated URL
     5. Delete this comment block when done -->

### Overview

https://github.com/user-attachments/assets/f72c3d63-ea64-4318-8503-1d089ae1ce7a

---

### All your tabs in one beautiful grid

See every open tab at a glance. One shortcut opens a stunning full screen view of your entire browser, beautifully laid out and ready to explore.

---

### Find any tab in milliseconds

Can't find the right tab? Just start typing. tab.flow's fuzzy search instantly finds what you need, even if you only remember part of the name. No more clicking through tabs one by one.

VIDEO_URL_HERE

---

### Meet flow, your AI tab assistant

Just tell **flow** what you need. Group your work tabs, close everything from yesterday, or save this session for later. **flow** handles the rest. Powered by Groq's LLaMA 3.3 70B with 21 action types.

VIDEO_URL_HERE

---

### Smart grouping, zero effort

tab.flow spots patterns in your browsing and suggests smart groups automatically. One click to organize, with brand aware colors that make sense at a glance.

VIDEO_URL_HERE

---

### Save your tabs, switch instantly

Juggling school, work, and weekend plans? Save your tabs as a workspace and switch between them instantly. Pick up right where you left off, every time.

VIDEO_URL_HERE

---

### Commands at your fingertips

Type `>` to access powerful commands instantly. Close duplicates, sort tabs, pin groups, and more. Full keyboard navigation keeps you in the flow.

VIDEO_URL_HERE

---

<h2 id="features">Features</h2>

### Core Tab Management
- Full screen HUD overlay triggered by **Alt+Q** with backdrop blur and staggered card entry animations
- Most Recently Used (MRU) ordering tracked by a persistent background service worker
- Fuzzy search across titles, URLs, and notes powered by Fuse.js with configurable threshold (0.1 to 0.8)
- Structured filters: `is:pinned`, `is:audible`, `is:duplicate`, `is:suspended`, `is:active`, `domain:x`, `group:x`
- 2D arrow key grid navigation with Enter to switch and Backspace to close
- Drag to reorder, multi select (Ctrl+Click / Shift+Click), and bulk operations
- Tab group support with Chrome's native colors, auto group suggestions by domain, and group dissolve
- Duplicate detection with yellow DUP badge and tab count badge on the extension icon
- Quick switch: double tap Alt+Q to jump to your previous tab instantly
- Live tab thumbnails captured via `captureVisibleTab` (JPEG, LRU cache of 40)
- Active tab highlighted with spinning border glow animation
- 300ms close animation with undo toast (5 second window to restore)

### AI Tab Assistant
- Type **@** in the search bar to activate the AI agent
- Powered by **Groq** running **LLaMA 3.3 70B Versatile** (temperature 0.1, JSON mode)
- Understands all open tabs with full context including titles, URLs, domains, groups, windows, and flags
- **21 action types**: group tabs, close tabs, open URLs, pin, mute, bookmark (with folder creation), switch, move to new window, split view, merge windows, create workspace, duplicate, reload, discard, rename groups, close by domain, and more
- Smart URL construction for 50+ services (YouTube, Spotify, Google Maps, Amazon, Reddit, etc.)
- Prompt history with arrow up/down navigation, persisted across sessions (max 50)
- Thinking indicator with spinning sparkle and action checklist with checkmarks/spinners
- Users provide their own free Groq API key in settings

### Workspaces
- Save current window's tabs as a named workspace with automatic filtering of restricted URLs
- Restore workspace in a new window with tab groups recreated including correct names and colors
- Update existing workspace with current tabs, or delete
- Workspace chips show favicon stack (first 3 tabs) plus name and tab count
- Stored locally and synced to cloud API when signed in

### Tab Suspender
- Automatically discards inactive tabs to reclaim memory
- Configurable inactivity threshold from 5 minutes to 2 hours (slider)
- Never suspends pinned, active, or audible tabs
- Runs via `chrome.alarms` every 5 minutes

### Notes & Bookmarks
- Attach text notes to any URL, displayed as cyan italic text on grid cards
- Notes included in fuzzy search (weight 0.2) and synced to cloud when signed in
- Dual bookmark system: local tab.flow bookmarks plus Chrome native bookmarks via `chrome.bookmarks` API
- Star badge on bookmarked tabs, toggle via Ctrl+B or context menu with folder creation

### Analytics & Frecency
- Passive visit tracking that records URL, domain, title, and focus duration on every tab switch
- Top 3 visited domains shown in the HUD's top bar with brand name mapping for 50+ sites
- Frecency scoring (frequency x recency with 24 hour half life) for sort mode and fallback analytics
- Click a domain to jump to a matching tab, or open it

### Multi Window Management
- Window strip shows all open windows with active tab favicon, title, tab count, and current window indicator
- Click to focus/switch windows
- Move tabs between windows, merge all windows, or split to new windows

### Context Menu & Commands
- Right click any tab card for: Pin, Bookmark, Mute, Duplicate, Move to new window, Reload, Group/Ungroup, Snooze, Close
- Multi select context menu for all operations in bulk across N selected tabs
- Command palette (`>` prefix): close duplicates, close selected, group/ungroup, reopen last closed, sort by name, select all

### Popup
- Compact 340px mini interface accessible from the toolbar icon
- Stats bar showing total tabs, windows, pinned, suspended, and estimated memory saved
- Top 7 recent tabs plus workspaces view with save/restore/delete
- Footer hint: "Alt+Q for full switcher"

### Export / Import
- Export all data (settings, workspaces, bookmarks, notes) as a versioned JSON file
- Import from JSON with validation, available from the options page

---

## Keyboard Shortcuts

### Global

| Shortcut | Action |
|---|---|
| `Alt+Q` | Toggle HUD overlay |
| `Alt+Q` x 2 | Quick switch to previous tab (under 400ms) |

### Navigation

| Shortcut | Action |
|---|---|
| `← → ↑ ↓` | 2D grid navigation |
| `Tab` / `Shift+Tab` | Forward / back navigation |
| `Enter` | Switch to selected tab |
| `Esc` | Close HUD |
| `1` to `9` | Quick switch to tab by position |

### Tab Actions

| Shortcut | Action |
|---|---|
| `Ctrl+X` | Close selected tab |
| `Ctrl+Shift+X` | Close all multi selected tabs |
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
| `Ctrl+S` | Sort by name (toggle MRU / A to Z) |
| `Ctrl+F` | Toggle window filter (all / current) |
| `>` | Open command palette |
| `@` | Activate AI agent |

---

<h2 id="getting-started">Getting Started</h2>

### Prerequisites

- Node.js 18+
- pnpm 9+ (`npm install -g pnpm`)
- Chrome or Chromium based browser
- (Optional) Neon PostgreSQL database for cloud sync
- (Optional) AWS account for Cognito auth + S3 thumbnails
- (Optional) Groq API key for AI tab assistant (free at [console.groq.com](https://console.groq.com))

### Installation

```bash
git clone https://github.com/danielzhao07/TabFlowV1.git
cd TabFlowV1
pnpm install
pnpm build
```

### Load in Chrome

1. Navigate to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select `apps/extension/.output/chrome-mv3`

### API Setup (optional, for cloud sync)

```bash
cp apps/api/.env.example apps/api/.env
# Edit .env with your Neon DATABASE_URL, Cognito, S3, Gemini keys

cd apps/api && npx drizzle-kit push && cd ../..
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

## License

Copyright (c) 2025 Daniel Zhao. All rights reserved.

This software and associated documentation files (the "Software") are proprietary and confidential. Unauthorized copying, modification, distribution, or use of this Software, via any medium, is strictly prohibited without express written permission from the copyright holder.

See [LICENSE](LICENSE) for full terms.

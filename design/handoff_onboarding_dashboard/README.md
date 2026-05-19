# Handoff: Mirage — Onboarding & Dashboard

## Overview
This handoff covers two surfaces of **Mirage**, Presight's internal tool for generating realistic, dependency-aware fake data:

1. **Onboarding (sign-in screen)** — first-time and returning sign-in. Supports SSO (Google, Microsoft, Okta), email + password, and passkeys.
2. **Dashboard** — the post-login application shell, defaulting to the **Schemas** workspace where users define data shapes and faker bindings. Includes left nav, top bar, schema list, schema editor, and live JSON preview.

## About the design files
The files in `sources/` are **design references created in HTML/JSX** — interactive prototypes showing intended look and behavior, **not production code to copy directly**. They're built with React 18 + Babel-standalone purely so the prototype renders in a browser; styles live in plain CSS using shadcn-inspired HSL tokens.

The task is to **recreate these designs in the target codebase's existing environment** (the Mirage repo is `nx`-based per `mirage/README.md`, so likely React + Tailwind or shadcn/ui — confirm with the team) using its established patterns, component library, and conventions. If a relevant component already exists (a `<Button>`, `<Input>`, `<Sidebar>`, etc.) prefer that over re-implementing what the HTML shows.

## Fidelity
**High-fidelity.** All colors, type scale, spacing, radii, and component states are final. Exact HSL values are listed in **Design tokens** below — the developer should map these onto the codebase's existing token system (or add them if missing) and reproduce the screens pixel-faithfully.

The one exception is the **icon set** in `Icon.jsx` (Carbon-aligned hand-drawn SVG paths). These are placeholder approximations — in the real app use the team's existing icon library (Carbon Icons, Lucide, Tabler, etc.).

---

## Screens

### 1. Sign in (onboarding)

**Source file:** `sources/auth-screens.html` → `LoginSplit` component in `sources/Pieces.jsx` (search for `function LoginSplit`).

**Purpose:** Authenticate a user into Mirage. Designed for the enterprise workflow where most users will hit SSO, but email/password and passkey are present as fallbacks.

**Layout:** Full-viewport split, two equal columns.

- **Left column (dark, product preview)** — `background: hsl(240 10% 4%)`. Two radial gradient overlays for the brand-violet (top-left) and brand-cyan (bottom-right) wash. Contains, top→bottom:
  - Wordmark logo (`MirageMark` 28px) + "Mirage / by presight"
  - Headline: *"Realistic data, on demand."* — 36px, weight 600, letter-spacing -0.025em. "on demand." uses the violet→cyan linear-gradient text fill.
  - Sub-headline body: 14px, line-height 1.6, color `hsl(240 5% 70%)`, max-width 460px.
  - **Code preview card** — fake `person.json` schema sample with syntax-highlighted JSON. Background `hsl(240 8% 7%)`, border `hsl(240 5% 14%)`, radius 10px. Has a tab bar (active "person.json"), the JSON body, and a footer with green dot + "generation complete · 4.2s · seed mirage-uae-2026-001".
  - Three bullets with colored dots (violet, cyan, emerald): "Deterministic by salt", "120+ faker functions", "Push anywhere".
  - Footer: © 2026 Presight · Mirage + Privacy / Terms / Status / v2.4.1 links.

- **Right column (light, form)** — `background: hsl(var(--background))` (white). Centered form `max-width: 380px`. Top→bottom:
  - Env chip pill: green dot + "presight workspace · dev" + chevron-down to switch.
  - H2: "Sign in to Mirage" — 24px / 600 / -0.02em.
  - Lede: "Use your work email or single sign-on." — 14px muted.
  - **SSO stack** (vertical, gap 8px): "Continue with Google", "Continue with Microsoft", "Continue with Okta SSO". Each is a 40px-tall button with provider icon, white background, 1px border, font-size 13px, weight 500.
  - "or with email" divider — 11px uppercase muted text between two horizontal lines.
  - Email field (`autoComplete="email"`, defaults to `pathik.devani@presight.ae` for demo).
  - Password field with inline "Forgot?" link on the right of the label.
  - Checkbox row: "Keep me signed in on this device" (checked by default).
  - Primary CTA: "Sign in" with arrow-right icon — 42px tall, `hsl(var(--primary))` background (near-black), white text.
  - Passkey button: dashed border, 36px tall, key icon + "Use passkey instead".
  - Footer: "New to Mirage? Request access →" — request link uses brand violet.

**Components and states:**
- All inputs: 40px height, 12px horizontal padding, radius `var(--radius-md)` (6px), 1px border `hsl(var(--input))`. Focus state: border-color `hsl(var(--ring))` + 3px box-shadow ring at 10% opacity.
- SSO button hover: background `hsl(var(--accent))`, border darkens to `hsl(var(--foreground) / 0.2)`. 80ms transition.
- Primary button hover: background goes to `hsl(240 5.9% 18%)`.
- Brand mark uses an inline SVG `<linearGradient>` from `hsl(262 83% 58%)` → `hsl(188 86% 53%)`. Three horizontal rippling lines with decreasing opacity (1, 0.7, 0.4).

**Responsive variations (also in this handoff):**
The same component file (`Pieces.jsx`) contains `LoginMobile` and `LoginTablet` — see `auth-screens.html` for the design canvas showing all 5 variations side-by-side. Bring up the canvas at any time by opening `auth-screens.html` in a browser.

- **Tablet (iPad portrait, ≤ 1024px)** — `LoginTablet`. Centered card design with the dark code-preview rail on the left half and the form on the right half. Hero headline lives above the card.
- **Mobile (≤ 480px)** — `LoginMobile`. Single column, no hero artwork — just logo, headline, SSO stack, email/password, passkey, and env chip at the bottom.

The developer should decide breakpoint cutoffs based on the target codebase. Suggested:
- `< 640px` → mobile layout
- `640–1024px` → tablet/centered-card layout
- `> 1024px` → split layout

---

### 2. Dashboard

**Source files:**
- `sources/mirage-app.html` — top-level shell (renders `<MShell>` + the active page).
- `sources/Shell.jsx` → `MShell` component (left nav + top bar + main content slot).
- `sources/Icon.jsx` → `MIcon` + `MirageLogo` SVG components.
- `sources/DataTable.jsx` — generic data table used in History/Sets pages.
- `sources/Pieces.jsx` — every page body: `SchemasPage`, `GraphPage`, `SetsPage`, `HistoryPage`, `ConnectorsPage`, `FakersPage`, `SettingsPage`, plus the `CreateSchemaSheet` modal.

**Purpose:** The post-login application shell. Default landing page is **Schemas** — the workspace where users define the shape of fake data they want to generate.

**Layout:** CSS grid, `grid-template-columns: 240px 1fr; grid-template-rows: 56px 1fr`.

- **Top bar (`.app-header`)** — full width, 56px tall, sticky. Contains:
  - Brand: `MirageLogo` 28×28 (violet→cyan gradient box) + "Mirage" wordmark + "/" separator + workspace switcher pill.
  - Workspace pill: 32px tall, emerald-tint avatar with "P", workspace name "presight workspace", chevron-down. Clicking opens the workspace dropdown (`.ws-dropdown`) at top:44px left:96px.
  - Env badge: green pill with green dot + "dev" — 24px tall, `hsl(var(--brand-emerald) / 0.1)` background.
  - Right side: search box (240px wide, ⌘K keyboard hint), notification icon button, help icon button, avatar (violet-tint, 28px).

- **Left sidebar (`.app-sidebar`)** — 240px wide, sticky, scrollable. Background `hsl(0 0% 99%)`. Sections (with 11px uppercase muted titles):
  - **Workspace**: Schemas, Dependency graph, Generate
  - **Activity**: Run history, Exports
  - **Library**: Faker reference, Settings
  - Below: a project card showing `$id` / `identity-platform` / "3 schemas · 14 props".
  - Nav items: 32px tall, 13px font, radius `var(--radius-md)`, icon + label, hover `hsl(var(--accent))`, active state has the same accent background + 500-weight label.

- **Main content area** — the Schemas page (default) uses a 3-pane editor layout (`.editor`):
  - **Left pane (280px, `.pane-schemas`)** — schema list with search, each row is a 32px color-tile (violet/cyan/emerald/amber/rose) + name + CRN-like ID + property count. Selected row gets white background and a faint border.
  - **Middle pane (flex 1, `.pane-edit`)** — the active schema's property list. Header has the schema name (24px / 600) + breadcrumb + Save/Generate buttons. Each property row shows: drag handle, property name (mono font with required asterisk in destructive red), the faker binding chip (e.g. `person.firstName` with violet namespace tag), and overflow actions.
  - **Right pane (380px, `.pane-preview`)** — live JSON preview of one generated sample row. Dark background `hsl(240 10% 4%)`, syntax-highlighted, with row navigation arrows at the bottom.

**Other dashboard pages** (also in `Pieces.jsx`, all reached via left-nav):
- **Dependency graph** — visual canvas with schema nodes and ref arrows.
- **Generate** — schema picker + run-bar + export strip.
- **Run history** — table of past generation runs.
- **Connectors** — Postgres/Redis/Snowflake/S3 etc. connector cards.
- **Faker reference** — searchable function library.
- **Settings** — workspace settings.
- **Sets** — grid of dataset cards + a set detail view with the distribution-strategy editor.

The **Create schema** flow opens as a right-side sheet (`.sheet`) with a 3-step stepper and the nested property builder.

**Behavior to preserve:**
- Active nav item is persisted in `localStorage` under key `mirage-page`.
- Sidebar nav items toggle the visible page (state in the root `App` component).
- Pressing "Create" anywhere opens the `CreateSchemaSheet` overlay.

---

## Design tokens

All tokens are HSL triples used inside `hsl(var(--token))` or `hsl(var(--token) / 0.NN)` for alpha variants. They live in `sources/mirage.css` `:root` (lines ~5–50).

### Colors — neutrals (shadcn-style)
| Token | Value | Use |
|---|---|---|
| `--background` | `0 0% 100%` | Page background |
| `--foreground` | `240 10% 3.9%` | Body text |
| `--card`, `--popover` | `0 0% 100%` | Card / popover surfaces |
| `--primary` | `240 5.9% 10%` | Primary button bg, ring |
| `--primary-foreground` | `0 0% 98%` | Primary button text |
| `--secondary`, `--muted`, `--accent` | `240 4.8% 95.9%` | Subtle surfaces, hover |
| `--muted-foreground` | `240 3.8% 46.1%` | Secondary text |
| `--border`, `--input` | `240 5.9% 90%` | All borders |
| `--ring` | `240 5.9% 10%` | Focus ring |

### Colors — brand accents
| Token | Value | Use |
|---|---|---|
| `--brand-violet` | `262 83% 58%` | Primary brand, links, schema icons, refs |
| `--brand-cyan` | `188 86% 53%` | Secondary brand, gradient pair |
| `--brand-emerald` | `142 71% 45%` | Success, env-dev badge, status-ok |
| `--brand-amber` | `38 92% 50%` | Warning, array-type tag |
| `--brand-rose` | `346 87% 60%` | Destructive, production env |

### Colors — status
| Token | Value |
|---|---|
| `--destructive` | `0 84.2% 60.2%` |
| `--success` | `142 71% 45%` |
| `--warning` | `38 92% 50%` |
| `--info` | `217 91% 60%` |

### Spacing
Standard 4/8 grid. Common values used in the design:
- Inline: 4, 6, 8, 10, 12, 14, 16, 20, 24, 32px
- Vertical rhythm: 6, 8, 12, 16, 20, 24, 32, 48px
- Page padding: 24px vertical, 32px horizontal (`.page-body`)

### Border radius
| Token | Value |
|---|---|
| `--radius` | `0.5rem` (8px) |
| `--radius-sm` | `calc(var(--radius) - 4px)` (4px) |
| `--radius-md` | `calc(var(--radius) - 2px)` (6px) |
| `--radius-lg` | `var(--radius)` (8px) |
| `--radius-xl` | `calc(var(--radius) + 4px)` (12px) |
| Cards (login centered, dashboard cards): 12px |
| Inputs / buttons: 6px (`--radius-md`) |
| Avatars / chips: 999px (pill) |

### Typography
- Family: **Inter var** (loaded from `https://rsms.me/inter/inter.css`), fallback `'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif`.
- Feature settings: `'cv11', 'ss01'`.
- Mono: `ui-monospace, 'JetBrains Mono', SFMono-Regular, Menlo, monospace`.
- Base body size: 14px / line-height 1.5.

Scale used:
| Use | Size | Weight | Tracking |
|---|---|---|---|
| Hero headline (login dark side) | 36px | 600 | -0.025em |
| Tablet hero | 44px | 600 | -0.03em |
| Page h1 (dashboard) | 24px | 600 | -0.02em |
| Login form h2 | 24px | 600 | -0.02em |
| Card h3 / form labels | 13–14px | 500–600 | — |
| Body | 14px | 400 | — |
| Form body / input | 13px | 400 | — |
| Helper / lede | 12–13px | 400 | — |
| Section labels (uppercase) | 11px | 500 | 0.05em |

### Shadows
- Card lift (login centered card): `0 1px 3px rgba(0,0,0,0.04), 0 10px 30px -10px rgba(0,0,0,0.08)`
- Heavy lift (workspace panel): `0 1px 3px rgba(0,0,0,0.04), 0 20px 50px -20px rgba(0,0,0,0.1)`
- Phone bezel (mobile): `0 30px 60px -20px rgba(0,0,0,0.15)`
- Dropdown: `0 10px 25px -5px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)`

---

## Interactions & behavior

### Onboarding
- **SSO buttons** — clicking should redirect to the provider's auth flow. On return, jump straight into the dashboard (or the workspace picker if the user belongs to multiple workspaces — see variation C `LoginWorkspace` in the canvas).
- **Email + password** — standard submit. On invalid credentials show an error state above the form (not designed yet — use the codebase's existing form-error pattern).
- **Passkey** — invoke `navigator.credentials.get({ publicKey: ... })` (WebAuthn). UI affordance is just the dashed button.
- **"Keep me signed in"** — controls token TTL (30 days vs session).
- **Env chip / workspace switcher** — clicking chevron opens a dropdown to switch between workspaces *before* signing in. Useful for staff with prod + dev access who want to sign into a specific environment.
- All transitions on hover: `80ms ease`.

### Dashboard
- **Nav** — clicking a sidebar item swaps `page` state; persisted to `localStorage.mirage-page`.
- **Workspace switcher** — clicking the pill in the top bar opens `.ws-dropdown` (positioned absolute, see CSS).
- **Schema list selection** — clicking a `.schema-card` makes it active (`.active` class) and updates the middle/right panes.
- **Create schema** — opens `CreateSchemaSheet` as a right-side overlay (`.sheet`). Animation: `sheetIn` 200ms `cubic-bezier(0.16, 1, 0.3, 1)` from 40px translateX + fade. Overlay backdrop is `hsl(0 0% 0% / 0.4)` with 4px backdrop-blur.
- **Property row hover** — `background: hsl(0 0% 99%)`. Active prop row: 1px primary border + 3px primary-at-6%-opacity box-shadow ring.
- **Live preview re-roll** — there's a violet "↻ re-roll" button on the sample card; clicking should regenerate just that one preview row.

### Responsive
- Login screens have dedicated mobile/tablet layouts (see `LoginMobile`, `LoginTablet`).
- Dashboard is **desktop-only** in this design (min-width 1280px enforced via `.editor`). If mobile support is needed, that's a separate exercise — flag it back to design.

---

## State management

### Onboarding
- `email`, `password`, `keepSignedIn` (local form state)
- `selectedWorkspace` (when multi-workspace)
- `authState`: idle / submitting / error
- After successful auth: store JWT/session, redirect to `/dashboard` (or `/workspaces/:id`).

### Dashboard
- `page` — string, persisted to `localStorage.mirage-page`. Drives which body component renders.
- `creating` — boolean, controls `CreateSchemaSheet` visibility.
- `selectedSchema` — current schema being edited (per-page).
- `selectedProperty` — current property in detail panel.
- Server data (fetched on mount): list of schemas, current workspace, faker functions, recent runs.

The prototype keeps everything in React local state — in the real app this should likely move to:
- TanStack Query for server data (schemas, runs, fakers)
- A small store (Zustand / Jotai) for cross-cutting UI state (active workspace, active page, sheets/modals)

---

## Assets
- **Mirage logo** — three rippling horizontal lines in violet→cyan gradient. Defined inline as SVG in `Icon.jsx` (`MirageLogo`) and `Pieces.jsx` (`MirageMark`). Use these as-is — no external file.
- **Icons** — `MIcon` in `Icon.jsx` has ~50 Carbon-aligned glyphs as inline SVG paths. **These are placeholders.** Replace with the team's icon library at implementation time.
- **SSO provider icons** — inline SVGs in the login screens (`GoogleIcon`, `MicrosoftIcon`, `OktaIcon`). Trademark assets; in production fetch official SVGs from each provider's brand kit.
- **Font** — Inter Variable, loaded from `rsms.me/inter`. Use whatever CDN/self-host pattern the codebase already has for Inter.
- **No raster images** anywhere in the design.

---

## Files in this handoff

| File | Purpose |
|---|---|
| `sources/auth-screens.html` | Design canvas showing all 5 login variations (split, centered, workspace picker, tablet, mobile). Open in a browser to preview. |
| `sources/mirage-app.html` | Dashboard app shell, renders the schemas page by default. |
| `sources/mirage.css` | All shadcn-style tokens + dashboard component styles. |
| `sources/login.css` | Login-specific styles extending `mirage.css`. |
| `sources/Icon.jsx` | `MIcon` icon set + `MirageLogo` brand mark. |
| `sources/Shell.jsx` | `MShell` — top bar + left nav. |
| `sources/DataTable.jsx` | Reusable data table component. |
| `sources/Pieces.jsx` | All page bodies (Schemas, Graph, Sets, History, etc.) + the `Login*` components + the `Create schema` sheet. Large file — search for the component you need. |
| `sources/design-canvas.jsx` | Pan/zoom canvas used by `auth-screens.html` to show variations side-by-side. **Not part of the product** — purely a presentation harness. Don't port it. |

---

## Implementation checklist (for the developer)

1. Confirm the framework (likely React + Tailwind or shadcn/ui given the token style — check with team).
2. Map the HSL tokens above into the codebase's existing token system. Add brand accents if missing.
3. Build/reuse: `Button`, `Input`, `Checkbox`, `Card`, `Badge`, `Sidebar`, `TopBar`, `Sheet`, `Dropdown`. Most of these likely already exist.
4. **Onboarding route** (`/login` or similar):
   - Implement the **Split** layout for `≥1024px`, **Centered** card for `640–1024px`, **Mobile** stack for `<640px`.
   - Hook up SSO providers, email/password, passkey via WebAuthn.
   - Post-auth, route to `/dashboard` (or `/workspaces/:id`).
5. **Dashboard route** (`/dashboard` or workspace root):
   - Implement `MShell` (sidebar + topbar + content slot).
   - Implement the **Schemas** page with the 3-pane editor as the default landing.
   - Wire up `localStorage.mirage-page` for nav persistence.
   - Other pages (Graph, Generate, History, Connectors, Fakers, Settings, Sets) can be stubbed initially — designs exist in `Pieces.jsx` for reference.
6. Replace the placeholder `MIcon` set with the team's icon library.
7. Add real loading, error, and empty states (the prototypes show only the populated happy path).

# Mirage — Screens Export

This bundle contains every screen designed in this session.

## How to view
Open `auth-screens.html` in a browser. It loads a pan/zoom canvas showing all 7 sign-in variations side by side:

**Sign in**
- A. Split — product preview + form (recommended)
- B. Centered — minimal card
- C. Workspace picker — post-SSO multi-workspace
- C2. Create workspace — form to add a new workspace
- C3. Empty — first-sign-in state (zero workspaces)

**Tablet & mobile**
- D. Tablet — iPad portrait
- E. Mobile — iPhone Pro

Open `mirage-app.html` to view the dashboard (default Schemas page + left nav + workspace switcher + create-schema sheet).

## Files
| File | Purpose |
|---|---|
| auth-screens.html | Canvas with all login variations |
| mirage-app.html   | Dashboard app shell |
| mirage.css        | Design tokens + dashboard component styles |
| login.css         | Login-specific styles |
| Icon.jsx          | Icon set + Mirage logo |
| Shell.jsx         | App shell (top bar + sidebar) |
| DataTable.jsx     | Reusable data table |
| Pieces.jsx        | All page bodies + login components |
| design-canvas.jsx | Pan/zoom canvas harness (presentation only) |

No build step needed — just open the HTML files.

# Figr viewer

A board of live, cross-origin page previews with host-drawn hover/selection outlines, a lazy layers tree, an inspector, and failure regions that each fail on their own and report exactly once.

The original brief is in [BRIEF.md](BRIEF.md) (requirements R1–R6).

## Run it

```bash
npm start
```

Then open http://localhost:5173. `npm start` installs dependencies if they're missing, builds the page agent, then runs the mock backend (`:4000` API, `:4001` pages), the agent watcher and the Vite dev server together.

- **Node ≥ 22.12** for the app tooling (Vite 8, Vitest 5). The kit's backend alone still runs on Node 18 (`npm run backend`).
- `npm test` runs the unit tests (93), and `npm run typecheck` runs TypeScript.
- **Dev menu** (top right, dev builds only) triggers every R6 failure on demand.

Keys: **V** Select, **I** Interact, **Esc** clear, **Enter / Shift+Enter** child / parent, **Tab / Shift+Tab** next / previous sibling, **Ctrl/Cmd + wheel** zoom. With the layers panel focused, the arrow keys move through the tree.

## What I built, and the main calls

| Piece | Where | One-line why |
|---|---|---|
| **Page agent** | `frontend/src/agent` → built to `backend/pages/figr-agent.js` | The host is cross-origin and can't touch the DOM, so anything that needs the DOM runs in the page and answers over `postMessage`. |
| **Shared protocol** | `frontend/src/protocol/messages.ts` | One typed file imported by both sides, so the two ends can't drift apart. |
| **Select-mode shield** | `host/board/Shield.tsx` | A transparent div over each iframe eats every pointer event. Clicks can't reach the page, by construction. |
| **Screen-space overlay** | `host/overlay/Overlay.ts` | Outlines are drawn outside the zoomed board, so lines stay 1px/2px and labels keep their size at any zoom. |
| **Single-writer stores** | `host/state`, `host/layers/store.ts` | Each piece of state has one owner and is changed through named actions only. |
| **Regions** | `host/regions` | Error boundary + guarded callbacks + region-owned timers → one path for every failure. |

Each page gets exactly one added line, `<script src="figr-agent.js"></script>`, in `<head>`. It sits in `<head>` so the agent's error listeners exist before the page's own scripts run. That's how page-6's rejection and page-1's crash get caught.

## Ambiguities in the brief, and what I decided

1. **Do page errors go to `report()`?** The brief says *every failure* does, so yes: once per error event, region `preview`. They show as a badge, not a region error.
2. **Shortcuts in Interact mode.** The page must "behave normally", so Tab and Enter stay native. The agent forwards only **V / I / Esc**, and only when focus isn't in an editable field (typing "i" in the sign-up form must not switch modes). In Select mode, focus can be left inside an iframe from Interact mode. There the agent forwards every shortcut and `preventDefault`s it.
3. **"Script doesn't respond within 10 seconds."** I apply this both at connect time (no `hello`) and later (a heartbeat ping every 5s; a ping unanswered for 10s). Either way the preview shows "Couldn't connect to this preview". If the host itself wasn't running (background-tab throttling, laptop sleep), the heartbeat sends a fresh ping instead of declaring every preview dead.
4. **Which elements appear in layers.** "Any element", minus non-rendered tags (`script, style, link, meta, template, noscript, title, head, base`). They can't be hovered and would only add noise.
5. **Clicking a page's background** counts as clicking in that preview: it becomes active and the selection clears. Clicking empty board space clears the selection but keeps the active preview.
6. **Navigation vs "no longer exists".** Navigation clears that preview's selection and the inspector shows its empty state. "This element no longer exists" is reserved for DOM removal (R3.7).
7. **Search** is a case-insensitive substring match on the element name.
8. **"Position within the page"** is in document coordinates (rect + page scroll), not viewport coordinates.
9. **A failed reveal** (selecting a deep element while the page is slow): the host doesn't know the ancestor chain yet, so there's no row to mark. The panel shows "Couldn't load the selected element" + Retry, reported as `layers-row`.
10. **Which timeouts count as failures.** Row loads and reveal → `layers-row`. Search → the layers region. Hit-test, keyboard navigation and scroll-to timeouts are silent: the user has moved on and there's no region to show them in. A dead agent is caught by the heartbeat and reported once as `preview`.
11. **Enter on a leaf** does nothing. **Tab with one sibling** wraps to itself.
12. **Hover in Interact mode** (including from layers rows) draws nothing, since "no outlines are drawn".

## How state is organised

The agent owns *the truth about the page*. The host owns *what the user intends*. The host never guesses page state: it asks, or receives a push.

| State | Lives in | Who may change it |
|---|---|---|
| Element ids, descriptors, loaded parents, watched/inspected ids | Agent (`agent/ids.ts`, `agent/index.ts`) | Agent only |
| Pan/zoom `{x, y, zoom}` | `state/viewport.ts`, a plain observable (not React) | Pan/zoom handlers. Read imperatively by the world transform and overlay, so no React render per frame |
| Screens, mode | `state/board.ts` | Board fetch, toolbar, V/I |
| Connection status, page errors | `state/previews.ts` | That preview's `PreviewConnection` |
| Active preview, selection (ordered, most recent last), "gone" notice | `state/selection.ts` | `select()` / `clear()`. A connection may only *remove* ids (page removed them) or clear on navigation |
| The single hover + an epoch | `state/hover.ts` | Hover actions. Every clear bumps the epoch, and each preview's hit-tester has its own generation bumped when the pointer leaves, so stale hit-test replies are dropped |
| Layers tree per preview: nodes, children lists with load state, expanded set, scroll position, search | `layers/store.ts` + pure reducers in `layers/model.ts` | Layers controller + agent pushes |
| Live inspector values | `state/live.ts` | Agent pushes |
| Element geometry | `overlay/geometry.ts` (non-React) | Agent pushes; read every frame by the overlay |

Two invariants matter most:
- **Children lists are replaced, never appended.** A reply only lands if it still owns the row (load token). Collapsing and re-expanding mid-load reuses the in-flight request. Duplicate or missing children are impossible by construction (tests in `layers/model.test.ts`).
- **Per-preview layers state** survives switching the active preview and is dropped only when that preview navigates (R4.9).

## Host ↔ page protocol

All messages share one envelope: `{ns: "figr", v: 1, docId, kind, reqId?, payload, error?}`.

**Handshake:**
1. The agent starts in `<head>`, creates a random `docId`, and posts `hello` to the parent. `hello` carries nothing else.
2. The host matches it by `event.source` and origin, then sends `init` to the *pages origin*.
3. The agent locks onto the origin of that `init` and ignores every other sender from then on.

**Requests** (host → agent; each has its own timeout, reply carries the same `reqId`):

| Request | Timeout | Notes |
|---|---|---|
| `init`, `ping` | 10s | Handshake and heartbeat |
| `hitTest{x,y}` | 1s | Latest-wins, one in flight per preview |
| `getChildren{id}` | 3s | Lazy row load |
| `reveal{id}` | 3s | Ancestor chain + every ancestor's children in **one** round trip. Page-5's 30 levels = 1 request |
| `search{q}` | 3s | Runs over the whole DOM, so it finds rows never loaded |
| `relative{id, dir}` | 1s | Keyboard navigation |
| `scrollTo{id}` | 1s | Adjusts only the page's own scrollers. Never `scrollIntoView`, which also scrolls ancestor frames and would move the board |

**Fire-and-forget** (host → agent): `wheel`, `watch{ids}`, `inspect{ids}`, `setMode`, `devFault`.

**Pushes** (agent → host): `rects` (changed geometry only), `treeChanged` (only for parents the host loaded), `removed`, `inspectData`, `pageError`, `key`, `zoomWheel`.

**Geometry split:** the agent reports rects in iframe-viewport coordinates and the host applies pan/zoom. Pan and zoom never round-trip, so outlines stay glued with zero lag. The agent also sends a `clip` rect, the viewport intersected with every overflow-clipping ancestor. That way an outline inside page-3's orders table is clipped by the table's scroll box, not just the preview edge.

**When the other side is slow, gone or replaced:**
- **Slow:** per-request timeouts. A reply after its timeout finds no pending entry and is dropped.
- **Gone:**
  - No `hello` within 10s of mount, or after an iframe `load` with no new `hello` (the page navigated somewhere without the agent) → "Couldn't connect to this preview" + Retry.
  - A silent agent mid-session → the heartbeat catches it (a ping unanswered for 10s).
- **Replaced (navigation):** a `hello` with a new `docId`. Pending requests to the old document are rejected as *cancelled* (never shown, never reported), messages tagged with the old `docId` are dropped, and that preview's selection, tree and memory reset. Hash links keep the same document, so nothing resets.

## Identifying elements across re-renders and navigation

Page-4 rebuilds its whole list with `innerHTML` every 2s, prepends new items, and only odd items have a `data-key`. Two simpler approaches fail here:
- **Node identity alone** loses everything on every tick.
- **Index paths** jump to a different item whenever one is prepended, which R3.7 forbids.

What I built (`agent/ids.ts`):
- Each element gets a **persistent id**.
- For every element the host knows about, the agent stores a **descriptor**: the steps from `<body>` down to it. Each step uses the strongest discriminator available among its siblings, in this order:
  1. `data-key`
  2. `id`
  3. `data-name`
  4. tag + classes, if unique among siblings
  5. tag + classes + normalised text (whitespace collapsed, each run of digits folded to `#`, so "9s ago" equals "10s ago")
  6. position among identical siblings, trusted only if the sibling count didn't change
- After each `MutationObserver` batch, every known id whose node is detached is re-resolved by walking its descriptor through the live DOM. Exactly one match at every step rebinds the **same id** to the new node. Zero or several matches → the element is gone. A match already owned by another live id is also "gone", never a jump.

Because the ids survive, expanded rows and the selection survive rebuilds too. In the browser, an unkeyed feed item stayed selected through 12 seconds of full rebuilds, moving down the list as new items were prepended.

**Navigation:** each document has its own `docId`, so a new `hello` is the navigation signal (R3.8). Select mode keeps working on the new page without reloading the board.

## How the tree loads

- Top-level rows load when a preview becomes active.
- Expanding a row calls `getChildren`. The row shows "Loading…", then either its children or, after 3s, "Couldn't load" + Retry on that row only.
- A late reply after the timeout is ignored.
- **Selecting in the preview** calls `reveal`, which loads and expands every ancestor at once, highlights the row, and scrolls the panel to it. Deep rows also scroll the panel horizontally so the name is visible.
- **When the page changes its DOM**, `treeChanged` replaces that parent's list. Before the commit the panel records its first visible row and offset, and restores them afterwards, so rows above the viewport (page-4 prepends) don't push content down. Rows are a fixed 24px, which makes this arithmetic exact.
- **Search** snapshots the expanded set on the first keystroke and restores it exactly on clear.

## How failures are contained and reported

- **A `<Region>`** wraps the board, each preview, the layers panel, the inspector and its Details section. Each layers row has its own row-level error state.
- **Any source, same path (R6.5).** Render errors hit the boundary. Event handlers, message handlers, fetch callbacks and timers are wrapped with `region.guard()` or `region.setTimeout()`. The overlay renderer and the keyboard handler find their region through a small registry. Everything ends in `capture()`: the region shows its error with Retry, and everything else keeps working.
- **Exactly once (R6.4).** `reportFailure()` is the only caller of `report()`. It keeps a `WeakSet` of error objects already reported, so a boundary and a catch seeing the same error report it once. A retry produces a new error object, so it counts again. `AbortError` and `CancelledError` are filtered out: a superseded request isn't a failure.
- **Late arrivals (R6.6).** Regions own their timers and clear them on unmount. Async results check their load or request token before landing. A connection is disposed with its preview. A region that's gone isn't in the registry, so late errors change nothing and report nothing.
- **Details** are mounted with the selection as their React `key`. Changing the selection unmounts them and aborts the fetch, so only the latest selection's details can ever show (R5.3).

The dev menu triggers each failure on its *real* code path: the server's `?fail=1`, a missing page, an agent told to go silent, or a throw inside a real handler.

## Where this breaks

- **Identical unkeyed siblings reordered in one batch with the same count** may rebind to the wrong one (rule 6). Two unkeyed siblings that differ only by numbers count as identical because of digit folding.
- **An unkeyed element *replaced* by a different one that looks the same** is treated as the same element. If the page swaps the only `li` under a parent for another `li` (rules 4–5), or for one whose text differs only in digits ("#1002 Pending" → "#1009 Pending"), the selection moves to the new node. There's no way to tell "rebuilt" from "replaced" without a key.
- **Unkeyed elements whose only distinguishing feature is changing text** (beyond digits) lose their identity when the page rebuilds them. They're dropped, never mismatched.
- **`pointer-events: none`** elements are skipped by `elementsFromPoint`, so they can't be hovered from the preview (they're still reachable from the layers panel).
- **Shadow DOM and nested iframes** inside pages are not traversed.
- **`position: fixed` elements inside a scrolling ancestor** get clipped by that ancestor's box even though they escape it visually.
- **Off-screen previews:** browsers stop `requestAnimationFrame` in off-screen cross-origin iframes. The agent falls back to a 150ms timer, which browsers throttle in hidden frames, so geometry and live values update slower until the preview is back on screen.
- **Late row-load failures for an inactive preview.** Layers state is kept per preview (R4.9), so if you switch away while a row is loading and it then times out, that row shows "Couldn't load" when you come back, and the failure is reported then rather than dropped.
- **No virtualisation** in the layers panel. Page-5 fully expanded (~1,450 rows) is fine; a 10k-element page would be sluggish.
- **Hover is one `postMessage` hop behind the pointer.** Very fast movement can lag a frame.
- **Errors the page catches itself** never reach the agent, so there's no badge for them.
- **The dev "fail next request"** applies to every request that starts while it's armed, so two simultaneous requests would both fail.

### With another week

- Virtualise the layers panel, keeping the fixed row height so the anchoring maths still holds.
- Add Playwright end-to-end tests that drive real iframes for R1–R6. Today those are verified by hand.
- Use a `MessageChannel` port per preview instead of window `postMessage` plus source matching.
- Let pages opt into stable keys (a `data-key` audit), and show identity confidence in the inspector.
- Batch `rects` and `inspectData` into one message per frame, and pause watching entirely for previews far off-screen.

## Tests

`npm test` covers the logic that's easiest to get subtly wrong:
- Identity across rebuilds with prepends, ambiguity and conflicts (`agent/ids.test.ts`).
- Tree, reveal, search and relative navigation (`agent/tree.test.ts`).
- The connection's docId gate, timeouts, late replies, navigation, heartbeat and connect timer (`PreviewConnection.test.ts`).
- Layers invariants: no duplicates, stale tokens, search restore, keyboard helpers (`layers/model.test.ts`).
- Layers controller: load once, a row timeout reported once with its late reply ignored, retry counts again, cancelled and reset loads not reported, latest reveal wins (`layers/controller.test.ts`).
- Hover hit-testing: one request in flight, latest point wins, replies after the pointer left or after a pan/zoom dropped (`board/hitTester.test.ts`).
- Selection reducers, exactly-once reporting, API validation, zoom maths and the Mixed merge.

## What I took from public products

- **Figma frame labels:** screen names are counter-scaled (`scale(1 / zoom)`), so they read the same at 25% and 400%. Outlines and labels live in screen space for the same reason.
- **Browser DevTools' Elements panel:** lazy expansion, reveal-on-select, and arrow-key tree navigation (→ expands, then enters the first child; ← collapses, then goes to the parent).

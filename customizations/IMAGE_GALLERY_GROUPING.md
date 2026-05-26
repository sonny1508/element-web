# Image Gallery Grouping

Consecutive `m.image` events from the same sender (within 10 seconds of each other) are visually grouped into a compact grid of uniform square thumbnails inside a bubble wrapper. Single images also receive the bubble wrapper treatment. If any image in a group has a caption (MSC2530), it is displayed below the grid.

## Architecture

This feature uses Element Web's **BaseGrouper** pattern — the same abstraction that `CreationGrouper` and `MainGrouper` use to collapse events in the timeline.

```
MessagePanel.tsx
  └── groupers array: [ImageGalleryGrouper, CreationGrouper, MainGrouper]
        │
        ▼  (highest priority — checked first)
  ImageGalleryGrouper (custom)
        │
        ├── GalleryTile       — <li> wrapper providing:
        │                         · sender avatar (MemberAvatar)
        │                         · hover highlight + action bar (ActionBarWrapper)
        │                         · right-click MessageContextMenu
        │                         · ReactionsRowWrapper (per representative event)
        │                         · ReadReceiptGroup (aggregated across the group)
        └── renders either:
              ├── MImageBody (single image, wrapped in .mx_MImageBody_single)
              └── MImageGallery (2+ images, compact square-cropped grid)
```

### BaseGrouper lifecycle

The grouper system in `MessagePanel.tsx` iterates timeline events and asks each grouper class (in order) whether it can claim a run of events:

1. **`canStartGroup(panel, wrappedEvent)`** — static. Returns `true` if the event is `m.room.message` with `msgtype: m.image`.
2. **`shouldGroup(wrappedEvent)`** — instance. Returns `true` if the next event is also an image from the same sender and within `MAX_GAP_MS` (10 seconds) of the previous image in the group.
3. **`add(wrappedEvent)`** — pushes the event onto `this.events`.
4. **`getTiles()`** — renders the final React output: a single `<GalleryTile>` wrapping either a lone `<MImageBody>` or an `<MImageGallery>` grid.
5. **`getNewPrevEvent()`** — returns the last event in the group so the next date separator check uses the correct timestamp.

### Registration in MessagePanel

```ts
// apps/web/src/components/structures/MessagePanel.tsx  line ~1113
const groupers = [ImageGalleryGrouper, CreationGrouper, MainGrouper];
```

`ImageGalleryGrouper` is first in the array, so it has highest priority. Once it claims a run of consecutive images, those events are not offered to `CreationGrouper` or `MainGrouper`.

## Files

| File | Status | Purpose |
|------|--------|---------|
| `apps/web/src/components/structures/grouper/ImageGalleryGrouper.tsx` | **New** | Grouper class + GalleryTile (avatar, action bar, read receipts, reactions) |
| `apps/web/src/components/structures/MessagePanel.tsx` | Modified | Register grouper; expose `readReceiptsByEvent`, `readReceiptMap`, and `isUnmounting` for groupers |
| `apps/web/src/components/views/messages/MImageGallery.tsx` | Pre-existing (heavily modified) | Compact square-cropped grid component |
| `apps/web/res/css/views/messages/_MImageGallery.pcss` | Modified | All gallery styles incl. bubble negative margins + msgOption row |
| `apps/web/src/components/views/context_menus/MessageContextMenu.tsx` | Modified | `onRedactClick` threads `galleryEvents` into `createRedactEventDialog` as `extraEvents` |
| `apps/web/src/components/views/dialogs/ConfirmRedactDialog.tsx` | Modified | Accepts `extraEvents` and redacts every event with a single confirmation |
| `apps/web/src/components/views/dialogs/ForwardDialog.tsx` | Modified | Gallery preview in forward dialog |
| `apps/web/res/css/views/dialogs/_ForwardDialog.pcss` | Modified | Gallery preview styles in forward dialog |

## Component breakdown

### ImageGalleryGrouper (class, extends BaseGrouper)

The main grouper. Grouping criteria:
- Event type is `m.room.message` with `msgtype: m.image`
- Same sender as the first event in the group
- Timestamp gap from previous image in group is <= 10 seconds (`MAX_GAP_MS`)

`getTiles()` renders a single `<GalleryTile>` containing:
- A `.mx_EventTile_gallery_bubble` wrapper div (provides bubble background + border-radius)
- Either `<MImageBody>` (1 image) or `<MImageGallery>` (2+ images)
- An optional `.mx_EventTile_galleryCaption` div if any image has a caption

**Caption detection** scans ALL images in the group (not just the last), because "Upload All" in the upload dialog puts the caption on the first image whose dialog was visible.

### GalleryTile (functional component)

Wraps the gallery output in an `<li>` that mimics a standard EventTile's DOM structure for layout compatibility:

```html
<li class="mx_EventTile mx_EventTile_gallery"
    data-scroll-tokens="$eventId,$eventId,…"
    data-layout="bubble"
    data-self="true|false">

  <!-- Sender avatar (omitted when mxEvent.sender is missing). Picks up the
       standard EventBubbleTile positioning because the <li> carries
       data-layout="bubble". -->
  <div class="mx_EventTile_avatar">
    <MemberAvatar size="30px" />
  </div>

  <div class="mx_EventTile_gallery_bubble">
    <!-- MImageBody or MImageGallery -->
    <!-- optional caption -->
  </div>

  <!-- Read receipts aggregated across every event in the group. -->
  <div class="mx_EventTile_msgOption">
    <ReadReceiptGroup ... />
  </div>

  <!-- ReactionsRowWrapper (when showReactions is enabled) -->
  <!-- ActionBarWrapper (shown on hover or while focused / context menu open) -->
  <!-- MessageContextMenu (shown on right-click or Options button click) -->
</li>
```

**State managed:**
- `hover` (boolean) — tracked via `onMouseEnter` / `onMouseLeave`. Controls action bar visibility.
- `actionBarFocused` (boolean) — set by `<ActionBarWrapper onFocusChange>` so the bar stays visible while a button (e.g. the emoji picker) is open.
- `contextMenu` (position object | null) — opened by right-click or Options button. When non-null, the action bar also stays visible (prevents flicker when mouse leaves the tile to interact with the menu).
- `reactions` (Relations | null) — re-fetched via `getRelationsForEvent` whenever `MatrixEventEvent.RelationsCreated` fires on the representative event, so the reactions row updates in place.

**Right-click behavior:** If the click target is an `<img>` element, the native context menu is used (so "Copy image", "Save image as..." etc. work). Otherwise, `MessageContextMenu` is shown.

### Action bar

The gallery reuses the standard `<ActionBarWrapper>` from `EventTile.tsx` instead of a bespoke toolbar — this gives it the same Reply / React / Edit / Options affordances as text bubbles, kept in sync with upstream automatically. `GalleryTile` renders it when `hover || actionBarFocused || contextMenu` is truthy. The wrapper receives `galleryEvents` so the Options menu's Forward and Remove actions can fan out across the whole group; `getTile` and `getReplyChain` are stubbed to `() => null` because the gallery doesn't expose a `TileShape`-style ref.

### MImageGallery (grid component)

Located at `apps/web/src/components/views/messages/MImageGallery.tsx`.

Renders a 2-column CSS grid of uniform square thumbnails. All cells are the same size; images are cropped via `object-fit: cover` so the grid stays compact regardless of original aspect ratios. Clicking an image opens the full-size lightbox via MImageBody.

#### Grid sizing

The grid size is controlled by the `maxGridSize` prop (default: 500px for the timeline). This acts as the **height reference** — the maximum total grid dimension. Cell size is derived from it:

```
MAX_CELL_SIZE = floor((maxGridSize - gap) / 2)   // 249px at default 500px
cellSize = min(
    (maxGridSize - (rowCount - 1) * gap) / rowCount,
    MAX_CELL_SIZE
)
```

Grid tracks use **fixed pixel sizes** (not `1fr`) so image content cannot inflate cells:

```tsx
gridTemplateColumns: `repeat(2, ${cellSize}px)`
gridTemplateRows:    `repeat(${rowCount}, ${cellSize}px)`
```

| Count | Layout | Grid dimensions (at 500px) |
|-------|--------|---------------------------|
| 2 | 1 row × 2 columns | 500 × 249 px |
| 3 | 2 rows × 2 columns (one empty cell) | 500 × 500 px |
| 4 | 2 rows × 2 columns | 500 × 500 px |
| 5+ | 2×2 with "+N more" overlay; expands on click | 500 × 500 px (collapsed) |

**Expanded mode** (5+ images, user clicks "+N more"): uses the same cell width (`MAX_CELL_SIZE`) with `gridAutoRows` so the grid grows vertically.

#### Image cropping

Images are square-cropped in the timeline thumbnail only. The full uncropped image is shown in the lightbox on click. The cropping chain requires overriding MImageBody's inline styles at multiple levels:

1. **`.mx_MImageGallery_cell`** — `aspect-ratio: 1/1` (fallback square shape)
2. **`.mx_MImageBody_thumbnail_container`** — all dimensions forced to `100% !important`, native `aspect-ratio` unset
3. **Inner sizing div** — targeted via `.mx_MImageBody_thumbnail_container > div:has(> .mx_MImageBody_thumbnail)` to override the inline `maxWidth` / `maxHeight` that MImageBody applies. Uses `:has()` to avoid hitting the SwitchTransition placeholder wrapper.
4. **`.mx_MImageBody_thumbnail`** — `width: 100%; height: 100%; object-fit: cover`

Each cell delegates to `<MImageBody>`, preserving lightbox, media-visibility, and download behavior.

## CSS architecture

All styles live in `apps/web/res/css/views/messages/_MImageGallery.pcss`.

### Key class hierarchy

```
.mx_EventTile_gallery              — the <li> wrapper
  &[data-layout="group"]           — group layout positioning
  &[data-layout="bubble"]          — bubble layout (primary)
    &::before                      — hover highlight pseudo-element
    .mx_EventTile_gallery_bubble   — the visible bubble container
      .mx_MImageGallery            — grid component wrapper (max-width: 500px)
        .mx_MImageGallery_grid     — CSS grid (fixed pixel tracks)
          .mx_MImageGallery_cell   — individual image slot (square-cropped)
      .mx_MImageBody_single        — single image wrapper (when 1 image)
      .mx_EventTile_galleryCaption — caption text
  &[data-self="true"]              — right-aligned, self background
  &[data-self="false"]             — left-aligned, others background

.mx_EventTile_avatar               — sender avatar (positioned by EventBubbleTile rules)
.mx_EventTile_msgOption            — ReadReceiptGroup row under the bubble
.mx_MessageActionBar               — standard hover toolbar (Reply/React/Edit/Options)
```

### Bubble layout specifics

The bubble layout requires careful z-index layering:

| Element | z-index | Purpose |
|---------|---------|---------|
| `::before` (hover) | 0 | Full-width hover highlight background |
| `.mx_EventTile_gallery_bubble` | 1 | Bubble sits above hover highlight |
| `.mx_EventTile_msgOption` | 2 | Read receipts row stays clickable above bubble |
| `.mx_MessageActionBar` | (default) | Toolbar floats above everything via standard EventTile rules |
| `.mx_EventTile_avatar` | 9 | Sits over the bubble corner per EventBubbleTile defaults |

**Why z-index: 0 instead of -1 for the hover highlight:**
Standard EventBubbleTile uses `z-index: -1` on its `::before` hover highlight. This breaks inside thread reply views because thread panels use `overflow: hidden` which creates a new stacking context — a `z-index: -1` pseudo-element gets pushed behind the parent's background and becomes invisible. The gallery uses `z-index: 0` for the highlight and `z-index: 1` for the bubble content, keeping everything in the same stacking context.

### Bubble width constraint

The bubble (`.mx_EventTile_gallery_bubble`) has `max-width: 500px` (content-box) and `width: fit-content`. This caps the content area to exactly match the grid width so that captions wrap within the bubble rather than inflating it. Element does **not** use a global `box-sizing: border-box` rule, so the 500px applies to the content area; the total bubble width including padding is 500 + 2 × 11 = 522px.

### Bubble negative inline margins

`.mx_EventTile_gallery_bubble` carries `margin-inline-start: var(--EventTile_bubble_line-margin-inline-start, -9px)` and `margin-inline-end: var(--EventTile_bubble_line-margin-inline-end, -12px)`. These mirror the negative margins that standard EventBubbleTile applies to `.mx_EventTile_line`, so the bubble visually overlaps the avatar area on the sender side instead of sitting flush against the `<li>`'s margin edge. Without these, the bubble appeared offset to the right of where the avatar sits.

### Padding model

- `--gutterSize: 11px` — padding between images and the bubble border
- `gap: 2px` on `.mx_MImageGallery_grid` — spacing between grid cells
- The bubble's `overflow: hidden` + `border-radius: var(--cornerRadius)` clips the corners; the grid's own `border-radius: 0` is stripped to avoid double rounding
- Caption uses `padding-top: 4px` (not `--gutterSize`) to keep the bubble close in size to the no-caption variant

### MImageBody overrides

`MImageBody` applies aggressive inline sizing (max-width, max-height, aspect-ratio) via its own rendered styles. Inside the gallery, these must be neutralized so images respect the grid cell dimensions:

- **Single image** (`.mx_MImageBody_single`): `max-width: 100% !important`, `aspect-ratio: unset !important`, `object-fit: contain`
- **Grid cells** (`.mx_MImageGallery_cell`): all MImageBody sizing forced to `100%/100%`, inner sizing div overridden via `:has()` selector, `object-fit: cover` on the thumbnail

The `!important` declarations are necessary because MImageBody sets inline styles.

## Grouping heuristics and edge cases

- **MAX_GAP_MS = 10,000 (10 seconds):** Initially 30 seconds, reduced because it was too generous — unrelated images sent casually would merge.
- **Different senders break the group:** If User A sends images and User B sends images interleaved, they form separate groups.
- **Non-image events break the group:** A text message between two images ends the group and starts a new one.
- **Caption on "Upload All":** When using "Upload All", the caption is attached to the first image (the one whose upload dialog was visible). The grouper scans all images and uses the first caption found.
- **Single images still go through the grouper:** They get the bubble wrapper treatment (background, padding, border-radius) for visual consistency, even though there's no grid.

## Interaction with other groupers

`ImageGalleryGrouper` is checked first (index 0 in the `groupers` array). If it claims an event, `CreationGrouper` and `MainGrouper` never see it. If an image event doesn't start a new group (e.g., `shouldShow` is false), it falls through to the next grouper.

## Sender avatar

`GalleryTile` renders a `<MemberAvatar size="30px">` inside a `.mx_EventTile_avatar` wrapper as the first child of the `<li>`. Because the `<li>` carries `data-layout="bubble"`, the standard `.mx_EventTile[data-layout="bubble"] .mx_EventTile_avatar` rules from `_EventBubbleTile.pcss` apply — namely `position: absolute; top: 6px; left: -36px` (others) or `top: -19px; right: -38px` (self). No gallery-specific overrides are needed; the bubble's negative inline margins (see "Bubble negative inline margins" above) cause the bubble to extend behind the avatar so the avatar visually overlaps the bubble corner, matching the standard text-bubble look.

## Read receipts

`GalleryTile` aggregates read receipts across every event in the gallery group and renders a single `<ReadReceiptGroup>` below the bubble. The collection logic lives in `getTiles()`:

```ts
if (this.panel.props.showReadReceipts) {
    const seen = new Set<string>();
    galleryReceipts = [];
    for (const ev of imageEvents) {
        const r = this.panel.readReceiptsByEvent.get(ev.getId()!);
        for (const receipt of r ?? []) {
            if (seen.has(receipt.userId)) continue;
            seen.add(receipt.userId);
            galleryReceipts.push(receipt);
        }
    }
    galleryReceipts.sort((a, b) => b.ts - a.ts);
}
```

`MessagePanel.readReceiptsByEvent`, `MessagePanel.readReceiptMap`, and `MessagePanel.isUnmounting` are `public` (not `private`) precisely so custom groupers like this one can render their own receipts UI. Each receipt only appears once per gallery even if MessagePanel's per-event map happens to bind it to more than one image in the group.

The receipts are wrapped in `<div class="mx_EventTile_msgOption">` so the standard `mx_EventTile_msgOption` styles apply, then gallery-specific CSS (`_MImageGallery.pcss`) resets the 90px-wide float used by the standard group layout and right-aligns the row for self messages, left-aligns for others.

## Remove redacts the whole group

When the user picks **Remove** from the gallery's context menu (right-click or Options button), `MessageContextMenu.onRedactClick` notices the menu was opened with `galleryEvents` and passes the full set as `extraEvents` to `createRedactEventDialog`. The dialog still asks for a single confirmation (and optional reason), but on accept it calls `cli.redactEvent` for every unique event in the group — all images plus whichever image carried the caption — in parallel. This avoids the previous behaviour where Remove only redacted the representative event, leaving the rest of the group (and the caption) orphaned in the timeline.

## Gallery forwarding

When a user right-clicks a gallery and selects Forward, all images in the group are forwarded together. The `galleryEvents` array is threaded from `ImageGalleryGrouper.getTiles()` through `GalleryTile` and `MessageContextMenu` to the `ForwardDialog`. Images are forwarded as-is with no sender attribution. See `customizations/FORWARD_DIALOG.md` for full details.

### Forward dialog preview

The forward dialog renders a compact gallery preview using `<MImageGallery maxGridSize={250}>` inside its own bubble wrapper (`.mx_ForwardDialog_galleryPreview`). This produces a 250px-wide grid (cells at 124px each) for a compact preview.

The optional message typed by the user is shown below the gallery grid as a `.mx_EventTile_galleryCaption` div, mirroring how captions appear in the timeline. The preview area uses `max-height: 45%` of the dialog to accommodate 2×2 grids without clipping.

Key forward-preview CSS (in `_ForwardDialog.pcss`):
- `.mx_ForwardDialog_galleryPreview`: flex layout, `max-width: 380px`, avatar + bubble side-by-side
- `.mx_EventTile_gallery_bubble` (inside preview): `flex: 1`, own padding/background/border-radius
- Caption: `padding-top: 4px` matching the timeline's compact gap

## Relationship to MSC4274

MSC4274 proposes a native Matrix gallery event type (`m.gallery`). It was evaluated and deemed too immature for adoption. The current approach is purely visual — no new event types are created. Each image remains a separate `m.room.message` event with `msgtype: m.image`. If MSC4274 stabilizes in the future, this grouper could be replaced with a single-event approach.

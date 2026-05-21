# Image Gallery Grouping

Consecutive `m.image` events from the same sender (within 10 seconds of each other) are visually grouped into a Teams-style 2x2 grid in the timeline. Single images also receive the bubble wrapper treatment. If any image in a group has a caption (MSC2530), it is displayed below the grid.

## Architecture

This feature uses Element Web's **BaseGrouper** pattern — the same abstraction that `CreationGrouper` and `MainGrouper` use to collapse events in the timeline.

```
MessagePanel.tsx
  └── groupers array: [ImageGalleryGrouper, CreationGrouper, MainGrouper]
        │
        ▼  (highest priority — checked first)
  ImageGalleryGrouper (new, custom)
        │
        ├── GalleryActionBar  — hover toolbar (Reply, Thread, Options)
        ├── GalleryTile       — <li> wrapper with hover/context-menu state
        └── renders either:
              ├── MImageBody (single image, wrapped in .mx_MImageBody_single)
              └── MImageGallery (2+ images, pre-existing grid component)
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
| `apps/web/src/components/structures/grouper/ImageGalleryGrouper.tsx` | **New** | Grouper class + GalleryTile + GalleryActionBar components |
| `apps/web/src/components/structures/MessagePanel.tsx` | Modified | Import + register ImageGalleryGrouper in groupers array |
| `apps/web/src/components/views/messages/MImageGallery.tsx` | Pre-existing (now wired up) | Teams-style 2x2 grid component |
| `apps/web/res/css/views/messages/_MImageGallery.pcss` | Modified | All gallery + bubble + action bar styles |

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
    data-scroll-tokens="$eventId"
    data-layout="bubble"
    data-self="true|false">

  <div class="mx_EventTile_gallery_bubble">
    <!-- MImageBody or MImageGallery -->
    <!-- optional caption -->
  </div>

  <!-- GalleryActionBar (shown on hover or while context menu is open) -->
  <!-- MessageContextMenu (shown on right-click or Options button click) -->
</li>
```

**State managed:**
- `hover` (boolean) — tracked via `onMouseEnter` / `onMouseLeave`. Controls action bar visibility.
- `contextMenu` (position object | null) — opened by right-click or Options button. When non-null, the action bar also stays visible (prevents flicker when mouse leaves the tile to interact with the menu).

**Right-click behavior:** If the click target is an `<img>` element, the native context menu is used (so "Copy image", "Save image as..." etc. work). Otherwise, `MessageContextMenu` is shown.

### GalleryActionBar (functional component)

A lightweight hover toolbar rendered when `hover || contextMenu` is truthy. Three buttons:

| Button | Icon | Action |
|--------|------|--------|
| Reply | `ReplyIcon` | Dispatches `"reply_to_event"` via `defaultDispatcher` with the event and current `timelineRenderingType` from `RoomContext` |
| Thread | `ThreadsIcon` | Dispatches `Action.ShowThread`. If the event is already part of a thread (but not the root), navigates to the existing thread and scrolls to this event. Otherwise starts a new thread. |
| Options | `OverflowHorizontalIcon` | Opens `MessageContextMenu` anchored below the button (reuses the same context menu state as right-click) |

Icons are from `@vector-im/compound-design-tokens/assets/web/icons`.

### MImageGallery (pre-existing component, now integrated)

Located at `apps/web/src/components/views/messages/MImageGallery.tsx`. This component existed before but was never wired up.

Grid layouts based on image count:
- **1 image** — full width (but the grouper doesn't use MImageGallery for single images)
- **2 images** — side by side, each full height
- **3 images** — left column full height, right column 2 stacked
- **4 images** — standard 2x2
- **5+ images** — 2x2 with "+N more" overlay on the 4th cell; clicking expands to show all in a wrapped 2-column grid

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
      .mx_MImageGallery            — grid component
        .mx_MImageGallery_grid     — CSS grid (2x2)
          .mx_MImageGallery_cell   — individual image slot
      .mx_MImageBody_single        — single image wrapper (when 1 image)
      .mx_EventTile_galleryCaption — caption text
  &[data-self="true"]              — right-aligned, self background
  &[data-self="false"]             — left-aligned, others background

.mx_GalleryActionBar               — hover toolbar
  .mx_GalleryActionBar_button      — individual toolbar button
```

### Bubble layout specifics

The bubble layout requires careful z-index layering:

| Element | z-index | Purpose |
|---------|---------|---------|
| `::before` (hover) | 0 | Full-width hover highlight background |
| `.mx_EventTile_gallery_bubble` | 1 | Bubble sits above hover highlight |
| `.mx_GalleryActionBar` | 10 | Toolbar floats above everything |

**Why z-index: 0 instead of -1 for the hover highlight:**
Standard EventBubbleTile uses `z-index: -1` on its `::before` hover highlight. This breaks inside thread reply views because thread panels use `overflow: hidden` which creates a new stacking context — a `z-index: -1` pseudo-element gets pushed behind the parent's background and becomes invisible. The gallery uses `z-index: 0` for the highlight and `z-index: 1` for the bubble content, keeping everything in the same stacking context.

### MImageBody overrides

`MImageBody` applies aggressive inline sizing (max-width, max-height, aspect-ratio) via its own CSS. Inside the gallery, these must be neutralized so images respect the grid cell dimensions:

- **Single image** (`.mx_MImageBody_single`): `max-width: 100% !important`, `aspect-ratio: unset !important`, `object-fit: contain`
- **Grid cells** (`.mx_MImageGallery_cell`): `aspect-ratio: 1/1` on the cell, all MImageBody sizing forced to `100%/100%`, `object-fit: cover` on the thumbnail

The `!important` declarations are necessary because MImageBody sets inline styles.

### Padding model

- `--gutterSize: 11px` — padding between images and the bubble border
- `gap: 2px` on `.mx_MImageGallery_grid` — spacing between grid cells
- The bubble's `overflow: hidden` + `border-radius: var(--cornerRadius)` clips the corners; the grid's own `border-radius: 0` is stripped to avoid double rounding

## Grouping heuristics and edge cases

- **MAX_GAP_MS = 10,000 (10 seconds):** Initially 30 seconds, reduced because it was too generous — unrelated images sent casually would merge.
- **Different senders break the group:** If User A sends images and User B sends images interleaved, they form separate groups.
- **Non-image events break the group:** A text message between two images ends the group and starts a new one.
- **Caption on "Upload All":** When using "Upload All", the caption is attached to the first image (the one whose upload dialog was visible). The grouper scans all images and uses the first caption found.
- **Single images still go through the grouper:** They get the bubble wrapper treatment (background, padding, border-radius) for visual consistency, even though there's no grid.

## Interaction with other groupers

`ImageGalleryGrouper` is checked first (index 0 in the `groupers` array). If it claims an event, `CreationGrouper` and `MainGrouper` never see it. If an image event doesn't start a new group (e.g., `shouldShow` is false), it falls through to the next grouper.

## Gallery forwarding

When a user right-clicks a gallery and selects Forward, all images in the group are forwarded together. The `galleryEvents` array is threaded from `ImageGalleryGrouper.getTiles()` through `GalleryTile` and `MessageContextMenu` to the `ForwardDialog`. Images are forwarded as-is with no sender attribution. See `customizations/FORWARD_DIALOG.md` for full details.

## Relationship to MSC4274

MSC4274 proposes a native Matrix gallery event type (`m.gallery`). It was evaluated and deemed too immature for adoption. The current approach is purely visual — no new event types are created. Each image remains a separate `m.room.message` event with `msgtype: m.image`. If MSC4274 stabilizes in the future, this grouper could be replaced with a single-event approach.

# Custom Changes (Glenda Studio Fork)

Changes made on top of Element Web v1.12.1x. Reference this when migrating to a newer upstream version.

## Theme: Glenda Light / Glenda Dark

Default light/dark themes were replaced with custom `glenda-light` and `glenda-dark` themes.

**Files changed:**

- `apps/web/src/theme.ts`
  - `DEFAULT_THEME` changed from `"light"` to `"glenda-light"`
- `apps/web/src/settings/watchers/ThemeWatcher.ts`
  - `themeBasedOnSystem()`: system theme matching returns `"glenda-dark"` / `"glenda-light"` instead of `"dark"` / `"light"`
  - `isUserOnDarkTheme()`: added `"glenda-dark"` to the dark theme check
  - Removed all high contrast (`preferHighContrast`) logic and listener

## High Contrast Theme Disabled

High contrast theme support removed entirely since only Glenda Light/Dark are available.

**Files changed:**

- `apps/web/src/theme.ts`
  - Emptied `HIGH_CONTRAST_THEMES` map
  - Removed high contrast branch from Compound theme class assignment in `setTheme()`
- `apps/web/src/settings/watchers/ThemeWatcher.ts`
  - Removed `preferHighContrast` media query listener and high contrast resolution in `themeBasedOnSystem()`
- `apps/web/src/components/views/settings/ThemeChoicePanel.tsx`
  - Removed `makeHighContrastTheme()` function and its usage in `useThemes()`
- `apps/web/src/components/structures/UserMenu.tsx`
  - Removed `isHighContrast` state and high contrast branch from theme toggle button

## Hide Empty Rooms from Room List

Rooms named "Empty room" with 0 or 1 joined members are unconditionally hidden from the sidebar, regardless of the client's cached membership state. This catches ghost rooms left behind by admin deletion or stale IndexedDB cache.

**Files changed:**

- `apps/web/src/stores/room-list-v3/isRoomVisible.ts`
  - Hide any room named "Empty room" with `getJoinedMemberCount() <= 1` (previously also required `getMyMembership() !== Join`, which failed for stale cached memberships)

## Default Room History Visibility: Shared

Newly created rooms (DMs and non-public) default to `shared` history visibility instead of `invited`, so joined members can read the full room history.

**Files changed:**

- `apps/web/src/createRoom.ts`
  - Changed default `HistoryVisibility.Invited` to `HistoryVisibility.Shared` for DMs and non-public rooms

## Fix: Double Desktop Notifications on Forward/Reply

Forwarded messages (using reply format) were missing `m.mentions` in the content. Without it, the server falls back to legacy push rules that scan the body text for user IDs — the reply fallback `> <@sender:server>` was being matched as a mention, triggering duplicate notifications.

**Files changed:**

- `apps/web/src/components/views/dialogs/ForwardDialog.tsx`
  - Added empty `"m.mentions": {}` to `buildReplyForwardContent()` output to disable legacy push rules

## Disable "People" in Spaces by Default

The "People" section in space preferences is now hidden by default (users can still enable it per-space).

**Files changed:**

- `apps/web/src/settings/Settings.tsx`
  - Changed `Spaces.showPeopleInSpace` default from `true` to `false`

## Media Captions (MSC2530)

Upload dialog now shows an optional caption text input. When provided, the caption is sent as `body` with the real filename in `filename`, per the MSC2530 spec (stable since Matrix v1.10). Clients that understand captions (Element Web, Element X) render the image with the caption below it. Older clients show the caption text as the message body.

See `customizations/MEDIA_CAPTIONS.md` for full implementation documentation.

**Files changed:**

- `apps/web/src/components/views/dialogs/UploadConfirmDialog.tsx`
  - Added `caption` state and text input below the media preview
  - `onFinished` now passes `caption` as third argument
  - Enter key in caption input triggers upload
- `apps/web/src/ContentMessages.ts`
  - `sendContentListToRoom`: receives caption from dialog, passes to `sendContentToRoom`
  - `sendContentToRoom`: accepts optional `caption` param; when set, puts filename in `content.filename` and caption text in `content.body`
- `apps/web/res/css/views/dialogs/_UploadConfirmDialog.pcss`
  - Styling for `input.mx_UploadConfirmDialog_caption` (uses `input.class` selector for specificity)

## Image Gallery Grouping

Consecutive `m.image` events from the same sender (within 10 seconds) are visually grouped into a Teams-style 2x2 grid in the timeline. Single images also get the bubble wrapper treatment. The gallery uses the existing `MImageGallery` component. If any image in a group has a caption (MSC2530), it is displayed below the grid. Includes bubble layout support (left/right alignment, bubble background), hover highlight, hover action bar (Reply, Thread, Options), and right-click context menu.

See `customizations/IMAGE_GALLERY_GROUPING.md` for full architecture documentation.

**Files changed:**

- `apps/web/src/components/structures/grouper/ImageGalleryGrouper.tsx` *(new)*
  - `BaseGrouper` subclass that groups consecutive same-sender `m.image` events
  - `GalleryTile` wrapper component: `<li>` with hover state, context menu, and action bar
  - `GalleryActionBar` component: Reply/Thread/Options buttons on hover (uses `defaultDispatcher` for Reply and Thread, `MessageContextMenu` for Options)
  - Renders `MImageBody` (single image) or `MImageGallery` grid (2+ images), both inside a `.mx_EventTile_gallery_bubble` wrapper
  - Scans all images for caption (not just last) to handle "Upload All" case
- `apps/web/src/components/structures/MessagePanel.tsx`
  - Imported `ImageGalleryGrouper`
  - Added it to `groupers` array (highest priority, index 0)
- `apps/web/src/components/views/messages/MImageGallery.tsx` *(previously unused)*
  - Already existed but was not wired up — now integrated via the grouper
- `apps/web/res/css/views/messages/_MImageGallery.pcss`
  - `.mx_EventTile_gallery` — tile wrapper with group/bubble layout variants
  - `.mx_EventTile_gallery_bubble` — bubble background, padding, border-radius, z-index layering
  - `.mx_EventTile_galleryCaption` — caption text styling
  - `.mx_GalleryActionBar` / `.mx_GalleryActionBar_button` — hover toolbar styling
  - Hover highlight uses `z-index: 0` (not `-1`) to avoid disappearing in thread panel stacking contexts
  - MImageBody inline sizing overrides (`!important`) for both single images and grid cells

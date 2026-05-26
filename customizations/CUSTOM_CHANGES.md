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

## Media Captions (MSC2530) + @-mention autocomplete

Upload dialog now shows an optional caption text input with @-mention autocomplete sourced from room members. When provided, the caption is sent as `body` with the real filename in `filename`, per the MSC2530 spec (stable since Matrix v1.10). Clients that understand captions (Element Web, Element X) render the image with the caption below it. Older clients show the caption text as the message body. Mentions are emitted as `m.mentions.user_ids` (for push notifications) and as `<a href="matrix.to/…">` inside `formatted_body` (so receivers render them as clickable pills).

See `customizations/MEDIA_CAPTIONS.md` for full implementation documentation.

**Files changed:**

- `apps/web/src/components/views/dialogs/UploadConfirmDialog.tsx`
  - Caption state + controlled text input below the media preview
  - `<Autocomplete>` panel wired to the input via tracked caret position; UserProvider supplies completions sourced from the `room` prop
  - Tracks `state.mentions: CaptionMention[]` (added on completion confirm); filtered at send time to those whose display name still appears in the caption
  - `onFinished` signature: `(uploadConfirmed, uploadAll?, caption?, mentions?)`
  - Wrapper carries `mx_no_textinput` so the global dialog input rule in `_common.pcss` does NOT swap caption/placeholder colours
- `apps/web/src/ContentMessages.ts`
  - Passes `room: matrixClient.getRoom(roomId)` to the dialog
  - `sendContentToRoom` accepts `caption?` and `captionMentions?`; writes `content.filename` + `content.body`, `m.mentions.user_ids` (post `attachMentions`), and a `formatted_body` containing matrix.to links for each mention
- `apps/web/res/css/views/dialogs/_UploadConfirmDialog.pcss`
  - `.mx_UploadConfirmDialog { width: 520px }` (matches ForwardDialog) so the caption editor has room
  - `.mx_Dialog input.mx_UploadConfirmDialog_caption { color: $primary-content }` + `::placeholder { color: $tertiary-content }`
  - Wrapper-scoped `.mx_Autocomplete` override so the dropdown appears just above the input (`bottom: 100%; margin-bottom: 4px; max-height: 200px`)

## Image Gallery Grouping

Consecutive `m.image` events from the same sender (within 10 seconds) are visually grouped into a Teams-style 2×2 grid in the timeline. Single images also get the bubble wrapper treatment. The gallery uses the existing `MImageGallery` component. If any image in a group has a caption (MSC2530), it is displayed below the grid. Includes bubble layout support (left/right alignment, bubble background), sender avatar (matching standard EventBubbleTile positioning), hover highlight, action bar with reactions, right-click context menu, and aggregated read receipts across the whole group.

See `customizations/IMAGE_GALLERY_GROUPING.md` for full architecture documentation.

**Files changed:**

- `apps/web/src/components/structures/grouper/ImageGalleryGrouper.tsx` *(new)*
  - `BaseGrouper` subclass that groups consecutive same-sender `m.image` events
  - `GalleryTile` wrapper component: `<li>` with sender avatar (`MemberAvatar`), hover state, context menu, action bar wrapper (reactions + standard buttons), and `ReadReceiptGroup` aggregated across all events in the group
  - Renders `MImageBody` (single image) or `MImageGallery` grid (2+ images), both inside a `.mx_EventTile_gallery_bubble` wrapper
  - Scans all images for caption (not just last) to handle "Upload All" case
  - Passes `galleryEvents` to `MessageContextMenu` so the Forward and Remove actions act on the entire group
- `apps/web/src/components/structures/MessagePanel.tsx`
  - Imported and registered `ImageGalleryGrouper` (index 0, highest priority)
  - Changed `readReceiptsByEvent`, `readReceiptMap`, and `isUnmounting` from `private` to `public` so custom groupers can render their own receipts UI
- `apps/web/src/components/views/dialogs/ConfirmRedactDialog.tsx`
  - `createRedactEventDialog` accepts an optional `extraEvents: MatrixEvent[]`; on confirm, redacts every unique event in `[mxEvent, ...extraEvents]` in parallel with the same reason
- `apps/web/src/components/views/context_menus/MessageContextMenu.tsx`
  - `onRedactClick` passes `galleryEvents` (minus the representative) as `extraEvents` so Remove on a gallery deletes every image + the caption with a single confirmation
- `apps/web/src/components/views/messages/MImageGallery.tsx` *(previously unused)*
  - Already existed but was not wired up — now integrated via the grouper
- `apps/web/res/css/views/messages/_MImageGallery.pcss`
  - `.mx_EventTile_gallery` — tile wrapper with group/bubble layout variants
  - `.mx_EventTile_gallery_bubble` — bubble background, padding, border-radius, z-index layering; `margin-inline-start/-end: -9px/-12px` to mirror standard `.mx_EventTile_line` negative margins so the bubble overlaps the avatar correctly
  - `.mx_EventTile_galleryCaption` — caption text styling
  - `.mx_GalleryActionBar` / `.mx_GalleryActionBar_button` — hover toolbar styling
  - `.mx_EventTile_gallery > .mx_EventTile_msgOption` — resets the 90px floating-right hack from the standard EventTile group layout so read receipts sit cleanly under the bubble; right-aligned for self, left-aligned for others
  - Hover highlight uses `z-index: 0` (not `-1`) to avoid disappearing in thread panel stacking contexts
  - MImageBody inline sizing overrides (`!important`) for both single images and grid cells

## Forward Dialog: Image & Gallery Forwarding

The ForwardDialog was rewritten to properly handle image and gallery forwarding. Text messages continue using the custom reply-format (showing the original sender). Images are forwarded as-is with no sender attribution (matching original Element behaviour). Gallery forwarding sends all images in the group as separate events. The dialog preview shows bubble avatar correctly and renders gallery images in a grid.

See `customizations/FORWARD_DIALOG.md` for full implementation documentation.

**Files changed:**

- `apps/web/src/components/views/dialogs/ForwardDialog.tsx`
  - Removed `transformEvent()` and its ~12 unused imports (location events, beacons, editor model, etc.)
  - Removed unused `type`/`content` props from `IEntryProps`; Entry now builds content internally
  - Added `extraEvents?: MatrixEvent[]` to `IProps` for gallery forwarding
  - New `buildImageForwardContent()`: forwards images as-is, no `<mx-reply>` attribution; preserves or replaces caption via MSC2530 (body = caption, filename = original filename)
  - New `buildForwardContents()`: orchestrator that dispatches to `buildReplyForwardContent` (text) or `buildImageForwardContent` (images); returns multiple events for galleries
  - `Entry.send()` iterates the event array and sends sequentially
  - Preview: galleries render via `MImageGallery` with a manual avatar; single images/text use `EventTile`
  - Added optional message textarea (caption for images, appended to reply for text)
- `apps/web/src/components/views/context_menus/MessageContextMenu.tsx`
  - Added `galleryEvents?: MatrixEvent[]` to `IProps`
  - `onForwardClick` passes gallery events (minus the clicked one) as `extraEvents`
- `apps/web/src/components/structures/grouper/ImageGalleryGrouper.tsx`
  - Added `galleryEvents: MatrixEvent[]` to `GalleryTileProps`
  - Passes `imageEvents` array through to `MessageContextMenu`
- `apps/web/src/dispatcher/payloads/OpenForwardDialogPayload.ts`
  - Added `extraEvents?: MatrixEvent[]` field
- `apps/web/src/utils/DialogOpener.ts`
  - Passes `extraEvents` through to `ForwardDialog` modal
- `apps/web/res/css/views/dialogs/_ForwardDialog.pcss`
  - New `.mx_ForwardDialog_galleryPreview`: flex container with inline avatar + bubble wrapper for gallery grid preview
  - Fixed `.mx_ForwardDialog_preview`: changed `overflow-y: auto` to `overflow: visible` and added `padding-left/right: 50px` to prevent clipping of absolutely-positioned bubble avatars

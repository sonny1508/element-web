# Custom Changes (Glenda Studio Fork)

Changes made on top of Element Web (currently **v1.12.28**, branch `release-v1.12.28-dev`). Reference this when migrating to a newer upstream version — see [Upgrade notes](#upgrade-notes-v11218--v11228) at the end for what moved in the last upgrade.

## Theme: Glenda Light / Glenda Dark

Default light/dark themes were replaced with custom `glenda-light` and `glenda-dark` themes.

**Files changed:**

- `apps/web/src/theme.ts`
  - `DEFAULT_THEME` changed from `"light"` to `"glenda-light"`
  - `enumerateThemes()` lists only `glenda-light` / `glenda-dark` (stock light/dark/high-contrast commented out)
- `apps/web/src/settings/watchers/ThemeWatcher.ts`
  - `themeBasedOnSystem()`: system theme matching returns `"glenda-dark"` / `"glenda-light"` instead of `"dark"` / `"light"`
  - `isUserOnDarkTheme()`: added `"glenda-dark"` to the dark theme check
  - Removed all high contrast (`preferHighContrast`) logic and listener
- `apps/web/webpack.config.ts`
  - Registered `theme-glenda-light` / `theme-glenda-dark` CSS entry points
- `apps/web/res/themes/glenda-light/`, `apps/web/res/themes/glenda-dark/` *(new)*
  - Full copies of the upstream light/dark theme variable files with Glenda colours (e.g. red own-message bubbles via `$eventbubble-self-bg`, red accent `--cpd-*` overrides) plus branding rules (`.mx_RoomListPanel`, `.mx_SpacePanel`, `.mx_RoomView_body` backgrounds, splash gradient)
  - Entry files (`glenda-*.pcss`) import unlayered, unlike upstream's `layer(app-web)` imports — the Glenda look was tuned against that cascade, so it was kept
  - When upgrading, diff upstream `res/themes/light` / `res/themes/dark` for new/removed `$variables` and for changes to the entry-file imports

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
- ~~`apps/web/src/components/structures/UserMenu.tsx`~~ — removed upstream in v1.12.2x (user menu redesign, #32812, which dropped the light/dark toggle button entirely). The Quick Settings theme dropdown and Appearance tab read `enumerateThemes()`, so they already offer only the Glenda themes.

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
  - `GalleryTile` wrapper component: `<li>` with sender avatar (`MemberAvatar`), `SenderProfile` (hidden in DMs via `panel.state.hideSender`, hidden for self via gallery CSS), hover state, context menu, action bar (upstream `ActionBarAdapter`), reactions (`ReactionsRowAdapter`), thread summary (`ThreadSummaryAdapter`), and `ReadReceiptGroup` aggregated across all events in the group
  - `GalleryTileChildViewModels`: small owner for the adapters' child view models (they normally borrow them from an `EventTileViewModel`, which the gallery tile doesn't have)
  - Renders `ImageBodyFactory` (single image) or `MImageGallery` grid (2+ images), both inside a `.mx_EventTile_gallery_bubble` wrapper
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
  - Each cell renders upstream's `ImageBodyFactory` (the MVVM replacement for the legacy `MImageBody`, removed upstream in #33212)
- `apps/web/src/components/views/rooms/EventTile/ActionBarAdapter.tsx`, `ReactionsRowAdapter.tsx`, `ThreadSummaryAdapter.tsx` (upstream files)
  - `eventTileViewModel` prop narrowed from `EventTileViewModel` to a `Pick<>` of the get/release methods each adapter calls, so the gallery tile can supply `GalleryTileChildViewModels`
  - `ActionBarAdapter`: new `galleryEvents?: MatrixEvent[]` prop, passed to the action bar view model and to the Options `MessageContextMenu` (along with `reactions`)
- `apps/web/res/css/views/messages/_MImageGallery.pcss`
  - `.mx_EventTile_gallery` — tile wrapper with group/bubble layout variants
  - `.mx_EventTile_gallery_bubble` — bubble background, padding, border-radius, z-index layering; `margin-inline-start/-end: -9px/-12px` to mirror standard `.mx_EventTile_line` negative margins so the bubble overlaps the avatar correctly
  - `.mx_EventTile_galleryCaption` — caption text styling
  - Tile chrome (avatar, sender name, `.mx_EventTile_gallery_actionBar`, `> .mx_EventTile_msgOption` receipts, `.mx_EventTile_gallery_threadInfo`): upstream moved the bubble-layout geometry for these into the shared-components `EventTileView` CSS module (applied to "slot" wrappers), so the gallery carries equivalent rules itself, using the module's values
  - Hover highlight uses `z-index: 0` (not `-1`) to avoid disappearing in thread panel stacking contexts
  - `ImageBodyView` inline sizing overrides (`!important` on `.mx_ImageBody_container` / `.mx_ImageBody_image` and the unnamed CSS-module media wrapper via `:has()`) for both single images and grid cells

## Forward Dialog: Image & Gallery Forwarding

The ForwardDialog was rewritten to properly handle attachment and gallery forwarding. Text messages continue using the custom reply-format (showing the original sender). Attachments (images, files, videos, audio / voice messages) and stickers are forwarded as-is with no sender attribution (matching original Element behaviour), so the recipient gets the actual file. Gallery forwarding sends all images in the group as separate events. The dialog is wider than upstream's, and long previews scroll inside the preview area; gallery images render in a grid.

See `customizations/FORWARD_DIALOG.md` for full implementation documentation.

**Files changed:**

- `apps/web/src/components/views/dialogs/ForwardDialog.tsx`
  - Removed `transformEvent()` and its ~12 unused imports (location events, beacons, editor model, etc.)
  - Removed unused `type`/`content` props from `IEntryProps`; Entry now builds content internally
  - Added `extraEvents?: MatrixEvent[]` to `IProps` for gallery forwarding
  - New `buildMediaForwardContent()`: forwards attachments (`m.image`, `m.file`, `m.video`, `m.audio`) as-is, no `<mx-reply>` attribution; preserves or replaces caption via MSC2530 (body = caption, filename = original filename)
  - New `buildStickerForwardContent()`: forwards stickers as `m.sticker` (optional message goes in a follow-up text)
  - New `buildForwardContents()`: orchestrator that dispatches to the builders above or `buildReplyForwardContent` (text and everything else); returns multiple events for galleries
  - `Entry.send()` iterates the event array and sends sequentially
  - Preview: galleries render via `MImageGallery` with a manual avatar; everything else previews the first event from `buildForwardContents()` in an `EventTile`
  - Preview `EventTile` is wrapped in upstream's `EventPresentationContextProvider` (required since v1.12.2x)
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
  - `.mx_ForwardDialog` width `min(760px, calc(90vw - 2 * var(--cpd-space-10x)))` (upstream 520px)
  - `.mx_ForwardDialog_preview`: scrolls (`overflow-y: auto`, max 45% of the dialog) with `padding-top: 20px` so the own-message avatar isn't clipped; bubble allowed full width inside the preview (`--event-tile-bubble-line-max-width: 100%`, `--event-tile-bubble-margin-inline-start: 0px`)
- `apps/web/test/unit-tests/components/views/dialogs/ForwardDialog-test.tsx`
  - New "Attachments" tests: file, caption, voice message, sticker are forwarded as the real media

## Open Poll UX (undo vote, voter avatars, always-visible results)

Disclosed polls show results without voting, list voters per option (click for the full list, works on ended polls too), and offer an "Undo vote" link. Spec-compliant (MSC3381 spoiled ballot for un-voting).

See `customizations/OPEN_POLL.md` for full documentation.

## Poll Creation Notifies the Room

Poll-start events (`org.matrix.msc3381.poll.start`) match no default push rule, so creating a poll notified nobody. On first sync the client adds a fork-specific underride push rule `im.uriel.rule.poll_start` (event type = poll start, action `notify`, same as `.m.rule.message`). Votes and poll end stay silent.

**Files changed:**

- `apps/web/src/utils/notifications.ts`
  - New `POLL_START_NOTIFICATION_RULE_ID` and `createPollStartNotificationRuleIfNeeded(cli)` (no-op for guests, until push rules load, or once the rule exists; errors are logged, never thrown)
- `apps/web/src/Notifier.ts`
  - Calls it next to `createLocalNotificationSettingsIfNeeded` after the first non-cached sync (uses `this.sdkContext.client` since v1.12.2x)

## Hide Membership Events in the Timeline

All `m.room.member` events (joins, leaves, invites, display-name and avatar changes) are hidden from the timeline, regardless of the per-user "show join/leave" settings.

**Files changed:**

- `apps/web/src/components/structures/MessagePanel.tsx`
  - `shouldShowEvent()` returns `false` for `m.room.member` before any other check

## "Other rooms" (Orphans) Meta-space Enabled by Default

**Files changed:**

- `apps/web/src/settings/Settings.tsx`
  - `Spaces.enabledMetaSpaces` default adds `[MetaSpace.Orphans]: true` (alongside Home)

## Lightbox (ImageView): Next / Previous Navigation

Opening an image in the lightbox lets you step through every image the same sender posted in that timeline (the thread's timeline for images in a thread) with on-screen chevrons or the ←/→ keys. The header shows an "N / M" counter; download, context menu, permalink and sender info follow the current image.

**Files changed:**

- `apps/web/src/components/views/elements/ImageView.tsx`
  - New exported `GalleryImage` type and optional `images` / `initialIndex` props; `currentImage` getter drives src/name/event/permalink; prev/next buttons, arrow-key handling, counter
- `apps/web/src/viewmodels/message-body/ImageBodyViewModel.ts` (upstream file)
  - `openImageViewer()` calls new `buildGalleryImages()` and passes `images` / `initialIndex` to `ImageView`
  - (Lived in `MImageBody.tsx` until v1.12.18; upstream replaced that component with this view model in #33212)
- `apps/web/res/css/views/elements/_ImageView.pcss`
  - `.mx_ImageView_nav`, `_prev`, `_next` button styles
- `apps/web/src/i18n/strings/en_EN.json`
  - Added `action|previous`

**Known limitation:** non-current images use `mediaFromContent(...).srcHttp`, which is the raw (still encrypted) file in E2EE rooms, so stepping to another image there shows a broken image.

## Gallery-aware "Download all" / "Hide all" in the Action Bar

When the action bar belongs to an image-gallery group, Download and Hide act on every image in the group and their labels change to "Download all images in this group" / "Hide all images in this group".

**Files changed:**

- `apps/web/src/viewmodels/room/EventTileActionBarViewModel.ts`
  - New `galleryEvents?: MatrixEvent[]` prop; `onDownloadClick` / `onHideClick` loop over the group; snapshot exposes `isGalleryGroup`
- `packages/shared-components/src/room/timeline/event-tile/actions/ActionBarView/ActionBarView.tsx`
  - `isGalleryGroup?` in the snapshot switches the Download / Hide labels
- `packages/shared-components/src/i18n/strings/en_EN.json`
  - Added `timeline|mab|download_all_in_gallery`, `timeline|mab|hide_all_in_gallery`

## Media Hiding Disabled (`UIFeature.mediaHiding`)

Element lets users hide individual images/videos/stickers (action bar **Hide**, which leaves a **Show** placeholder) and choose "Show media in timeline: Always / In private rooms / Never". Pointless in a company deployment, so a fork-specific UI feature flag turns all of it off. Upstream behaviour is unchanged unless the flag is set; both Glenda configs set `"UIFeature.mediaHiding": false` under `setting_defaults`.

When disabled:
- Media is always shown — including media hidden on a device before the flag was turned off (stored per-event overrides are ignored).
- No **Hide** button in the action bar (so the gallery's "Hide all images in this group" never appears either).
- Settings → Preferences hides the "Show media in timeline" choices (the invite-avatar toggle and invite rules stay); Room settings → General hides the "Moderation and safety" section, whose only control is that choice.

**Files changed:**

- `apps/web/src/settings/UIFeature.ts` — `UIFeature.MediaHiding = "UIFeature.mediaHiding"`
- `apps/web/src/settings/Settings.tsx` — setting declaration (config level, default `true`)
- `apps/web/src/utils/media/mediaVisibility.ts` — `computeMediaVisibility()` returns `true` when the flag is off (single choke point for `getMediaVisibility()` and the `useMediaVisible()` hook)
- `apps/web/src/viewmodels/room/EventTileActionBarViewModel.ts` — `showHide` also requires the flag
- `apps/web/src/components/views/settings/tabs/user/MediaPreviewAccountSettings.tsx` — hides the media preview radio group when the flag is off
- `apps/web/src/components/views/settings/tabs/room/GeneralRoomSettingsTab.tsx` — hides the room-level "Moderation and safety" subsection when the flag is off
- Tests: `apps/web/src/utils/media/mediaVisibility.test.ts` (new), a case in `EventTileActionBarViewModel.test.ts`

## Deployment Config, Branding and CI

- `apps/web/config.sample.json` — Glenda homeserver (`glenda-studio-chat.com`), `default_theme: glenda-dark`, bubble layout, message previews, always-show timestamps, no breadcrumbs, media hiding off, labs hidden, video rooms off, **Element Call disabled** (`element_call.disable: true`)
- `apps/desktop/glenda-studio/config.json` — desktop build config (copied to `apps/web/config.json` by CI): same server/theme plus auto-launch, hidden join/leave/name/avatar changes, media hiding off, `update_base_url`, **Element Call disabled**
- `apps/desktop/glenda-studio/themes/*.json` — custom themes shipped inside the app (works offline; see `themes/README.md`)
- `apps/desktop/glenda-studio/build-config.mjs` — generates the final config: `glenda-studio/config.json` + every theme appended to `setting_defaults.custom_themes`; fails on invalid/duplicate themes, warns about `http(s)://` URLs. CI uses it, and it also regenerates the dev server's git-ignored `apps/web/config.json` (`node apps/desktop/glenda-studio/build-config.mjs apps/web/config.json`)
- `apps/desktop/glenda-studio/build.json` — desktop variant config (currently identical to stock Element)
- `apps/desktop/package.json` — version `<upstream>-glenda.<n>` (e.g. `1.12.28-glenda.1`); bump `<n>` for each fork release so Squirrel auto-update sees a newer version
- `.github/workflows/build_glenda_prepare.yaml`, `build_glenda_windows.yaml` *(new)* — build the web app with the Glenda config (generated by `build-config.mjs`) and package the Windows (Squirrel) desktop app on push to the release branch
- Upstream CI workflows that don't apply to the fork are deleted (`build-and-test*.yaml`, `docker.yaml`, `localazy_download.yaml`, `sync-labels.yml`, `update-jitsi.yml`); `build_desktop_and_deploy.yaml` kept as `.back` for reference

## Upgrade Notes: v1.12.18 → v1.12.28

What changed upstream that affected this fork, and how it was handled:

- **`MImageBody.tsx` removed** (#33212) → gallery cells/single images use `ImageBodyFactory`; lightbox navigation moved into `ImageBodyViewModel`; gallery CSS retargeted from `mx_MImageBody_*` to `mx_ImageBody*`.
- **EventTile refactored to MVVM / shared-components** (#33489 … #34781) → `ActionBarWrapper` / `ReactionsRowWrapper` exports are gone; the gallery uses `ActionBarAdapter` / `ReactionsRowAdapter` / `ThreadSummaryAdapter` with its own child-VM owner. `SenderProfile` now takes `senderId` / `member` / `isEmote` instead of `mxEvent`.
- **Bubble layout CSS moved into the `EventTileView` CSS module** (`_EventBubbleTile.pcss` went from 648 to 76 lines) → the gallery tile now carries its own avatar / sender / action bar / receipt / thread-summary positioning. Bubble colours are now CSS variables (`--event-tile-bubble-*`), bridged from the `$eventbubble-*` theme variables in `_EventTile.pcss`, so the Glenda red bubbles still apply.
- **`UserMenu.tsx` removed** (#32812) → the Glenda light/dark toggle customisation was dropped with it (no toggle exists any more).
- **Custom theme UI moved to devtools** (#34703) → `ThemeChoicePanel` only needed the high-contrast removal.
- **`_compound.pcss` removed** (#34371, Compound now ships once in `bundle.css`) → removed its import from both Glenda theme entry files (the build fails otherwise).
- **Legacy room list removed** (#34040) → `.mx_SpacePanel.newUi` no longer exists; Glenda light branding now targets `.mx_SpacePanel`.
- **`$spacing-*` SCSS variables removed** → poll voter CSS uses `var(--cpd-space-Nx)` (1x = 4px).
- **`feature_group_calls` removed; Element Call on by default** (#33692) → replaced with `element_call.disable: true` in both configs to keep calls off as before.
- **pnpm 10 → 11, declared via `devEngines`** (#33573) → Glenda workflows use `pnpm/action-setup` v6.0.10 (pinned SHA, as upstream); Windows job forces LF line endings before checkout (nx workaround, as upstream). Push trigger now `release-v1.12.28-dev`.
- `SdkContextClass` → `SDKContextClass`; oxlint requires `void` on floating promises — handled in `Notifier.ts`.

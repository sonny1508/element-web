# Forward Dialog: Image & Gallery Forwarding

The ForwardDialog handles three forwarding cases with different behaviour:

| Content type | Attribution | Sending behaviour |
|---|---|---|
| **Text messages** (and anything else not listed below, e.g. locations) | Reply-format (`<mx-reply>`) showing original sender | Single `m.room.message` with `msgtype: m.text` |
| **Single attachment** — image, file (`.zip` …), video, audio / voice message | None (forwarded as-is, like upstream Element) | Single `m.room.message` with the original msgtype and media (`url` or encrypted `file`, `info`, thumbnails) |
| **Image gallery** | None | Multiple `m.room.message` events sent sequentially |
| **Sticker** | None | Single `m.sticker` event; an optional message is sent as a follow-up `m.text` (stickers can't carry a caption) |

All forwarded content includes an empty `"m.mentions": {}` to prevent legacy push rules from triggering false mention notifications (see "Fix: Double Desktop Notifications" in `CUSTOM_CHANGES.md`).

## Architecture

```
ForwardDialog (main component)
  ├── Preview section
  │     ├── Gallery → MImageGallery grid + manual avatar
  │     └── Single image / text → EventTile (with bubble layout avatar)
  ├── Optional message textarea
  └── Room list → Entry components
        └── Entry.send() → buildForwardContents()
              ├── Sticker → buildStickerForwardContent() (+ optional follow-up text)
              ├── Attachment(s) → buildMediaForwardContent() × N
              └── Anything else → buildReplyForwardContent()

Data flow for gallery forwarding:
  ImageGalleryGrouper (imageEvents[])
    → GalleryTile (galleryEvents prop)
      → MessageContextMenu (galleryEvents prop)
        → onForwardClick → dispatch OpenForwardDialog { event, extraEvents }
          → DialogOpener → ForwardDialog { event, extraEvents }
```

## Text forwarding: buildReplyForwardContent()

Text messages use a custom reply format so the original sender is visible in the forwarded message. This differs from upstream Element which sends forwarded messages as if the forwarder wrote them.

### Output format

```json
{
  "msgtype": "m.text",
  "body": "> <@original_sender:server> Original message text\n\nOptional user message",
  "format": "org.matrix.custom.html",
  "formatted_body": "<p>Optional user message</p><mx-reply><blockquote><a href=\"https://matrix.to/#/@original_sender:server\">@original_sender:server</a><br>Original message text</blockquote></mx-reply>",
  "m.mentions": {}
}
```

If no optional message is provided, the `<p>` tag is omitted. The `> <@sender>` prefix and `<mx-reply>` block are always present for text forwards.

## Attachment forwarding: buildMediaForwardContent()

Attachments — `m.room.message` events whose msgtype is in `MEDIA_MSGTYPES` (`m.image`, `m.file`, `m.video`, `m.audio`, which includes voice messages) — are forwarded as-is with no sender attribution, so the recipient gets the actual file. Before v1.12.28-glenda.1 only `m.image` took this path; every other attachment fell through to the text reply-format and arrived as a quote of its filename, without the file. The function:

1. Strips `m.relates_to`, `body`, `filename`, `format`, and `formatted_body` from the original content
2. Preserves all media fields (`url`, `info`, `msgtype`, encrypted media fields, etc.)
3. Reconstructs `body` and optionally `filename` based on caption logic

### Caption handling

Captions follow the MSC2530 convention: when `filename` exists and differs from `body`, the `body` is a caption.

| Scenario | `body` | `filename` |
|---|---|---|
| No caption, no optional message | Original filename | Original filename (if present) |
| Original had caption, no optional message | Original caption preserved | Original filename |
| User typed optional message | User's message | Original filename |
| Both original caption and optional message | User's message (takes precedence) | Original filename |

### Output format (no caption)

```json
{
  "msgtype": "m.image",
  "url": "mxc://...",
  "info": { "w": 1920, "h": 1080, "mimetype": "image/jpeg", "size": 123456 },
  "body": "photo.jpg",
  "m.mentions": {}
}
```

### Output format (with caption)

```json
{
  "msgtype": "m.image",
  "url": "mxc://...",
  "info": { "w": 1920, "h": 1080, "mimetype": "image/jpeg", "size": 123456 },
  "body": "Caption text here",
  "filename": "photo.jpg",
  "m.mentions": {}
}
```

## Gallery forwarding: buildForwardContents()

The orchestrator function determines how to forward the event:

- **Sticker (`m.sticker`):** returns `[buildStickerForwardContent(event)]`, plus an `m.text` with the optional message if one was typed
- **Attachment (`isForwardedAsMedia`):** returns an array where the first attachment may carry the user's optional message as a caption, and all subsequent gallery images are forwarded as-is (no caption)
- **Anything else:** returns `[buildReplyForwardContent(event, optionalMessage)]`

`Entry.send()` iterates this array and calls `cli.sendEvent()` for each, sequentially. The type assertion `evType as keyof TimelineEvents` is needed because the Matrix SDK's `sendEvent` expects a narrower type than the string returned by our builders.

## Gallery event threading

Getting gallery events from the timeline to the ForwardDialog requires threading through several components:

1. **ImageGalleryGrouper.getTiles()** — knows all `imageEvents` in a group. Passes them as `galleryEvents` prop to `GalleryTile`.

2. **GalleryTile** — passes `galleryEvents` (when length > 1) to `MessageContextMenu` via the `galleryEvents` prop.

3. **MessageContextMenu** — new `galleryEvents?: MatrixEvent[]` prop. `onForwardClick` filters out the primary event and dispatches the rest as `extraEvents`.

4. **OpenForwardDialogPayload** — new `extraEvents?: MatrixEvent[]` field carries the additional images.

5. **DialogOpener** — passes `extraEvents` through to `ForwardDialog` modal creation.

6. **ForwardDialog** — receives `extraEvents`, combines with primary `event` for preview and sending.

## Preview rendering

The ForwardDialog preview section handles three cases:

### Gallery preview (isGallery = true)

Uses a custom `.mx_ForwardDialog_galleryPreview` container:

```html
<div class="mx_ForwardDialog_galleryPreview">
  <img class="mx_ForwardDialog_previewAvatar" ... />
  <div class="mx_EventTile_gallery_bubble">
    <MImageGallery events={allImageEvents} />
  </div>
</div>
```

The avatar is rendered as a plain `<img>` element (not `MemberAvatar`) because the gallery preview bypasses `EventTile` entirely.

### Single attachment / text preview (isGallery = false)

Uses `EventTile` (wrapped in `EventPresentationContextProvider`) with a mock event built from the first entry of `buildForwardContents()`, so the preview shows exactly what will be sent (a real file tile for attachments, the reply-format bubble for text). The mock event's sender is set to the current user with their profile info.

### Dialog width and preview scrolling

- `.mx_ForwardDialog` is `min(760px, calc(90vw - 2 * var(--cpd-space-10x)))` wide (upstream: 520px), so bubbles have room and the dialog still fits narrow windows.
- `.mx_ForwardDialog_preview` scrolls (`overflow-y: auto`, `max-height: 45%`): a long message is clipped inside the preview and revealed by scrolling, instead of drawing over the message box and room list. (An earlier version used `overflow: visible`, which caused exactly that overlap.)
- Because the preview always shows *our own* message, the bubble avatar sits top-right, ~19px above the bubble: `padding-top: 20px` keeps it inside the scroll box; horizontally it lives in the tile's 60px inline-end margin, so no side padding is needed.
- Inside the preview, `.mx_EventTile` overrides `--event-tile-bubble-line-max-width: 100%` (timeline default 70%) and `--event-tile-bubble-margin-inline-start: 0px` (that margin only exists for other senders' avatars), so the bubble uses the dialog's full width.

## Optional message textarea

Below the preview, a textarea allows the user to type an optional message:

- **Text forwards:** appended after the reply-format attribution block
- **Image forwards:** becomes the image's caption (MSC2530 style)
- **Gallery forwards:** only the first image receives the caption

## Files changed

| File | Change |
|---|---|
| `apps/web/src/components/views/dialogs/ForwardDialog.tsx` | Major rewrite: new image/gallery forwarding, removed `transformEvent`, simplified `IEntryProps`, gallery preview |
| `apps/web/src/components/views/context_menus/MessageContextMenu.tsx` | Added `galleryEvents` prop, threads gallery events to forward dispatch |
| `apps/web/src/components/structures/grouper/ImageGalleryGrouper.tsx` | Added `galleryEvents` prop to `GalleryTileProps`, passes `imageEvents` through |
| `apps/web/src/dispatcher/payloads/OpenForwardDialogPayload.ts` | Added `extraEvents?: MatrixEvent[]` |
| `apps/web/src/utils/DialogOpener.ts` | Passes `extraEvents` to ForwardDialog modal |
| `apps/web/res/css/views/dialogs/_ForwardDialog.pcss` | Gallery preview styles, wider dialog, scrolling preview with full-width bubble |

## Removed dead code

The rewrite removed `transformEvent()` and its imports that were no longer needed:

- `ContentHelpers`, `ILocationContent`, `LocationAssetType`, `M_TIMESTAMP`, `M_BEACON` (location/beacon handling)
- `attachMentions`, `CommandPartCreator`, `SettingsStore`, `parseEvent`, `EditorModel` (mention recalculation via editor model)
- `isLocationEvent`, `isSelfLocation`, `locationEventGeoUri` (location utilities)

These were part of the original Element forward pipeline that converted location shares and recalculated mentions. The custom forward uses a simpler approach: reply-format for text (no mention recalculation needed since `m.mentions: {}` is always empty) and pass-through for images.

# Forward Dialog: Image & Gallery Forwarding

The ForwardDialog handles three forwarding cases with different behaviour:

| Content type | Attribution | Sending behaviour |
|---|---|---|
| **Text messages** | Reply-format (`<mx-reply>`) showing original sender | Single `m.room.message` with `msgtype: m.text` |
| **Single image** | None (forwarded as-is, like upstream Element) | Single `m.room.message` with `msgtype: m.image` |
| **Image gallery** | None | Multiple `m.room.message` events sent sequentially |

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
              ├── Text → buildReplyForwardContent()
              └── Image(s) → buildImageForwardContent() × N

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

## Image forwarding: buildImageForwardContent()

Images are forwarded as-is with no sender attribution. The function:

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

The orchestrator function determines whether to use text or image forwarding:

- **Text:** returns `[buildReplyForwardContent(event, optionalMessage)]`
- **Image:** returns an array where the first image may carry the user's optional message as a caption, and all subsequent gallery images are forwarded as-is (no caption)

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

### Single image / text preview (isGallery = false)

Uses `EventTile` with a mock event built from `buildImageForwardContent` (image) or `buildReplyForwardContent` (text). The mock event's sender is set to the current user with their profile info.

### Bubble avatar fix

The bubble layout positions the sender avatar with `position: absolute; left: -36px` (others) or `right: -38px` (self) via `_EventBubbleTile.pcss`. The preview container previously used `overflow-y: auto`, which creates a clipping context that hides the avatar.

**Fix:** Changed to `overflow: visible` with `padding-left: 50px; padding-right: 50px` to provide space for the absolutely-positioned avatar without clipping.

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
| `apps/web/res/css/views/dialogs/_ForwardDialog.pcss` | Gallery preview styles, bubble avatar overflow fix |

## Removed dead code

The rewrite removed `transformEvent()` and its imports that were no longer needed:

- `ContentHelpers`, `ILocationContent`, `LocationAssetType`, `M_TIMESTAMP`, `M_BEACON` (location/beacon handling)
- `attachMentions`, `CommandPartCreator`, `SettingsStore`, `parseEvent`, `EditorModel` (mention recalculation via editor model)
- `isLocationEvent`, `isSelfLocation`, `locationEventGeoUri` (location utilities)

These were part of the original Element forward pipeline that converted location shares and recalculated mentions. The custom forward uses a simpler approach: reply-format for text (no mention recalculation needed since `m.mentions: {}` is always empty) and pass-through for images.

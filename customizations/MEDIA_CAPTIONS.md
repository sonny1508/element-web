# Media Captions (MSC2530)

The upload dialog now includes an optional caption text input. When a caption is provided, it is sent as the `body` field with the real filename in `filename`, per the MSC2530 spec (stable since Matrix v1.10).

## How MSC2530 works

In a standard image event, `body` is the filename:

```json
{
  "msgtype": "m.image",
  "body": "photo.jpg",
  "url": "mxc://...",
  "info": { ... }
}
```

With a caption, `filename` holds the real filename and `body` becomes the caption text:

```json
{
  "msgtype": "m.image",
  "body": "Look at this sunset!",
  "filename": "photo.jpg",
  "url": "mxc://...",
  "info": { ... }
}
```

**Detection rule:** If `content.filename` exists AND `content.filename !== content.body`, then `body` is a caption.

## Client compatibility

- **Element Web (this fork):** Renders caption. Sending is enabled via this customization.
- **Element Web (upstream):** Already has caption rendering support in `MessageEvent.tsx` (the `CaptionBody` wrapper). Does NOT have the upload dialog caption input.
- **Element X (Android/iOS):** Supports both sending and rendering captions.
- **Older clients:** Show the caption text as the message body (graceful fallback — user sees the caption as a text message alongside the image).

## Files changed

| File | Change |
|------|--------|
| `apps/web/src/components/views/dialogs/UploadConfirmDialog.tsx` | Added caption state + text input |
| `apps/web/src/ContentMessages.ts` | Pass caption through send pipeline |
| `apps/web/res/css/views/dialogs/_UploadConfirmDialog.pcss` | Caption input styling |

## UploadConfirmDialog.tsx

### State addition

```ts
interface IState {
    objectUrl?: string;
    caption: string;       // <-- added
}
```

### onFinished signature

The third argument is the caption string:

```ts
onFinished: (uploadConfirmed: boolean, uploadAll?: boolean, caption?: string) => void;
```

Both `onUploadClick` and `onUploadAllClick` pass `this.state.caption || undefined` as the third argument.

### New handlers

- `onCaptionChange` — updates `this.state.caption` on input change
- `onCaptionKeyDown` — pressing Enter in the caption input triggers upload (calls `onUploadClick`)

### Rendered input

```tsx
<input
    type="text"
    className="mx_UploadConfirmDialog_caption"
    placeholder="Add a caption (optional)"
    value={this.state.caption}
    onChange={this.onCaptionChange}
    onKeyDown={this.onCaptionKeyDown}
    autoFocus={false}
/>
```

Placed below the media preview and file info, above the dialog buttons.

## ContentMessages.ts

### sendContentListToRoom (line ~494)

The modal's `finished` promise now destructures three values:

```ts
const [shouldContinue, shouldUploadAll, dialogCaption] = await finished;
caption = dialogCaption;
```

The `caption` is passed as the last argument to `sendContentToRoom`.

### sendContentToRoom (line ~559)

New optional parameter:

```ts
public async sendContentToRoom(
    file: File,
    roomId: string,
    relation: IEventRelation | undefined,
    matrixClient: MatrixClient,
    replyToEvent: MatrixEvent | undefined,
    promBefore?: Promise<any>,
    caption?: string,           // <-- added
): Promise<void> {
```

Caption application logic:

```ts
if (caption) {
    (content as Record<string, unknown>).filename = fileName;
    content.body = caption;
}
```

The `Record<string, unknown>` cast is needed because `filename` is not in the `Omit<MediaEventContent, "info">` type. This is safe — `filename` is a standard Matrix field per MSC2530.

## CSS: _UploadConfirmDialog.pcss

```css
input.mx_UploadConfirmDialog_caption {
    display: block;
    width: 100%;
    margin-top: 12px;
    padding: 8px 12px;
    border: 1px solid $input-border-color;
    border-radius: 8px;
    font-size: $font-14px;
    font-family: inherit;
    background: transparent;
    color: $primary-content;
    outline: none;
    box-sizing: border-box;
}
```

**Specificity note:** The selector is `input.mx_UploadConfirmDialog_caption` (specificity 0,1,1), not `.mx_UploadConfirmDialog_caption` (0,1,0). This is necessary to match or beat the global `input[type="text"]` rule (also 0,1,1) which would otherwise override the color to `$secondary-content`.

## Interaction with Image Gallery Grouping

When multiple images are uploaded via "Upload All", the caption is attached to whichever image's dialog was visible at the time. This is typically the first image. The `ImageGalleryGrouper` scans ALL images in a group for a caption (not just the last), specifically to handle this case. See `IMAGE_GALLERY_GROUPING.md` for details.

## Existing rendering support

Element Web already renders captions via `MessageEvent.tsx` (lines ~296-334). The logic:

1. Check if `content.filename && content.filename !== content.body`
2. If true, wrap the media component in `CaptionBody`
3. `CaptionBody` renders the media followed by `TextualBodyFactory` for the caption text

This rendering path handles individual images in the standard timeline. When images are grouped by `ImageGalleryGrouper`, the grouper handles caption rendering itself (placing the caption below the grid).

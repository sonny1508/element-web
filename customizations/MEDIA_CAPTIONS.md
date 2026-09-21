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
| `apps/web/src/components/views/dialogs/UploadConfirmDialog.tsx` | Caption state + text input + `<Autocomplete>` for @-mentions |
| `apps/web/src/ContentMessages.ts` | Passes caption + mention list through send pipeline; writes `m.mentions` and `formatted_body` |
| `apps/web/res/css/views/dialogs/_UploadConfirmDialog.pcss` | Caption input styling, dialog width (520px), autocomplete positioning |

## UploadConfirmDialog.tsx

### Props

```ts
interface IProps {
    file: File;
    currentIndex: number;
    totalFiles: number;
    /** Room used to source @-mention completions for the caption input. */
    room?: Room;
    onFinished: (
        uploadConfirmed: boolean,
        uploadAll?: boolean,
        caption?: string,
        mentions?: CaptionMention[],
    ) => void;
}
```

`room` is supplied by `ContentMessages.sendContentListToRoom` (`matrixClient.getRoom(roomId)`) and is passed straight to `<Autocomplete>` so it can list real room members.

### State

```ts
interface IState {
    objectUrl?: string;
    caption: string;
    selectionStart: number;
    selectionEnd: number;
    /** Users picked via autocomplete since the dialog opened. Filtered at send time. */
    mentions: CaptionMention[];
}

export interface CaptionMention {
    userId: string;
    displayName: string;
}
```

### Handlers

- `onCaptionChange` — updates `caption` + caret position.
- `onCaptionSelect` — calls `syncSelection()` to keep the autocomplete query/selection in sync with the caret.
- `onCaptionKeyDown` —
  - ArrowUp/ArrowDown move the autocomplete selection when it's visible.
  - Enter/Tab confirm the highlighted completion if any; otherwise Enter uploads.
  - Escape dismisses the autocomplete (falls through to the dialog's own escape handling if it's already hidden).
- `onConfirmCompletion(completion)` — replaces `caption.slice(range.start, range.end)` with `completion.completion + (completion.suffix ?? "")`, restores caret position via `setSelectionRange`, and (for `type === "user"`) appends `{ userId: completion.completionId, displayName: completion.completion }` to `state.mentions`.
- `activeMentions()` — deduplicates `state.mentions` by `userId` and filters to those whose `displayName` is still present in the caption text. Called from both `onUploadClick` and `onUploadAllClick` before invoking `onFinished`.

### Rendered DOM

```tsx
<div className="mx_UploadConfirmDialog_captionWrapper mx_no_textinput">
    <input
        type="text"
        ref={this.inputRef}
        className="mx_UploadConfirmDialog_caption"
        placeholder="Add a caption (optional)"
        value={this.state.caption}
        onChange={this.onCaptionChange}
        onSelect={this.onCaptionSelect}
        onKeyDown={this.onCaptionKeyDown}
        autoFocus={false}
    />
    {room && (
        <Autocomplete
            ref={this.autocompleteRef}
            query={this.state.caption}
            selection={{ start, end, beginning: start === 0 }}
            onConfirm={this.onConfirmCompletion}
            room={room}
        />
    )}
</div>
```

The wrapper carries `mx_no_textinput` so the global `.mx_Dialog :not(.mx_no_textinput) > input[type="text"]` rule in `_common.pcss` does **not** match — see the CSS section below for why this matters.

## ContentMessages.ts

### sendContentListToRoom

`Modal.createDialog(UploadConfirmDialog, …)` now passes `room: matrixClient.getRoom(roomId) ?? undefined`. The `finished` promise destructures four values:

```ts
const [shouldContinue, shouldUploadAll, dialogCaption, dialogMentions] = await finished;
caption = dialogCaption;
captionMentions = dialogMentions;
```

Both are forwarded to `sendContentToRoom`.

### sendContentToRoom

New optional parameters:

```ts
public async sendContentToRoom(
    file: File,
    roomId: string,
    relation: IEventRelation | undefined,
    matrixClient: MatrixClient,
    replyToEvent: MatrixEvent | undefined,
    promBefore?: Promise<any>,
    caption?: string,
    captionMentions?: CaptionMention[],
): Promise<void> {
```

Caption + mention application:

```ts
if (caption) {
    (content as Record<string, unknown>).filename = fileName;
    content.body = caption;

    if (captionMentions && captionMentions.length > 0) {
        let formatted = escapeHtml(caption);
        for (const m of captionMentions) {
            const href = makeUserPermalink(m.userId);
            const escapedName = escapeHtml(m.displayName);
            formatted = formatted.split(escapedName).join(`<a href="${href}">${escapedName}</a>`);
        }
        (content as Record<string, unknown>).format = "org.matrix.custom.html";
        (content as Record<string, unknown>).formatted_body = formatted;
    }
}

attachMentions(matrixClient.getSafeUserId(), content, null, replyToEvent);

// Add caption-derived user mentions so clients deliver push notifications.
if (captionMentions && captionMentions.length > 0) {
    const mentions = ((content as Record<string, any>)["m.mentions"] ??= {});
    const existing = new Set<string>(mentions.user_ids ?? []);
    for (const m of captionMentions) existing.add(m.userId);
    mentions.user_ids = [...existing];
}
```

**Order matters:** `attachMentions` always resets `content["m.mentions"] = {}` first, so we append our caption-derived user IDs *after* it runs. We use `??=` to keep whichever object `attachMentions` left behind (it always assigns one) and union our user IDs into `user_ids`.

The `Record<string, unknown>` cast is needed because `filename`, `format`, and `formatted_body` aren't on the `Omit<MediaEventContent, "info">` type. These are standard Matrix fields (MSC2530 + spec'd HTML formatting).

## CSS: _UploadConfirmDialog.pcss

```css
.mx_UploadConfirmDialog {
    width: 520px;
    max-width: 100%;
}

.mx_Dialog input.mx_UploadConfirmDialog_caption {
    color: $primary-content;
    /* …+ border, padding, focus styles… */

    &::placeholder { color: $tertiary-content; }
}

.mx_UploadConfirmDialog_captionWrapper {
    position: relative;

    > .mx_Autocomplete {
        bottom: 100%;
        margin-bottom: 4px;
        max-height: 200px;
        overflow-y: auto;
        border-radius: 8px;
        border: 1px solid $primary-hairline-color;
    }
}
```

### The colour-swap trap

`_common.pcss` contains this global rule scoped to dialogs:

```css
.mx_Dialog,
.mx_MatrixChat_wrapper {
    :not(.mx_textinput):not(.mx_Field):not(.mx_no_textinput) > input[type="text"],
    … {
        color: $input-darker-fg-color;  /* dim */
    }
    … ::placeholder { color: $input-placeholder; /* brighter */ }
}
```

That selector's specificity is (0,5,1) — it beats `.mx_Dialog input.mx_UploadConfirmDialog_caption` (0,2,1), which is why early attempts at "set the colour to $primary-content" had no visible effect: the typed caption text stayed dim blue and the placeholder appeared brighter, effectively swapped.

**Fix:** the input's wrapper carries `mx_no_textinput`:

```html
<div class="mx_UploadConfirmDialog_captionWrapper mx_no_textinput">
    <input class="mx_UploadConfirmDialog_caption" ... />
</div>
```

This causes the global `:not(.mx_no_textinput)` clause to exclude our input entirely, so the local `.mx_Dialog input.mx_UploadConfirmDialog_caption { color: $primary-content }` wins as written. The specificity bump on the local selector is kept as belt-and-suspenders.

### Autocomplete positioning

`.mx_Autocomplete` defaults to `position: absolute; bottom: 0` for the composer use-case. Inside the upload dialog we want it just above the input, so the wrapper is `position: relative` and the dropdown is overridden to `bottom: 100%` with `margin-bottom: 4px`. `max-height: 200px; overflow-y: auto;` prevents it from blowing past the dialog when many users match.

### Dialog width

`.mx_UploadConfirmDialog` sets `width: 520px` to give the caption editor room to breathe (mirroring `mx_ForwardDialog`). `fixedWidth={false}` is kept on `<BaseDialog>` so the explicit width wins over the framework's adaptive sizing.

## @-mentions in captions

The caption input wires up the same `<Autocomplete>` component used by the room composer, but in a controlled-`<input>` flavour (no contenteditable, no rich-text parts). Selection state is kept in React state and pushed into `Autocomplete` as `{ start, end, beginning }`. Only the user provider produces meaningful completions because the input is plain text — emoji/command/room pills would have no place to live without a pill renderer.

End-to-end mention flow:

1. User types `@jo` in the caption — the `commandRegex` (`/\B@\S*/g`) on `UserProvider` matches, the dropdown shows joined members.
2. User confirms a completion. `onConfirmCompletion` replaces `@jo` with the display name + suffix and appends `{ userId, displayName }` to `state.mentions`.
3. On Upload, `activeMentions()` returns only the mentions whose `displayName` is still substring-present in the caption (handles "user deleted the name they tagged" by dropping it).
4. `ContentMessages.sendContentToRoom` writes `m.mentions.user_ids` so receivers ping the user, and emits a `formatted_body` containing `<a href="matrix.to/...">Display Name</a>` so receivers render the name as a clickable mention.

**Known limitation:** Because the caption is a plain `<input>` (no pills), the matching of mention-to-text is by substring. If the user types `John` manually (without going through autocomplete) it will not ping. If two members share the same display name, both might receive the ping. This is the deliberate trade-off for "user autocomplete only" — full pill semantics would require a contenteditable composer.

## Interaction with Image Gallery Grouping

When multiple images are uploaded via "Upload All", the caption is attached to whichever image's dialog was visible at the time. This is typically the first image. The `ImageGalleryGrouper` scans ALL images in a group for a caption (not just the last), specifically to handle this case. See `IMAGE_GALLERY_GROUPING.md` for details.

Mentions land on the same image event as the caption (single `m.image`), so a recipient ping fires exactly once per upload regardless of how many other images are in the group.

## Existing rendering support

Element Web already renders captions via `MessageEvent.tsx` (lines ~296-334). The logic:

1. Check if `content.filename && content.filename !== content.body`
2. If true, wrap the media component in `CaptionBody`
3. `CaptionBody` renders the media followed by `TextualBodyFactory` for the caption text

This rendering path handles individual images in the standard timeline. When images are grouped by `ImageGalleryGrouper`, the grouper handles caption rendering itself (placing the caption below the grid).

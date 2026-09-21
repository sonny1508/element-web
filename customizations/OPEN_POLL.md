# Open Poll UX

Enhancements to the **disclosed** (open) poll rendering. No new event type — these changes stay spec-compliant with MSC3381 so other Matrix clients (Element X, mobile, FluffyChat, etc.) continue to interop correctly.

## What changed

### 1. "Undo vote" button
After the user votes, a small "Undo vote" link appears in the totals row (right-aligned). Clicking it retracts the vote by sending a `PollResponseEvent` with an empty `answers` array — the standard "spoiled" response per MSC3381. Other clients already discard spoiled responses, so the un-vote is honored across the federation.

- Local-echo of the un-vote is reflected immediately in the UI (vote count, voter avatars, checked state).
- The vote send/un-vote send paths share a `sendAnswers(answers: string[])` helper.
- We **don't** repurpose clicking on the selected option to un-vote: a radio's `<label>` wraps its `<input>`, so a single click fires multiple handlers (input onChange, input click bubble, label click bubble) and races with the local-echo state update, causing a vote+unvote round-trip on the same click. Selected options keep `pointer-events: none` as in upstream.

### 2. Voter avatars per option
Each option shows a row of avatars (via `FacePile`) of the members who voted for it. Built from the same `userVotes` map used for counts, so local-echo (including un-votes) flows through.

- Only rendered for disclosed polls.
- Hovering an avatar shows the user's name (FacePile's default per-avatar `Tooltip`).
- Clicking the avatar row opens a `ContextMenu` listing all voters for that option (avatar + display name). This replaces the default "open user profile" behavior — the list is the only interaction.
- Tooltips and the click-to-list menu work on **ended** polls too: the voters row sets `pointer-events: auto` to override the `pointer-events: none` that `mx_PollOption_ended` (and `mx_PollOption_checked`) applies to the option as a whole.
- Avatar row stops click propagation so clicking doesn't toggle the vote.

### 3. Results visible without voting
For disclosed polls, results (counts, percentages, voter avatars) are visible to everyone regardless of whether they've voted. Undisclosed polls still hide results until the poll ends.

Old gate: `poll.isEnded || (disclosed && myVote !== undefined)`
New gate: `poll.isEnded || disclosed`

## Why not a new poll type?

These are UI-only changes on top of the existing disclosed poll kind:
- Un-vote uses the spec-defined spoiled response.
- Voter avatars render data that's already public in disclosed polls (`sender` on each response).
- Always-show is a client-side gate, not a protocol change.

A custom event type (`im.uriel.open_poll.*`) would break interop, require parallel creation/history/end flows, and complicate future upstream merges. Reconsider only if multi-select or different disclosure semantics are needed.

## Files changed

- `apps/web/src/components/views/messages/MPollBody.tsx`
  - `selected` state widened to `string[] | null` to local-echo un-votes.
  - New `undoVote` handler + shared `sendAnswers(answers)` helper; renders an `AccessibleButton` (`mx_MPollBody_undoVote`) in the totals row when the user has a vote and the poll is active.
  - Builds a `votersByAnswer` map (`Map<answerId, RoomMember[]>`) and passes it to each `PollOption`.
  - `showResults` no longer requires the local user to have voted.
  - `collectUserVotes` accepts `string[] | string | null` for the `selected` parameter.
- `apps/web/src/components/views/polls/PollOption.tsx`
  - New optional `voters: RoomMember[]` prop.
  - Renders `FacePile` below the popularity bar when voters are present.
- `apps/web/res/css/components/views/polls/_PollOption.pcss`
  - Added `.mx_PollOption_voters` styles.
- `apps/web/res/css/views/messages/_MPollBody.pcss`
  - `.mx_MPollBody_undoVote { margin-left: auto; }` to right-align the undo link in the totals row.
- `apps/web/src/i18n/strings/en_EN.json`
  - Added `poll.undo_vote` and `poll.undo_vote_aria` strings.

## Compatibility

- **Element Web (this fork):** Full UX described above.
- **Element X / mobile / upstream Element:** Renders the poll normally. Un-votes are correctly un-counted (spoiled responses are spec-standard). No voter-avatar row, but the vote data is identical.
- **Closed/undisclosed polls:** Unchanged. Results hidden until poll ends; no voter avatars.

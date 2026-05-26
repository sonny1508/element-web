# Open Poll UX

Enhancements to the **disclosed** (open) poll rendering. No new event type — these changes stay spec-compliant with MSC3381 so other Matrix clients (Element X, mobile, FluffyChat, etc.) continue to interop correctly.

## What changed

### 1. Un-vote by clicking your selected option
Clicking the option you already voted for retracts your vote. Implemented by sending a `PollResponseEvent` with an empty `answers` array — the standard "spoiled" response per MSC3381. Other clients already discard spoiled responses, so the un-vote is honored across the federation.

- Local-echo of the un-vote is reflected immediately in the UI (vote count, voter avatars, checked state).
- The `mx_PollOption_checked` CSS rule no longer sets `pointer-events: none`, so checked options remain clickable. Ended polls remain locked.

### 2. Voter avatars per option
Each option now shows a row of avatars (via `FacePile`) of the room members who voted for it. Built from the same `userVotes` map used for counts, so local-echo (including un-votes) flows through.

- Only rendered for disclosed polls.
- Avatar row stops click propagation so clicking an avatar doesn't accidentally toggle the vote.

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
  - `selectOption` sends an empty answers array when clicking the already-selected option.
  - Builds a `votersByAnswer` map (`Map<answerId, RoomMember[]>`) and passes it to each `PollOption`.
  - `showResults` no longer requires the local user to have voted.
  - `collectUserVotes` accepts `string[] | string | null` for the `selected` parameter.
- `apps/web/src/components/views/polls/PollOption.tsx`
  - New optional `voters: RoomMember[]` prop.
  - Renders `FacePile` below the popularity bar when voters are present.
- `apps/web/res/css/components/views/polls/_PollOption.pcss`
  - Dropped `pointer-events: none` from `mx_PollOption_checked` (kept on `mx_PollOption_ended`).
  - Added `.mx_PollOption_voters` styles.

## Compatibility

- **Element Web (this fork):** Full UX described above.
- **Element X / mobile / upstream Element:** Renders the poll normally. Un-votes are correctly un-counted (spoiled responses are spec-standard). No voter-avatar row, but the vote data is identical.
- **Closed/undisclosed polls:** Unchanged. Results hidden until poll ends; no voter avatars.

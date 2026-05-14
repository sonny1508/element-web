# Custom Changes (Glenda Studio Fork)

Changes made on top of Element Web v1.12.15. Reference this when migrating to a newer upstream version.

## Theme: Glenda Light / Glenda Dark

Default light/dark themes were replaced with custom `glenda-light` and `glenda-dark` themes.

**Files changed:**

- `apps/web/src/theme.ts`
  - `DEFAULT_THEME` changed from `"light"` to `"glenda-light"`
- `apps/web/src/settings/watchers/ThemeWatcher.ts`
  - `themeBasedOnSystem()`: system theme matching returns `"glenda-dark"` / `"glenda-light"` instead of `"dark"` / `"light"`
  - `isUserOnDarkTheme()`: added `"glenda-dark"` to the dark theme check

## Hide Empty Rooms from Room List

Rooms named "Empty room" with 0 members (or only the current user) are hidden from the sidebar.

**Files changed:**

- `apps/web/src/stores/room-list-v3/isRoomVisible.ts`
  - Added condition: `room.name === "Empty room" && room.getJoinedMemberCount() <= 1`

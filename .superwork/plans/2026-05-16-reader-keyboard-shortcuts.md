# Reader Keyboard Shortcuts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superwork-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reader-level keyboard shortcuts for the main FeedFuse reading operations without stealing input focus or modal interactions.

**Suggested Spec Reads:**
- `.superwork/spec/guides/index.md` — shared workflow rules and project-wide checklists
- `.superwork/spec/guides/repo-map.md` — frontend entry points and test layout
- `.superwork/spec/guides/verification.md` — required verification commands
- `.superwork/spec/frontend/index.md` — frontend scope and pre-development checklist
- `.superwork/spec/frontend/structure.md` — placement rules for feature-owned interaction logic
- `.superwork/spec/frontend/contracts.md` — reader interaction ownership
- `.superwork/spec/frontend/quality.md` — frontend test and implementation requirements

**Architecture:** Implement shortcuts in `ReaderLayout` because it owns the reader shell, global search state, settings modal, sidebar state, and the selected article. Keep event filtering local and explicit: ignore editable targets and active dialogs, then dispatch known reader commands through `useAppStore`. Add a small shortcut help dialog rendered by the same layout.

**Tech Stack:** Next.js 16, React 19, Zustand, Radix Dialog, Vitest, Testing Library.

---

### Task 1: Reader Shell Shortcut Tests

**Files:**

- Modify: `src/test/features/reader/ReaderLayout.test.tsx`

- [x] **Step 1: Add tests for help, navigation, article actions, search, sidebar, and modal guard**

Add tests to `ReaderLayout.test.tsx` that:

- render two articles in the store
- press `?` and assert the help dialog opens
- press `/` and assert global search opens
- press `j` / `k` and assert `selectedArticleId` moves
- press `m` and assert the selected article becomes read
- press `s` and assert the selected article becomes starred
- press `[` and assert `sidebarCollapsed` toggles
- press shortcuts while help dialog is open and assert reader commands are ignored

- [x] **Step 2: Run the focused test to verify it fails**

Run: `pnpm test:unit -- --run src/test/features/reader/ReaderLayout.test.tsx`
Expected: FAIL because reader shortcuts and help dialog do not exist yet.

### Task 2: Implement Reader Shortcuts

**Files:**

- Modify: `src/features/reader/components/ReaderLayout.tsx`

- [x] **Step 1: Add shortcut metadata and target guards**

Add a concise shortcut table for:

- `?` — open shortcut help
- `/` — global search
- `j` / `n` — next article
- `k` / `p` — previous article
- `m` — mark selected article as read
- `s` — star selected article
- `r` — refresh current snapshot
- `g a` — all articles
- `g u` — unread articles
- `g s` — starred articles
- `[` — collapse or expand sidebar
- `Esc` — close shortcut help

Keep comments short and in Chinese where they explain non-obvious behavior.

- [x] **Step 2: Add the keydown dispatcher**

Extend the existing reader-level keydown effect so it:

- ignores editable targets
- ignores active dialogs except `Escape` for the shortcut help
- supports existing `Cmd/Ctrl+F`
- opens search on `/`
- opens help on `?`
- uses visible store articles ordered as already stored for navigation
- calls `markAsRead`, `toggleStar`, `loadSnapshot`, `setSelectedView`, and `toggleSidebar`

- [x] **Step 3: Render the shortcut help dialog**

Add a Radix dialog using existing `Dialog` components with a compact list of shortcuts. Ensure no nested cards and no text overflow.

- [x] **Step 4: Run the focused test to verify it passes**

Run: `pnpm test:unit -- --run src/test/features/reader/ReaderLayout.test.tsx`
Expected: PASS.

### Task 3: Final Verification

**Files:**

- Verify changed files from Tasks 1-2

- [x] **Step 1: Run lint**

Run: `pnpm lint`
Expected: PASS.

- [x] **Step 2: Run type check**

Run: `pnpm type-check`
Expected: PASS.

- [x] **Step 3: Run focused frontend tests**

Run: `pnpm test:unit -- --run src/test/features/reader/ReaderLayout.test.tsx`
Expected: PASS.

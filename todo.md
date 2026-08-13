# Stephen's To-Do Dashboard — Project TODO

## Database & Backend
- [x] Define schema: categories, tasks (hierarchical), notes
- [x] Generate and apply migration SQL
- [x] Seed 9 original categories with all original tasks
- [x] tRPC procedures: list, create, update, delete, reorder categories
- [x] tRPC procedures: list, create, update, delete, reorder tasks
- [x] tRPC procedures: move task between categories / re-parent
- [x] Export all data as JSON
- [x] Import JSON snapshot (replace all data)

## Frontend — Layout & Theme
- [x] Apply original design system CSS variables (light + dark)
- [x] Light/Dark theme toggle
- [x] Responsive layout (mobile, tablet, desktop)
- [x] Stats bar: Total items, Urgent, Categories, Completed

## Frontend — Categories
- [x] Render category cards with color-coded dots
- [x] Collapse/expand categories
- [x] Rename category inline
- [x] Add new category
- [x] Delete category with undo toast
- [x] Per-category progress bar
- [x] Category filter chips
- [x] URGENT category special styling (red border)

## Frontend — Tasks
- [x] Render hierarchical tasks (unlimited nesting)
- [x] Inline text editing
- [x] Check off / mark complete
- [x] Add sub-item
- [x] Add/edit per-item notes (expandable textarea)
- [x] Delete task with undo toast
- [x] Collapse/expand parent items
- [x] Drag-and-drop reorder within category
- [x] Drag-and-drop move between categories
- [x] Show/Hide completed toggle
- [x] Search/filter across all items and notes

## Frontend — Data Management
- [x] Export snapshot to JSON
- [x] Import snapshot from JSON file

## Tests
- [x] Vitest: category CRUD procedures (5 tests)
- [x] Vitest: task CRUD procedures (8 tests)
- [x] Vitest: data export/import procedures (2 tests)
- [x] Vitest: auth router (1 test)
- [x] Vitest: auth logout (1 test)

## Drag-and-Drop Improvements
- [x] Full cross-category drag: move any task to any other category as a top-level item
- [x] Re-parent drag: drop task onto another task to nest it as a child
- [x] Move sub-item to top-level of same or different category
- [x] Visual drop zones between items and on category header drop areas
- [x] Persist new categoryId, parentId, and sortOrder on every drop

## Category Reordering
- [x] Drag category cards up/down to reorder them
- [x] Show drop-line between category cards while dragging
- [x] Persist new sortOrder for all affected categories on drop

## Clear Completed
- [x] Add "Clear completed" button per category (only visible when ≥1 done item exists)
- [x] Clicking it deletes all done tasks in that category (including done sub-items)
- [x] Show undo toast with count of removed items

## New Item UX
- [x] Auto-focus and select-all text when a new item is created so typing replaces "New item"
- [x] Pressing Enter commits the text and locks in the content
- [x] Clicking away (blur) also commits the text

## iOS Drag-and-Drop Fix
- [x] Replace HTML5 drag events with pointer-events-based drag (works on iOS Safari/iPad)
- [x] Task reordering via touch drag on iOS
- [x] Category reordering via touch drag on iOS

## Mobile Swipe-to-Delete
- [x] Add a threshold-based left-swipe gesture to task rows on touch devices
- [x] Ensure swiping reveals a delete action without interfering with scrolling, text editing, or drag handles
- [x] Verify responsive task controls and deletion behavior on mobile
- [x] Add unit coverage for touch intent, reveal threshold, and protected task controls

## Swipe Deletion Confirmation
- [x] Add an optional preference to confirm swipe-revealed task deletions
- [x] Show an accessible confirmation prompt before deleting when the preference is enabled
- [x] Test confirmation and immediate-delete paths
- [x] Add component tests for confirmed and immediate swipe deletion actions
- [x] Test persisted swipe confirmation preference handling
- [x] Test the rendered confirmation dialog’s confirm and cancel actions

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

## Today View & Due Dates
- [x] Add a nullable due-date field to tasks and support it in task mutations
- [x] Add due-date editing and a visible due-date indicator to task rows
- [x] Create a dedicated Today view for unfinished urgent and due-today tasks
- [x] Test task due-date filtering and Today view selection logic

## Recurrence, Upcoming & Priority
- [x] Add recurrence and priority fields to task storage and task APIs
- [x] Advance a recurring task’s due date when it is completed
- [x] Add daily, weekly, monthly, and no-repeat controls to each task
- [x] Add independent high, medium, and low priority controls and indicators
- [x] Create a shareable Upcoming view for unfinished tasks due in the next 7 days
- [x] Test recurrence calculation, priority handling, and Upcoming selection logic

## Priority Filters & Calendar
- [x] Add high, medium, low, and all-priority filters to task views
- [x] Add a shareable High priority quick view
- [x] Build a responsive month calendar organised by task due dates
- [x] Support calendar month navigation and task selection/editing
- [x] Test priority filtering and calendar date grouping helpers
- [x] Ensure expanded task view navigation remains accessible on narrow mobile screens
- [x] Apply the selected priority filter to Today and Upcoming task lists
- [x] Add focused-view tests for priority filters and the High quick view state
- [x] Add Dashboard tests for priority filters in Today and Upcoming views
- [x] Add Dashboard tests for the High quick view URL state and rendered task selection

## Saved Custom Filters
- [x] Add persistent saved-filter storage and server-side CRUD APIs
- [x] Support named combinations of priority, due-date range, category, and completion status
- [x] Add controls to create, apply, and delete saved filters
- [x] Seed a reusable “High priority due this week” filter
- [x] Test saved-filter persistence and task selection behavior
- [x] Preserve saved custom filters in JSON exports and imports
- [x] Add an update API and database helper for saved filters
- [x] Add an edit workflow for renaming or changing an existing saved filter
- [x] Test saved-filter update behavior
- [x] Test submitted saved-filter edits and refreshed rendered filter data
- [x] Test refreshed saved-filter list data after an edited filter is updated

## Direct Reports & Accountability
- [x] Add persistent Direct Reports storage and a nullable accountable direct-report field on tasks
- [x] Add server APIs for Direct Report CRUD and task accountability assignment
- [x] Add an N/A option and Direct Report dropdown to all task editing surfaces
- [x] Build a Direct Reports management section with add, rename, and delete actions
- [x] Preserve task accountability in snapshots, undo, and imports
- [x] Test Direct Report management and task assignment behavior

## Direct Report Filter & Task Nesting
- [x] Add an all, N/A, and per-Direct-Report task filter option
- [x] Apply Direct Report filters consistently to task lists and focused views
- [x] Verify drag-to-nest behavior and provide clear feedback when dropping onto a task
- [x] Test Direct Report filtering and task re-parenting behavior
- [x] Test the explicit drag-to-nest drop target’s re-parenting payload and cycle rejection

## Task Notes Visibility
- [x] Add a clear expand/collapse Notes control for tasks with notes
- [x] Preserve inline note editing and note deletion when expanded
- [x] Test note visibility toggling and responsive task-row behavior
- [x] Add narrow-layout interaction coverage for task note controls

## Direct Reports Layout
- [x] Move the Direct Reports management section to the bottom of the dashboard
- [x] Verify its desktop and mobile layout remains usable
- [x] Verify the relocated Direct Reports controls at the bottom of the mobile layout
- [x] Add narrow-viewport interaction coverage for the bottom-positioned Direct Reports manager

## Reliable Task Drag-and-Drop
- [x] Support dropping a task into an empty category as a top-level task
- [x] Support precise drop zones before, between, and after all sibling tasks
- [x] Support dropping a task into any sub-task level while blocking invalid parent-child cycles
- [x] Preserve sibling order when reordering within or across categories and hierarchy levels
- [x] Test empty-category, between-item, nesting, and touch drag target behavior
- [x] Add Dashboard drag tests for empty-category, sibling-gap, and sub-task drops
- [x] Add touch-oriented coverage for task drop-target activation and placement payloads
- [x] Add Dashboard assertions for empty, sibling-gap, and sub-task drop target rendering
- [x] Add deterministic pointer/touch drag-end placement parity coverage
- [x] Route pointer and touch activator paths through a shared drag-end placement abstraction
- [x] Test sensor-specific activator detection and identical placement payloads for both paths

## Non-Drag Task Movement
- [x] Add a task-level Move to control for category and parent reassignment
- [x] Add keyboard shortcuts for moving tasks up, down, nesting, and outdenting
- [x] Test non-drag and keyboard task movement behavior across hierarchical lists

## Keyboard Navigation & Multi-Select
- [x] Add a compact keyboard shortcut reference panel in the dashboard header
- [x] Add task multi-select checkboxes with clear selected-count feedback
- [x] Add bulk move and indent actions for selected compatible tasks
- [x] Add keyboard shortcuts to complete, delete, and change task priority
- [x] Test shortcut discovery, multi-select actions, and expanded keyboard task commands

## Daily Dashboard Email Export
- [x] Confirm daily delivery from stephen.deblanche@gmail.com to stephend@nutun.com at 19:00 SAST
- [x] Select fully automatic delivery rather than a manually approved Gmail draft
- [x] Obtain and validate an unattended Gmail sending credential for stephen.deblanche@gmail.com
- [ ] Redeploy the daily dashboard email route before re-enabling the recurring job
- [ ] Trigger and verify an authenticated scheduled callback, including an application-written delivery timestamp
- [ ] Reconfirm schedule-management documentation after authenticated scheduled verification
- [x] Send the user-approved one-time test export to stephend@nutun.com

## Daily PDF Dashboard Report
- [x] Generate a readable PDF report from the current dashboard snapshot
- [x] Attach the PDF report alongside the JSON restore backup in daily emails
- [ ] Deploy and verify the PDF-enhanced email delivery workflow

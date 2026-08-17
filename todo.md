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
- [x] Redeploy the daily dashboard email route before re-enabling the recurring job
- [x] Trigger and verify a real authenticated Heartbeat callback, including an application-written delivery timestamp
- [x] Reconfirm schedule-management documentation after the real Heartbeat verification
- [x] Inspect the user-initiated Run Now execution and its delivery record
- [x] Send the user-approved one-time test export to stephend@nutun.com

## Daily PDF Dashboard Report
- [x] Generate a readable PDF report from the current dashboard snapshot
- [x] Attach the PDF report alongside the JSON restore backup in daily emails
- [x] Deploy and verify the PDF-enhanced email delivery workflow

## Dashboard Email Settings
- [x] Add a dashboard settings panel for the daily email recipient and delivery time
- [x] Validate and persist recipient and 24-hour SAST delivery-time updates
- [x] Update the recurring schedule safely when the delivery time changes
- [x] Test invalid recipient and delivery-time validation in the email settings panel
- [x] Reconfirm complete email settings validation, saving, schedule updates, and responsive layout coverage

## Priority Flag Detail Toggle
- [x] Make the task priority flag toggle a detail panel beneath its task row
- [x] Add notes viewing and editing directly inside the priority-flag-expanded detail panel
- [x] Test priority-flag expansion and inline notes editing at a narrow mobile viewport
- [x] Reconfirm desktop and mobile visual layout after adding inline detail notes

## iOS Mobile App
- [x] Restore the native iOS companion source after workspace cleanup
- [x] Add interaction coverage that submits a new task and verifies the mocked create payload and refresh
- [x] Regenerate and inspect a complete iOS companion source handoff archive
- [x] Add higher-level workflow validation beyond task utility coverage
- [x] Authenticate Expo build access and prepare the TestFlight build
- [x] Add and validate the iOS encryption declaration required for TestFlight configuration
- [x] Authorize Apple build credentials through securely supplied manual signing assets
- [x] Validate the supplied Apple ID and app-specific password route before using the safer manual signing route
- [x] Enter the prepared Apple app-specific password through the secure credential field
- [x] Replace the rejected app-specific password route with validated API-key and manual-signing configuration
- [x] Create and securely configure an App Store Connect API key for iOS signing and submission
- [x] Create the Apple App ID, distribution certificate, and App Store provisioning profile manually
- [x] Replace the rejected elliptic-curve CSR with an Apple-compatible RSA 2048 CSR
- [x] Verify the supplied Apple Distribution certificate matches the generated RSA private key
- [x] Package the matching distribution certificate and private key for secure build signing
- [x] Verify the supplied App Store provisioning profile matches the App ID and distribution certificate
- [x] Submit the completed iOS build to App Store Connect for TestFlight processing
- [x] Create the Stephen’s To-Do Dashboard App Store Connect record with the registered bundle ID
- [x] Register the explicit iOS App ID com.stephendeblanche.stephenstodo
- [x] Enter the App Store Connect Key ID, Issuer ID, and `.p8` contents through secure settings
- [x] Request and validate a temporary Expo access token through secure project settings
- [x] Obtain and validate a replacement Expo token through secure project settings
- [x] Record the owner’s manual confirmation that the chat-exposed token was revoked outside the project

## iOS Mobile App
- [x] Select native iOS companion app distribution through TestFlight
- [x] Confirm Apple Developer account availability for the final TestFlight upload
- [x] Define a focused shared-data API for tasks, categories, and Direct Reports aligned with the existing dashboard access model
- [x] Build the iOS task-management screens and interactions
- [x] Validate the iOS bundle, companion utilities, and shared-data preview
- [x] Use secure Expo token authentication after the browser sign-in handoff proved unreliable
- [x] Prepare and submit the authenticated TestFlight build

## TestFlight Installation Guidance
- [x] Guide the user from the App Store Distribution page to the TestFlight build and internal testing access
- [x] Resolve the assigned tester’s “No Builds Available” TestFlight status through internal testing access

## iOS Reminders & Offline Sync
- [x] Select server-driven push reminders with urgent alerts at 08:00 SAST and due-date alerts at 09:00 SAST
- [x] Add offline task cache and persisted mutation queue with temporary-ID reconciliation to the iOS companion
- [x] Sync queued task changes automatically when the app regains connectivity, including offline-created task edits
- [x] Add task notification permission controls, Expo device registration, and live 08:00/09:00 SAST server reminder schedules
- [x] Test offline cache, sync conflicts, and notification scheduling before TestFlight delivery
- [x] Enable Push Notifications for the registered App ID and regenerate the App Store provisioning profile
- [x] Verify the replacement provisioning profile includes the aps-environment entitlement
- [x] Submit the signed iOS 1.1.0 reminder update to TestFlight processing
- [x] Verify the newly registered iOS push device and its enabled reminder preferences
- [x] Send and verify the user-approved one-time iOS push reminder test
- [x] Create and securely configure an APNs authentication key for the iOS companion push service
- [x] Enter the APNs Key ID and downloaded `.p8` private key through secure settings
- [x] Replace the sandbox-only APNs key with a production-capable Apple Push Notifications key for TestFlight delivery
- [x] Enter and validate the replacement production APNs Key ID and `.p8` file through secure settings
- [x] Add explicit offline-sync conflict coverage that documents and verifies the intended replay behavior when a server task changes while the device is offline
- [x] Run and record the final dashboard and iOS companion regression suites after APNs credential registration and push verification
- [x] Confirm that TestFlight submission must use the API workflow because macOS upload access is unavailable

## iOS Visual Layout Corrections
- [x] Replace the oversized horizontal category selector cards with compact, horizontally scrollable filter chips on iPhone
- [x] Prevent category labels and controls from clipping, wrapping into tall blocks, or pushing the task list below the fold
- [x] Refine task-row text and priority-control sizing so titles, metadata, and flags remain legible on narrow screens
- [x] Add iPhone-size layout regression coverage and verify the revised screen composition
- [x] Build and submit the corrected iOS companion version to TestFlight
- [x] Remove the category-filter container’s residual vertical space when a category is selected
- [x] Keep category chips and priority/completion filters in a compact continuous control area above the task list
- [x] Add regression coverage for the no-gap selected-category layout and publish the corrected TestFlight build

## Native iOS Management Controls
- [x] Add shared mobile APIs and queued task mutations for category-related and Direct Report management workflows
- [x] Add native controls to create and manage top-level categories from the iPhone app
- [x] Add native controls to create tasks as sub-categories beneath existing tasks
- [x] Add native Direct Report management and task assignment controls
- [x] Add end-to-end tests for category, sub-category, and Direct Report workflows
- [x] Build and submit the native management update to TestFlight

## Native iOS Editing, Colours & Reordering
- [x] Add shared mobile mutations for renaming, deleting, and reordering categories and Direct Reports
- [x] Add category colour-palette selection and persist the selected colour across devices
- [x] Add native rename and protected delete controls for categories and Direct Reports
- [x] Add touch-friendly category reordering with persistent ordering updates
- [x] Add touch-friendly nested sub-category reordering with persistent sibling ordering updates
- [x] Add interaction and API regression coverage for editing, deletion, colour choice, and reordering
- [x] Build and submit the enhanced native management update to TestFlight

## Native iOS Task Movement
- [x] Add native task reordering within the current category while preserving sibling hierarchy
- [x] Add a touch-friendly destination picker for moving a task to another category or beneath a valid parent task
- [x] Persist category, parent, and sibling-order changes safely through the shared task reorder contract
- [x] Add interaction and API regression coverage for task reordering and cross-category or nested movement
- [x] Build and submit the native task movement update to TestFlight

## Native iOS Multi-Select & Bulk Movement
- [x] Add safe bulk task-movement calculations that preserve selected ordering and block invalid parent destinations
- [x] Add native task selection controls and a compact selected-item action bar
- [x] Add a bulk destination picker for moving selected tasks to another category or beneath a valid parent task
- [x] Add regression coverage for multi-select, bulk category moves, and bulk nested moves
- [x] Build and submit the native bulk movement update to TestFlight

## Native iOS Reordering Exit Fix
- [x] Add a prominent completion action that exits task reordering and returns to the main task list
- [x] Add regression coverage for exiting the task reordering view
- [x] Build and submit the corrective native update to TestFlight

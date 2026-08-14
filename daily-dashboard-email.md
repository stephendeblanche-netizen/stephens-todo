# Daily Dashboard Email Export

The dashboard is configured to send a readable PDF report and a JSON export from `stephen.deblanche@gmail.com` to `stephend@nutun.com` each day at **19:00 SAST**. The PDF file, named `stephens-todo-dashboard-report-YYYY-MM-DD.pdf`, is the attachment to open on a phone, tablet, or computer. It contains an overview and the category-by-category task list. The JSON file, named `stephens-todo-dashboard-YYYY-MM-DD.json`, is a restore backup rather than a document to read; use it only through the dashboard’s **Import snapshot** control.

The recurring job is named `daily-dashboard-export-email` and runs at `17:00 UTC`, which corresponds to 19:00 SAST. It is enabled by default.

## Managing the schedule

Open the project’s **Settings → Schedules** panel to view execution history, run the email job immediately, pause it, resume it, or adjust the recurrence. If a run fails, use the job’s investigation view to inspect the returned server error. The server only accepts authenticated scheduler calls, and it records the last successful delivery time in the dashboard email schedule configuration.

## Delivery safeguards

The sender uses a Gmail App Password held as a server-side secret. The job does not use the browser-connected Gmail action, so it can run automatically without a daily approval prompt. The schedule callback is linked to its platform job ID and ignores disabled or orphaned callback requests.

// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "./Dashboard";
import { ThemeProvider } from "@/contexts/ThemeContext";

const fixture = vi.hoisted(() => ({
  categories: [
    { id: 1, name: "URGENT", kind: "urgent", colorIndex: 0, sortOrder: 0, collapsed: false },
    { id: 2, name: "QDR", kind: "normal", colorIndex: 1, sortOrder: 1, collapsed: false },
  ],
  tasks: [
    { id: 1, categoryId: 1, parentId: null, text: "Urgent high today", note: "Important detail", dueAt: new Date("2026-08-13T12:00:00").getTime(), priority: "high", recurrence: "none", accountableDirectReportId: 1, done: false, collapsed: false, sortOrder: 0 },
    { id: 2, categoryId: 2, parentId: null, text: "Medium due today", note: "", dueAt: new Date("2026-08-13T12:00:00").getTime(), priority: "medium", recurrence: "none", accountableDirectReportId: null, done: false, collapsed: false, sortOrder: 1 },
    { id: 3, categoryId: 2, parentId: null, text: "High upcoming", note: "", dueAt: new Date("2026-08-14T12:00:00").getTime(), priority: "high", recurrence: "weekly", accountableDirectReportId: 1, done: false, collapsed: false, sortOrder: 2 },
  ] as Array<{
    id: number; categoryId: number; parentId: number | null; text: string; note: string; dueAt: number | null;
    priority: "high" | "medium" | "low"; recurrence: "none" | "daily" | "weekly" | "monthly";
    accountableDirectReportId: number | null; done: boolean; collapsed: boolean; sortOrder: number;
  }>,
  filters: [
    { id: 1, name: "High priority due this week", priority: "high", dueRange: "this_week", categoryId: null, includeCompleted: false, sortOrder: 0 },
  ],
  directReports: [
    { id: 1, name: "Alex Morgan", sortOrder: 0 },
  ],
  updateFilterMutate: vi.fn(),
  taskUpdateMutate: vi.fn(),
  taskDeleteMutate: vi.fn(),
  reorderTaskMutate: vi.fn(),
  createDirectReportMutate: vi.fn(),
  updateEmailSettingsMutate: vi.fn(),
  syncOutlookTaskMutate: vi.fn(),
  sendOutlookEmailMutate: vi.fn(),
  microsoftConnected: false,
  emailSettings: { id: 1, sender: "stephen.deblanche@gmail.com", recipient: "stephend@nutun.com", deliveryTimeSast: "19:00", scheduleCronTaskUid: "cron-1", enabled: true, lastSentAt: null },
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 1, role: "admin" }, loading: false }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      categories: { list: { invalidate: vi.fn() } },
      tasks: { listAll: { invalidate: vi.fn() } },
      filters: { list: { invalidate: vi.fn() } },
      directReports: { list: { invalidate: vi.fn() } },
      dashboardEmailSettings: { get: { invalidate: vi.fn() } },
      microsoft: { status: { invalidate: vi.fn() }, calendarEvents: { invalidate: vi.fn() }, inbox: { invalidate: vi.fn() } },
    }),
    categories: {
      list: { useQuery: () => ({ data: fixture.categories, isLoading: false }) },
      create: { useMutation: () => ({ mutate: vi.fn() }) }, update: { useMutation: () => ({ mutate: vi.fn() }) }, delete: { useMutation: () => ({ mutate: vi.fn() }) }, reorder: { useMutation: () => ({ mutate: vi.fn() }) },
    },
    tasks: {
      listAll: { useQuery: () => ({ data: fixture.tasks, isLoading: false }) },
      create: { useMutation: () => ({ mutate: vi.fn() }) }, update: { useMutation: () => ({ mutate: fixture.taskUpdateMutate }) }, delete: { useMutation: () => ({ mutate: fixture.taskDeleteMutate }) }, clearCompleted: { useMutation: () => ({ mutate: vi.fn() }) }, reorder: { useMutation: () => ({ mutate: fixture.reorderTaskMutate }) },
    },
    filters: {
      list: { useQuery: () => ({ data: fixture.filters, isLoading: false }) },
      create: { useMutation: () => ({ mutate: vi.fn() }) },
      update: { useMutation: () => ({ mutate: fixture.updateFilterMutate }) },
      delete: { useMutation: () => ({ mutate: vi.fn() }) },
    },
    directReports: {
      list: { useQuery: () => ({ data: fixture.directReports, isLoading: false }) },
      create: { useMutation: () => ({ mutate: fixture.createDirectReportMutate }) },
      update: { useMutation: () => ({ mutate: vi.fn() }) },
      delete: { useMutation: () => ({ mutate: vi.fn() }) },
    },
    dashboardEmailSettings: {
      get: { useQuery: () => ({ data: fixture.emailSettings, isLoading: false }) },
      update: { useMutation: () => ({ mutate: fixture.updateEmailSettingsMutate, isPending: false }) },
    },
    microsoft: {
      status: { useQuery: () => ({ data: { connected: fixture.microsoftConnected, email: fixture.microsoftConnected ? "StephenD@nutun.com" : null, displayName: fixture.microsoftConnected ? "Stephen De Blanche" : null, expiresAt: null }, isLoading: false }) },
      calendarEvents: { useQuery: () => ({ data: [], isLoading: false }) },
      inbox: { useQuery: () => ({ data: [], isLoading: false }) },
      syncTaskEvent: { useMutation: () => ({ mutate: fixture.syncOutlookTaskMutate, isPending: false }) },
      importEmailAsTask: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      sendEmail: { useMutation: () => ({ mutate: fixture.sendOutlookEmailMutate, isPending: false }) },
      disconnect: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
    data: {
      export: { useQuery: () => ({ refetch: vi.fn() }) },
      import: { useMutation: () => ({ mutate: vi.fn() }) },
    },
  },
}));

function renderDashboard(view: string) {
  window.history.replaceState({}, "", `/?view=${view}`);
  return render(<ThemeProvider defaultTheme="light"><Dashboard /></ThemeProvider>);
}

describe("Dashboard focused priority views", () => {
  beforeEach(() => {
    window.localStorage.clear();
    const todayAtNoon = new Date();
    todayAtNoon.setHours(12, 0, 0, 0);
    const tomorrowAtNoon = new Date(todayAtNoon);
    tomorrowAtNoon.setDate(tomorrowAtNoon.getDate() + 1);
    fixture.categories = [
      { id: 1, name: "URGENT", kind: "urgent", colorIndex: 0, sortOrder: 0, collapsed: false },
      { id: 2, name: "QDR", kind: "normal", colorIndex: 1, sortOrder: 1, collapsed: false },
    ];
    fixture.tasks = [
      { id: 1, categoryId: 1, parentId: null, text: "Urgent high today", note: "Important detail", dueAt: todayAtNoon.getTime(), priority: "high", recurrence: "none", accountableDirectReportId: 1, done: false, collapsed: false, sortOrder: 0 },
      { id: 2, categoryId: 2, parentId: null, text: "Medium due today", note: "", dueAt: todayAtNoon.getTime(), priority: "medium", recurrence: "none", accountableDirectReportId: null, done: false, collapsed: false, sortOrder: 1 },
      { id: 3, categoryId: 2, parentId: null, text: "High upcoming", note: "", dueAt: tomorrowAtNoon.getTime(), priority: "high", recurrence: "weekly", accountableDirectReportId: 1, done: false, collapsed: false, sortOrder: 2 },
    ];
    fixture.updateFilterMutate.mockReset();
    fixture.taskUpdateMutate.mockReset();
    fixture.taskDeleteMutate.mockReset();
    fixture.reorderTaskMutate.mockReset();
    fixture.createDirectReportMutate.mockReset();
    fixture.updateEmailSettingsMutate.mockReset();
    fixture.syncOutlookTaskMutate.mockReset();
    fixture.sendOutlookEmailMutate.mockReset();
    fixture.microsoftConnected = false;
    fixture.filters = [
      { id: 1, name: "High priority due this week", priority: "high", dueRange: "this_week", categoryId: null, includeCompleted: false, sortOrder: 0 },
    ];
  });
  afterEach(() => {
    cleanup();
    window.history.replaceState({}, "", "/");
  });

  it("applies the High filter to Today and Upcoming focused task lists", async () => {
    const user = userEvent.setup();
    const { unmount } = renderDashboard("today");

    expect(screen.getByDisplayValue("Urgent high today")).not.toBeNull();
    expect(screen.getByDisplayValue("Medium due today")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Filter High priority" }));
    expect(screen.getByDisplayValue("Urgent high today")).not.toBeNull();
    expect(screen.queryByDisplayValue("Medium due today")).toBeNull();

    unmount();
    renderDashboard("upcoming");
    await user.click(screen.getByRole("button", { name: "Filter High priority" }));
    expect(screen.getByDisplayValue("Urgent high today")).not.toBeNull();
    expect(screen.getByDisplayValue("High upcoming")).not.toBeNull();
    expect(screen.queryByDisplayValue("Medium due today")).toBeNull();
  });

  it("restores the High quick view from the URL and excludes non-high tasks", () => {
    renderDashboard("high");
    expect(screen.getByRole("heading", { name: "High priority" })).not.toBeNull();
    expect(screen.getByDisplayValue("Urgent high today")).not.toBeNull();
    expect(screen.getByDisplayValue("High upcoming")).not.toBeNull();
    expect(screen.queryByDisplayValue("Medium due today")).toBeNull();
  });

  it("renders a clear task drop target inside an empty category", () => {
    fixture.categories = [
      ...fixture.categories,
      { id: 3, name: "Empty category", kind: "normal", colorIndex: 2, sortOrder: 2, collapsed: false },
    ];
    renderDashboard("all");
    expect(screen.getByText("No items yet — drag a task here")).not.toBeNull();
  });

  it("renders empty-category, sibling-gap, and sub-task drop targets", () => {
    fixture.categories = [
      ...fixture.categories,
      { id: 3, name: "Empty category", kind: "normal", colorIndex: 2, sortOrder: 2, collapsed: false },
    ];
    fixture.tasks = [
      ...fixture.tasks,
      { id: 4, categoryId: 1, parentId: 1, text: "Existing child", note: "", dueAt: null, priority: "low", recurrence: "none", accountableDirectReportId: null, done: false, collapsed: false, sortOrder: 0 },
    ];
    renderDashboard("all");

    expect(document.querySelector('[data-task-drop-target="gap-3-root-0"]')).not.toBeNull();
    expect(document.querySelector('[data-task-drop-target="gap-1-root-0"]')).not.toBeNull();
    expect(document.querySelector('[data-task-drop-target="gap-1-1-0"]')).not.toBeNull();
    expect(document.querySelector('[data-task-nest-target="1"]')).not.toBeNull();
  });

  it("renders a compact reference for every task keyboard shortcut", () => {
    renderDashboard("all");
    const guide = screen.getByRole("region", { name: "Keyboard shortcuts" });
    expect(guide.textContent).toContain("Ctrl/Cmd + Enter");
    expect(guide.textContent).toContain("Ctrl/Cmd + Shift + Backspace");
  });

  it("selects several tasks and moves them together to a category", async () => {
    fixture.tasks = [
      ...fixture.tasks,
      { id: 4, categoryId: 1, parentId: null, text: "Urgent sibling", note: "", dueAt: null, priority: "low", recurrence: "none", accountableDirectReportId: null, done: false, collapsed: false, sortOrder: 1 },
    ];
    const user = userEvent.setup();
    renderDashboard("all");

    await user.click(screen.getByRole("checkbox", { name: "Select Urgent high today" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Urgent sibling" }));
    expect(screen.getByText("2 selected")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Move to category" }));
    await user.click(screen.getByRole("menuitem", { name: "QDR" }));

    expect(fixture.reorderTaskMutate).toHaveBeenCalledWith([
      { id: 2, categoryId: 2, parentId: null, sortOrder: 0 },
      { id: 3, categoryId: 2, parentId: null, sortOrder: 1 },
      { id: 1, categoryId: 2, parentId: null, sortOrder: 2 },
      { id: 4, categoryId: 2, parentId: null, sortOrder: 3 },
    ]);
  });

  it("indents several consecutive selected tasks together", async () => {
    fixture.tasks = [
      ...fixture.tasks,
      { id: 4, categoryId: 1, parentId: null, text: "Urgent sibling", note: "", dueAt: null, priority: "low", recurrence: "none", accountableDirectReportId: null, done: false, collapsed: false, sortOrder: 1 },
      { id: 5, categoryId: 1, parentId: null, text: "Another urgent sibling", note: "", dueAt: null, priority: "low", recurrence: "none", accountableDirectReportId: null, done: false, collapsed: false, sortOrder: 2 },
    ];
    const user = userEvent.setup();
    renderDashboard("all");

    await user.click(screen.getByRole("checkbox", { name: "Select Urgent sibling" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Another urgent sibling" }));
    await user.click(screen.getByRole("button", { name: "Indent selected" }));

    expect(fixture.reorderTaskMutate).toHaveBeenCalledWith([
      { id: 4, categoryId: 1, parentId: 1, sortOrder: 0 },
      { id: 5, categoryId: 1, parentId: 1, sortOrder: 1 },
    ]);
  });

  it("handles title-field keyboard commands for completion, priority, and deletion", async () => {
    const user = userEvent.setup();
    renderDashboard("all");
    const title = screen.getByDisplayValue("Urgent high today");
    await user.click(title);
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(fixture.taskUpdateMutate).toHaveBeenLastCalledWith({ id: 1, done: true });

    await user.keyboard("{Control>}{Shift>}1{/Shift}{/Control}");
    expect(fixture.taskUpdateMutate).toHaveBeenLastCalledWith({ id: 1, priority: "high" });

    await user.keyboard("{Control>}{Shift>}{Backspace}{/Shift}{/Control}");
    expect(fixture.taskDeleteMutate).toHaveBeenCalledWith({ id: 1 });
  });

  it("moves a task to another category through the task Move menu", async () => {
    const user = userEvent.setup();
    renderDashboard("all");

    await user.click(screen.getByRole("button", { name: "Move Urgent high today" }));
    await user.click(screen.getByRole("menuitem", { name: "Move to QDR" }));

    expect(fixture.reorderTaskMutate).toHaveBeenCalledWith([
      { id: 2, categoryId: 2, parentId: null, sortOrder: 0 },
      { id: 3, categoryId: 2, parentId: null, sortOrder: 1 },
      { id: 1, categoryId: 2, parentId: null, sortOrder: 2 },
    ]);
  });

  it("makes a task a sub-task through the Move to menu", async () => {
    const user = userEvent.setup();
    renderDashboard("all");

    await user.click(screen.getByRole("button", { name: "Move Urgent high today" }));
    const parentSubmenu = screen.getByRole("menuitem", { name: "Make sub-task of…" });
    parentSubmenu.focus();
    await user.keyboard("{ArrowRight}");
    await user.click(await screen.findByRole("menuitem", { name: "QDR → Medium due today" }));

    expect(fixture.reorderTaskMutate).toHaveBeenCalledWith([
      { id: 1, categoryId: 2, parentId: 2, sortOrder: 0 },
    ]);
  });

  it("moves and indents a task from title-field keyboard shortcuts", async () => {
    fixture.tasks = [
      ...fixture.tasks,
      { id: 4, categoryId: 1, parentId: null, text: "Urgent sibling", note: "", dueAt: null, priority: "low", recurrence: "none", accountableDirectReportId: null, done: false, collapsed: false, sortOrder: 1 },
    ];
    const user = userEvent.setup();
    renderDashboard("all");

    const urgentTitle = screen.getByDisplayValue("Urgent high today");
    await user.click(urgentTitle);
    await user.keyboard("{Alt>}{ArrowDown}{/Alt}");
    expect(fixture.reorderTaskMutate).toHaveBeenLastCalledWith([
      { id: 4, categoryId: 1, parentId: null, sortOrder: 0 },
      { id: 1, categoryId: 1, parentId: null, sortOrder: 1 },
    ]);

    fixture.reorderTaskMutate.mockReset();
    const siblingTitle = screen.getByDisplayValue("Urgent sibling");
    await user.click(siblingTitle);
    await user.keyboard("{Tab}");
    expect(fixture.reorderTaskMutate).toHaveBeenCalledWith([
      { id: 4, categoryId: 1, parentId: 1, sortOrder: 0 },
    ]);
  });

  it("applies a saved high-priority due-this-week filter to the main task list", async () => {
    const user = userEvent.setup();
    // Keep this fixture in the active calendar week when the suite runs on Sunday.
    fixture.tasks[2]!.dueAt = fixture.tasks[0]!.dueAt;
    renderDashboard("all");
    await user.click(screen.getByRole("button", { name: "High priority due this week" }));
    expect(screen.getByDisplayValue("Urgent high today")).not.toBeNull();
    expect(screen.getByDisplayValue("High upcoming")).not.toBeNull();
    expect(screen.queryByDisplayValue("Medium due today")).toBeNull();
    expect((screen.getByRole("combobox", { name: "Due date range filter" }) as HTMLSelectElement).value).toBe("this_week");
  });

  it("loads a saved filter into edit mode", async () => {
    const user = userEvent.setup();
    renderDashboard("all");
    await user.click(screen.getByRole("button", { name: "Edit High priority due this week" }));
    expect((screen.getByRole("textbox", { name: "Saved filter name" }) as HTMLInputElement).value).toBe("High priority due this week");
    expect(screen.getByRole("button", { name: "Update filter" })).not.toBeNull();
    expect((screen.getByRole("combobox", { name: "Due date range filter" }) as HTMLSelectElement).value).toBe("this_week");
  });

  it("submits edited saved-filter values and exits edit mode after success", async () => {
    fixture.updateFilterMutate.mockImplementation((_data: unknown, options?: { onSuccess?: () => void }) => options?.onSuccess?.());
    const user = userEvent.setup();
    renderDashboard("all");
    await user.click(screen.getByRole("button", { name: "Edit High priority due this week" }));
    const nameInput = screen.getByRole("textbox", { name: "Saved filter name" });
    await user.clear(nameInput);
    await user.type(nameInput, "High tasks this week");
    await user.click(screen.getByRole("button", { name: "Update filter" }));

    expect(fixture.updateFilterMutate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, name: "High tasks this week", priority: "high", dueRange: "this_week" }),
      expect.any(Object),
    );
    expect((screen.getByRole("textbox", { name: "Saved filter name" }) as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("button", { name: "Save filter" })).not.toBeNull();
  });

  it("renders refreshed saved-filter data after a successful edit", async () => {
    fixture.updateFilterMutate.mockImplementation((data: { name: string }, options?: { onSuccess?: () => void }) => {
      fixture.filters = [{ ...fixture.filters[0], name: data.name }];
      options?.onSuccess?.();
    });
    const user = userEvent.setup();
    const { rerender } = renderDashboard("all");
    await user.click(screen.getByRole("button", { name: "Edit High priority due this week" }));
    const nameInput = screen.getByRole("textbox", { name: "Saved filter name" });
    await user.clear(nameInput);
    await user.type(nameInput, "Executive tasks this week");
    await user.click(screen.getByRole("button", { name: "Update filter" }));
    rerender(<ThemeProvider defaultTheme="light"><Dashboard /></ThemeProvider>);

    const refreshed = screen.getByRole("button", { name: "Executive tasks this week" });
    expect(refreshed).not.toBeNull();
    await user.click(refreshed);
    expect((screen.getByRole("combobox", { name: "Due date range filter" }) as HTMLSelectElement).value).toBe("this_week");
  });

  it("offers N/A and Responsible Colleagues for task accountability and saves the selection", async () => {
    const user = userEvent.setup();
    renderDashboard("all");
    const accountable = screen.getAllByRole("combobox", { name: "Responsible Colleague for Urgent high today" })[0] as HTMLSelectElement;
    expect(Array.from(accountable.options).map((option) => option.text)).toEqual(["N/A", "Alex Morgan"]);
    await user.selectOptions(accountable, "na");
    expect(fixture.taskUpdateMutate).toHaveBeenCalledWith({ id: 1, accountableDirectReportId: null });
  });

  it("filters the main task list to a selected Responsible Colleague", async () => {
    const user = userEvent.setup();
    renderDashboard("all");
    await user.selectOptions(screen.getByRole("combobox", { name: "Responsible Colleague filter" }), "1");
    expect(screen.getByDisplayValue("Urgent high today")).not.toBeNull();
    expect(screen.getByDisplayValue("High upcoming")).not.toBeNull();
    expect(screen.queryByDisplayValue("Medium due today")).toBeNull();
  });

  it("expands and collapses a task note beneath the task row", async () => {
    const user = userEvent.setup();
    renderDashboard("all");
    await user.click(screen.getByRole("button", { name: "Show notes for Urgent high today" }));
    expect((screen.getByRole("textbox", { name: "Notes for Urgent high today" }) as HTMLTextAreaElement).value).toBe("Important detail");
    await user.click(screen.getByRole("button", { name: "Collapse notes for Urgent high today" }));
    expect(screen.queryByRole("textbox", { name: "Notes for Urgent high today" })).toBeNull();
  });

  it("keeps task note controls accessible at a narrow mobile viewport", async () => {
    const user = userEvent.setup();
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    window.dispatchEvent(new Event("resize"));

    renderDashboard("all");
    await user.click(screen.getByRole("button", { name: "Show notes for Urgent high today" }));
    expect(screen.getByRole("textbox", { name: "Notes for Urgent high today" })).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Collapse notes for Urgent high today" }));
    expect(screen.queryByRole("textbox", { name: "Notes for Urgent high today" })).toBeNull();

    Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
  });

  it("adds a Responsible Colleague from the management section", async () => {
    const user = userEvent.setup();
    renderDashboard("all");
    await user.type(screen.getByRole("textbox", { name: "New Responsible Colleague name" }), "Priya Shah");
    await user.click(screen.getByRole("button", { name: "Add Responsible Colleague" }));
    expect(fixture.createDirectReportMutate).toHaveBeenCalledWith(
      { name: "Priya Shah", sortOrder: 1 },
      expect.any(Object),
    );
  });

  it("keeps the bottom-positioned Responsible Colleagues manager usable at a narrow viewport", async () => {
    const user = userEvent.setup();
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    window.dispatchEvent(new Event("resize"));

    renderDashboard("all");
    const manager = screen.getByRole("region", { name: "Responsible Colleagues manager" });
    const footer = screen.getByRole("contentinfo");
    expect(manager.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);

    await user.type(screen.getByRole("textbox", { name: "New Responsible Colleague name" }), "Morgan Lee");
    await user.click(screen.getByRole("button", { name: "Add Responsible Colleague" }));
    expect(fixture.createDirectReportMutate).toHaveBeenCalledWith(
      { name: "Morgan Lee", sortOrder: 1 },
      expect.any(Object),
    );

    Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
  });

  it("shows and saves editable daily email settings for the dashboard owner", async () => {
    const user = userEvent.setup();
    renderDashboard("all");

    expect((screen.getByLabelText("Daily email recipient") as HTMLInputElement).value).toBe("stephend@nutun.com");
    expect((screen.getByLabelText("Daily email delivery time in SAST") as HTMLInputElement).value).toBe("19:00");
    await user.clear(screen.getByLabelText("Daily email recipient"));
    await user.type(screen.getByLabelText("Daily email recipient"), "reports@example.com");
    await user.clear(screen.getByLabelText("Daily email delivery time in SAST"));
    await user.type(screen.getByLabelText("Daily email delivery time in SAST"), "18:30");
    await user.click(screen.getByRole("button", { name: "Save delivery" }));

    expect(fixture.updateEmailSettingsMutate).toHaveBeenCalledWith({ recipient: "reports@example.com", deliveryTimeSast: "18:30" });
  });

  it("blocks saving daily email settings with an invalid recipient", async () => {
    const user = userEvent.setup();
    renderDashboard("all");
    await user.clear(screen.getByLabelText("Daily email recipient"));
    await user.type(screen.getByLabelText("Daily email recipient"), "not-an-email");
    await user.click(screen.getByRole("button", { name: "Save delivery" }));

    expect(fixture.updateEmailSettingsMutate).not.toHaveBeenCalled();
  });

  it("blocks saving daily email settings without a valid 24-hour delivery time", async () => {
    const user = userEvent.setup();
    renderDashboard("all");
    await user.clear(screen.getByLabelText("Daily email delivery time in SAST"));
    await user.click(screen.getByRole("button", { name: "Save delivery" }));

    expect(fixture.updateEmailSettingsMutate).not.toHaveBeenCalled();
  });

  it("shows the owner-only Outlook connection panel before delegated data is available", () => {
    renderDashboard("all");

    expect(screen.getByRole("region", { name: "Outlook Calendar and email" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Connect Outlook" })).not.toBeNull();
    expect(screen.getByText(/private, delegated integration/i)).not.toBeNull();
  });

  it("keeps a due-task Outlook sync control visible in the connected dashboard card", async () => {
    const user = userEvent.setup();
    fixture.microsoftConnected = true;
    renderDashboard("all");

    expect(screen.getByLabelText("Task to sync to Outlook Calendar")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Sync selected task to Outlook" }));
    expect(fixture.syncOutlookTaskMutate).toHaveBeenCalledWith({ taskId: 1 });
  });

  it("requires review and explicit confirmation before sending a composed Outlook email", async () => {
    const user = userEvent.setup();
    fixture.microsoftConnected = true;
    renderDashboard("all");

    await user.click(screen.getByRole("button", { name: /compose outlook email/i }));
    await user.type(screen.getByLabelText("Outlook email recipients"), "colleague@example.com");
    await user.type(screen.getByLabelText("Outlook email subject"), "Project update");
    await user.type(screen.getByLabelText("Outlook email message"), "The task is complete.");
    expect(fixture.sendOutlookEmailMutate).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Review email" }));
    expect(screen.getByRole("region", { name: "Review Outlook email" })).not.toBeNull();
    expect(fixture.sendOutlookEmailMutate).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Send email" }));
    expect(fixture.sendOutlookEmailMutate).toHaveBeenCalledWith({
      to: ["colleague@example.com"], cc: [], subject: "Project update", body: "The task is complete.", confirmed: true,
    });
  });

  it("toggles a task detail panel below the row when the priority flag is clicked", async () => {
    const user = userEvent.setup();
    fixture.tasks[0]!.dueAt = null;
    renderDashboard("all");

    const flagButtons = screen.getAllByRole("button", { name: "Toggle details for Urgent high today" });
    await user.click(flagButtons[0]!);
    expect(screen.getByRole("region", { name: "Task details for Urgent high today" })).not.toBeNull();
    expect(screen.getByLabelText("Responsible Colleague details for Urgent high today")).not.toBeNull();
    const detailNotes = screen.getByLabelText("Notes in task details for Urgent high today");
    await user.clear(detailNotes);
    await user.type(detailNotes, "Updated through priority details");
    await user.tab();
    expect(fixture.taskUpdateMutate).toHaveBeenCalledWith({ id: 1, note: "Updated through priority details" });

    await user.click(screen.getByRole("button", { name: "Minimise details for Urgent high today" }));
    expect(screen.queryByRole("region", { name: "Task details for Urgent high today" })).toBeNull();
  });

  it("keeps priority-flag detail notes editable at a narrow mobile viewport", async () => {
    const user = userEvent.setup();
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    window.dispatchEvent(new Event("resize"));
    fixture.tasks[0]!.dueAt = null;

    renderDashboard("all");
    await user.click(screen.getAllByRole("button", { name: "Toggle details for Urgent high today" })[0]!);
    const detailNotes = screen.getByLabelText("Notes in task details for Urgent high today") as HTMLTextAreaElement;
    expect(detailNotes).not.toBeNull();
    await user.clear(detailNotes);
    await user.type(detailNotes, "Mobile detail note");
    await user.tab();
    expect(fixture.taskUpdateMutate).toHaveBeenCalledWith({ id: 1, note: "Mobile detail note" });

    Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
  });
});

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
    { id: 1, categoryId: 1, parentId: null, text: "Urgent high today", note: "", dueAt: new Date("2026-08-13T12:00:00").getTime(), priority: "high", recurrence: "none", accountableDirectReportId: 1, done: false, collapsed: false, sortOrder: 0 },
    { id: 2, categoryId: 2, parentId: null, text: "Medium due today", note: "", dueAt: new Date("2026-08-13T12:00:00").getTime(), priority: "medium", recurrence: "none", accountableDirectReportId: null, done: false, collapsed: false, sortOrder: 1 },
    { id: 3, categoryId: 2, parentId: null, text: "High upcoming", note: "", dueAt: new Date("2026-08-14T12:00:00").getTime(), priority: "high", recurrence: "weekly", accountableDirectReportId: 1, done: false, collapsed: false, sortOrder: 2 },
  ],
  filters: [
    { id: 1, name: "High priority due this week", priority: "high", dueRange: "this_week", categoryId: null, includeCompleted: false, sortOrder: 0 },
  ],
  directReports: [
    { id: 1, name: "Alex Morgan", sortOrder: 0 },
  ],
  updateFilterMutate: vi.fn(),
  taskUpdateMutate: vi.fn(),
  createDirectReportMutate: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      categories: { list: { invalidate: vi.fn() } },
      tasks: { listAll: { invalidate: vi.fn() } },
      filters: { list: { invalidate: vi.fn() } },
      directReports: { list: { invalidate: vi.fn() } },
    }),
    categories: {
      list: { useQuery: () => ({ data: fixture.categories, isLoading: false }) },
      create: { useMutation: () => ({ mutate: vi.fn() }) }, update: { useMutation: () => ({ mutate: vi.fn() }) }, delete: { useMutation: () => ({ mutate: vi.fn() }) }, reorder: { useMutation: () => ({ mutate: vi.fn() }) },
    },
    tasks: {
      listAll: { useQuery: () => ({ data: fixture.tasks, isLoading: false }) },
      create: { useMutation: () => ({ mutate: vi.fn() }) }, update: { useMutation: () => ({ mutate: fixture.taskUpdateMutate }) }, delete: { useMutation: () => ({ mutate: vi.fn() }) }, clearCompleted: { useMutation: () => ({ mutate: vi.fn() }) }, reorder: { useMutation: () => ({ mutate: vi.fn() }) },
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
    fixture.updateFilterMutate.mockReset();
    fixture.taskUpdateMutate.mockReset();
    fixture.createDirectReportMutate.mockReset();
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

  it("applies a saved high-priority due-this-week filter to the main task list", async () => {
    const user = userEvent.setup();
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

  it("offers N/A and Direct Reports for task accountability and saves the selection", async () => {
    const user = userEvent.setup();
    renderDashboard("all");
    const accountable = screen.getAllByRole("combobox", { name: "Accountable Direct Report for Urgent high today" })[0] as HTMLSelectElement;
    expect(Array.from(accountable.options).map((option) => option.text)).toEqual(["N/A", "Alex Morgan"]);
    await user.selectOptions(accountable, "na");
    expect(fixture.taskUpdateMutate).toHaveBeenCalledWith({ id: 1, accountableDirectReportId: null });
  });

  it("filters the main task list to a selected Direct Report", async () => {
    const user = userEvent.setup();
    renderDashboard("all");
    await user.selectOptions(screen.getByRole("combobox", { name: "Accountable Direct Report filter" }), "1");
    expect(screen.getByDisplayValue("Urgent high today")).not.toBeNull();
    expect(screen.getByDisplayValue("High upcoming")).not.toBeNull();
    expect(screen.queryByDisplayValue("Medium due today")).toBeNull();
  });

  it("adds a Direct Report from the management section", async () => {
    const user = userEvent.setup();
    renderDashboard("all");
    await user.type(screen.getByRole("textbox", { name: "New Direct Report name" }), "Priya Shah");
    await user.click(screen.getByRole("button", { name: "Add Direct Report" }));
    expect(fixture.createDirectReportMutate).toHaveBeenCalledWith(
      { name: "Priya Shah", sortOrder: 1 },
      expect.any(Object),
    );
  });
});

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
    { id: 1, categoryId: 1, parentId: null, text: "Urgent high today", note: "", dueAt: new Date("2026-08-13T12:00:00").getTime(), priority: "high", recurrence: "none", done: false, collapsed: false, sortOrder: 0 },
    { id: 2, categoryId: 2, parentId: null, text: "Medium due today", note: "", dueAt: new Date("2026-08-13T12:00:00").getTime(), priority: "medium", recurrence: "none", done: false, collapsed: false, sortOrder: 1 },
    { id: 3, categoryId: 2, parentId: null, text: "High upcoming", note: "", dueAt: new Date("2026-08-14T12:00:00").getTime(), priority: "high", recurrence: "weekly", done: false, collapsed: false, sortOrder: 2 },
  ],
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      categories: { list: { invalidate: vi.fn() } },
      tasks: { listAll: { invalidate: vi.fn() } },
    }),
    categories: {
      list: { useQuery: () => ({ data: fixture.categories, isLoading: false }) },
      create: { useMutation: () => ({ mutate: vi.fn() }) }, update: { useMutation: () => ({ mutate: vi.fn() }) }, delete: { useMutation: () => ({ mutate: vi.fn() }) }, reorder: { useMutation: () => ({ mutate: vi.fn() }) },
    },
    tasks: {
      listAll: { useQuery: () => ({ data: fixture.tasks, isLoading: false }) },
      create: { useMutation: () => ({ mutate: vi.fn() }) }, update: { useMutation: () => ({ mutate: vi.fn() }) }, delete: { useMutation: () => ({ mutate: vi.fn() }) }, clearCompleted: { useMutation: () => ({ mutate: vi.fn() }) }, reorder: { useMutation: () => ({ mutate: vi.fn() }) },
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
  beforeEach(() => window.localStorage.clear());
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
});

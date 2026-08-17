import React from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const alertMock = vi.hoisted(() => vi.fn());
const api = vi.hoisted(() => ({ getDashboard: vi.fn(), patchTask: vi.fn(), createTaskRemote: vi.fn(), createCategoryRemote: vi.fn(), createDirectReportRemote: vi.fn(), updateCategoryRemote: vi.fn(), deleteCategoryRemote: vi.fn(), reorderCategoriesRemote: vi.fn(), updateDirectReportRemote: vi.fn(), deleteDirectReportRemote: vi.fn(), reorderTasksRemote: vi.fn() }));
vi.mock("./api", () => api);
vi.mock("expo-haptics", () => ({ ImpactFeedbackStyle: { Light: "light" }, impactAsync: vi.fn() }));
vi.mock("expo-status-bar", () => ({ StatusBar: () => null }));
vi.mock("react-native-gesture-handler", async () => {
  const ReactModule = await import("react");
  return { GestureHandlerRootView: ({ children, ...props }: any) => ReactModule.createElement("GestureHandlerRootView", props, children) };
});
vi.mock("react-native-draggable-flatlist", async () => {
  const ReactModule = await import("react");
  return { default: ({ data, renderItem, ListEmptyComponent, ...props }: any) => ReactModule.createElement("DraggableFlatList", props, data.length ? data.map((item: any, index: number) => renderItem({ item, index, drag: vi.fn(), isActive: false })) : ListEmptyComponent) };
});
vi.mock("react-native", async () => {
  const ReactModule = await import("react");
  const stub = (name: string) => ({ children, ...props }: any) => ReactModule.createElement(name, props, children);
  return {
    ActivityIndicator: stub("ActivityIndicator"), Alert: { alert: alertMock }, FlatList: ({ data, renderItem, ListEmptyComponent, ...props }: any) => ReactModule.createElement("FlatList", props, data.length ? data.map((item: any, index: number) => renderItem({ item, index })) : ListEmptyComponent),
    Modal: ({ visible, children }: any) => visible ? ReactModule.createElement("Modal", null, children) : null,
    Platform: { OS: "ios" }, Pressable: stub("Pressable"), RefreshControl: stub("RefreshControl"), SafeAreaView: stub("SafeAreaView"), StyleSheet: { create: (styles: any) => styles }, Text: stub("Text"), TextInput: stub("TextInput"), View: stub("View"),
  };
});

import App from "../App";

const dashboard = {
  categories: [{ id: 1, name: "URGENT", kind: "urgent" as const, colorIndex: 0, sortOrder: 0 }],
  tasks: [{ id: 9, categoryId: 1, parentId: null, text: "Prepare brief", note: "Existing note", done: false, sortOrder: 0, dueAt: null, priority: "medium" as const, recurrence: "none" as const, accountableDirectReportId: null }],
  directReports: [{ id: 4, name: "Ava", sortOrder: 0 }], syncedAt: 1,
};

const pressables = (root: ReactTestInstance) => root.findAll((node) => String(node.type) === "Pressable");
const tap = async (instance: ReactTestInstance) => act(async () => { instance.props.onPress?.(); await Promise.resolve(); });

describe("restored iOS companion interactions", () => {
  beforeEach(() => {
    api.getDashboard.mockReset().mockResolvedValue(dashboard);
    api.patchTask.mockReset().mockResolvedValue({ success: true });
    api.createTaskRemote.mockReset().mockResolvedValue({ id: 10 });
    api.createCategoryRemote.mockReset().mockResolvedValue({ id: 2 });
    api.createDirectReportRemote.mockReset().mockResolvedValue({ id: 5 });
    api.updateCategoryRemote.mockReset().mockResolvedValue({ success: true });
    api.deleteCategoryRemote.mockReset().mockResolvedValue({ success: true });
    api.reorderCategoriesRemote.mockReset().mockResolvedValue({ success: true });
    api.updateDirectReportRemote.mockReset().mockResolvedValue({ success: true });
    api.deleteDirectReportRemote.mockReset().mockResolvedValue({ success: true });
    api.reorderTasksRemote.mockReset().mockResolvedValue({ success: true });
    alertMock.mockReset();
  });

  it("loads tasks, opens details, updates priority and notes, and opens the add-task sheet", async () => {
    let renderer: ReactTestRenderer;
    await act(async () => { renderer = create(<App />); await Promise.resolve(); });
    const root = renderer!.root;
    expect(api.getDashboard).toHaveBeenCalled();

    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Change priority for Prepare brief")!);
    const noteNodes = root.findAll((node) => String(node.type) === "TextInput" && node.props.accessibilityLabel === "Notes for Prepare brief");
    expect(noteNodes).toHaveLength(1);

    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Set priority high")!);
    expect(api.patchTask).toHaveBeenCalledWith(9, { priority: "high" });

    const noteInput = noteNodes[0]!;
    await act(async () => { noteInput.props.onChangeText("Mobile note"); });
    await act(async () => { noteInput.props.onBlur(); await Promise.resolve(); });
    expect(api.patchTask).toHaveBeenCalledWith(9, { note: "Mobile note" });

    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Add item")!);
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Add task")!);
    expect(root.findAll((node) => String(node.type) === "Modal")).toHaveLength(1);

    const newTaskInput = root.findAll((node) => String(node.type) === "TextInput" && node.props.placeholder === "What needs doing?")[0]!;
    await act(async () => { newTaskInput.props.onChangeText("Create from iPhone"); });
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Confirm add task")!);
    expect(api.createTaskRemote).toHaveBeenCalledWith(expect.objectContaining({ categoryId: 1, text: "Create from iPhone", priority: "medium" }));
    expect(api.getDashboard.mock.calls.length).toBeGreaterThan(1);
  });

  it("creates categories and Direct Reports, assigns a Direct Report, and nests a sub-category", async () => {
    let renderer: ReactTestRenderer;
    await act(async () => { renderer = create(<App />); await Promise.resolve(); });
    const root = renderer!.root;

    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Add item")!);
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Add category")!);
    const categoryInput = root.findAll((node) => String(node.type) === "TextInput" && node.props.accessibilityLabel === "Add category")[0]!;
    await act(async () => { categoryInput.props.onChangeText("Planning"); });
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Confirm add category")!);
    expect(api.createCategoryRemote).toHaveBeenCalledWith({ name: "Planning", sortOrder: 1, colorIndex: 0 });

    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Add item")!);
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Add Direct Report")!);
    const reportInput = root.findAll((node) => String(node.type) === "TextInput" && node.props.accessibilityLabel === "Add Direct Report")[0]!;
    await act(async () => { reportInput.props.onChangeText("Jordan"); });
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Confirm add direct report")!);
    expect(api.createDirectReportRemote).toHaveBeenCalledWith({ name: "Jordan", sortOrder: 1 });

    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Filter by All tasks")!);
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Change priority for Prepare brief")!);
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Assign Ava to Prepare brief")!);
    expect(api.patchTask).toHaveBeenCalledWith(9, { accountableDirectReportId: 4 });

    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Add sub-category under Prepare brief")!);
    const subCategoryInput = root.findAll((node) => String(node.type) === "TextInput" && node.props.accessibilityLabel === "Add sub-category")[0]!;
    await act(async () => { subCategoryInput.props.onChangeText("Prepare proposal"); });
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Confirm add sub-category")!);
    expect(api.createTaskRemote).toHaveBeenCalledWith(expect.objectContaining({ categoryId: 1, parentId: 9, text: "Prepare proposal" }));
  });

  it("renders compact single-line category chips and reserves space for priority controls on iPhone", async () => {
    api.getDashboard.mockResolvedValue({
      ...dashboard,
      categories: [
        ...dashboard.categories,
        { id: 2, name: "Operational Reporting", kind: "normal", colorIndex: 1, sortOrder: 1 },
      ],
      tasks: [{ ...dashboard.tasks[0], text: "A long task title that should remain readable beside its priority" }],
    });
    let renderer: ReactTestRenderer;
    await act(async () => { renderer = create(<App />); await Promise.resolve(); });
    const root = renderer!.root;

    const categoryScroller = root.findAll((node) => String(node.type) === "FlatList" && node.props.horizontal)[0]!;
    expect(categoryScroller.props.style).toMatchObject({ height: 48, flexGrow: 0, flexShrink: 0 });
    const categoryControl = pressables(root).find((node) => node.props.accessibilityLabel === "Filter by Operational Reporting")!;
    expect(categoryControl.props.style).toContainEqual(expect.objectContaining({ height: 40, maxWidth: 176 }));
    const categoryLabel = root.findAll((node) => String(node.type) === "Text" && node.children.includes("Operational Reporting"))[0]!;
    expect(categoryLabel.props.numberOfLines).toBe(1);

    const priorityControl = pressables(root).find((node) => node.props.accessibilityLabel?.startsWith("Change priority for A long task"))!;
    expect(priorityControl.props.style).toContainEqual(expect.objectContaining({ minWidth: 78 }));
  });

  it("edits colours, protects delete actions, and persists category and nested sub-category drag order", async () => {
    api.getDashboard.mockResolvedValue({
      ...dashboard,
      categories: [
        ...dashboard.categories,
        { id: 2, name: "Planning", kind: "normal", colorIndex: 1, sortOrder: 1 },
      ],
      tasks: [
        ...dashboard.tasks,
        { ...dashboard.tasks[0], id: 11, parentId: 9, text: "First child", sortOrder: 0 },
        { ...dashboard.tasks[0], id: 12, parentId: 9, text: "Second child", sortOrder: 1 },
      ],
    });
    let renderer: ReactTestRenderer;
    await act(async () => { renderer = create(<App />); await Promise.resolve(); });
    const root = renderer!.root;

    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Add item")!);
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Manage categories")!);
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Edit category URGENT")!);
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Select category colour 3")!);
    const editInput = root.findAll((node) => String(node.type) === "TextInput" && node.props.accessibilityLabel === "Edit category")[0]!;
    await act(async () => { editInput.props.onChangeText("Critical"); });
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Confirm edit category")!);
    expect(api.updateCategoryRemote).toHaveBeenCalledWith({ id: 1, name: "Critical", colorIndex: 2 });

    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Add item")!);
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Manage categories")!);
    const draggableCategories = root.findAll((node) => String(node.type) === "DraggableFlatList")[0]!;
    await act(async () => { draggableCategories.props.onDragEnd({ data: [{ id: 2, name: "Planning", sortOrder: 1 }, { id: 1, name: "URGENT", sortOrder: 0 }] }); await Promise.resolve(); });
    expect(api.reorderCategoriesRemote).toHaveBeenCalledWith([{ id: 2, sortOrder: 0 }, { id: 1, sortOrder: 1 }]);

    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Delete category Planning")!);
    const categoryDeleteButtons = alertMock.mock.calls.at(-1)?.[2] as Array<{ onPress?: () => void }>;
    await act(async () => { categoryDeleteButtons[1]?.onPress?.(); await Promise.resolve(); });
    expect(api.deleteCategoryRemote).toHaveBeenCalledWith(2);

    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Close category management")!);
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Change priority for Prepare brief")!);
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Reorder sub-categories under Prepare brief")!);
    const draggableSubcategories = root.findAll((node) => String(node.type) === "DraggableFlatList")[0]!;
    await act(async () => { draggableSubcategories.props.onDragEnd({ data: [{ id: 12, sortOrder: 1 }, { id: 11, sortOrder: 0 }] }); await Promise.resolve(); });
    expect(api.reorderTasksRemote).toHaveBeenCalledWith([{ id: 12, sortOrder: 0, parentId: 9, categoryId: 1 }, { id: 11, sortOrder: 1, parentId: 9, categoryId: 1 }]);
  });
});

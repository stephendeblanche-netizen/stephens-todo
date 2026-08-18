import React from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const alertMock = vi.hoisted(() => vi.fn());
const api = vi.hoisted(() => ({ getDashboard: vi.fn(), patchTask: vi.fn(), createTaskRemote: vi.fn(), deleteTaskRemote: vi.fn(), createCategoryRemote: vi.fn(), createDirectReportRemote: vi.fn(), updateCategoryRemote: vi.fn(), deleteCategoryRemote: vi.fn(), reorderCategoriesRemote: vi.fn(), updateDirectReportRemote: vi.fn(), deleteDirectReportRemote: vi.fn(), reorderTasksRemote: vi.fn() }));
vi.mock("./api", () => api);
vi.mock("expo-haptics", () => ({ ImpactFeedbackStyle: { Light: "light" }, impactAsync: vi.fn() }));
vi.mock("expo-status-bar", () => ({ StatusBar: () => null }));
vi.mock("react-native-gesture-handler", async () => {
  const ReactModule = await import("react");
  return { GestureHandlerRootView: ({ children, ...props }: any) => ReactModule.createElement("GestureHandlerRootView", props, children), Swipeable: ({ children, renderRightActions, ...props }: any) => ReactModule.createElement("Swipeable", props, children, renderRightActions?.()) };
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
    Keyboard: { dismiss: vi.fn() }, KeyboardAvoidingView: stub("KeyboardAvoidingView"), Platform: { OS: "ios" }, Pressable: stub("Pressable"), RefreshControl: stub("RefreshControl"), SafeAreaView: stub("SafeAreaView"), ScrollView: stub("ScrollView"), StyleSheet: { create: (styles: any) => styles }, Text: stub("Text"), TextInput: stub("TextInput"), View: stub("View"),
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
    api.deleteTaskRemote.mockReset().mockResolvedValue({ success: true });
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

  it("keeps native add forms inside a keyboard-aware scroll container", async () => {
    let renderer: ReactTestRenderer;
    await act(async () => { renderer = create(<App />); await Promise.resolve(); });
    const root = renderer!.root;

    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Add item")!);
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Add category")!);
    const keyboardAvoider = root.findAll((node) => String(node.type) === "KeyboardAvoidingView")[0]!;
    const formScrollView = root.findAll((node) => String(node.type) === "ScrollView")[0]!;
    const categoryInput = root.findAll((node) => String(node.type) === "TextInput" && node.props.accessibilityLabel === "Add category")[0]!;

    expect(keyboardAvoider.props.behavior).toBe("padding");
    expect(keyboardAvoider.props.keyboardVerticalOffset).toBe(8);
    expect(formScrollView.props.keyboardShouldPersistTaps).toBe("handled");
    expect(formScrollView.props.keyboardDismissMode).toBe("interactive");
    expect(categoryInput.props.returnKeyType).toBe("done");
    expect(categoryInput.props.autoFocus).toBe(true);
  });

  it("uses a dedicated scrollable category picker that keeps long destination lists reachable", async () => {
    api.getDashboard.mockResolvedValue({
      ...dashboard,
      categories: Array.from({ length: 18 }, (_, index) => ({ id: index + 1, name: `Category ${index + 1}`, kind: "normal" as const, colorIndex: index % 8, sortOrder: index })),
    });
    let renderer: ReactTestRenderer;
    await act(async () => { renderer = create(<App />); await Promise.resolve(); });
    const root = renderer!.root;

    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Add item")!);
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Add task")!);
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Choose task category")!);
    const scrollViews = root.findAll((node) => String(node.type) === "ScrollView");
    const pickerScroll = scrollViews.find((node) => node.props.nestedScrollEnabled === true)!;
    expect(scrollViews[0]?.props.scrollEnabled).toBe(false);
    expect(pickerScroll.props.showsVerticalScrollIndicator).toBe(true);
    expect(pressables(root).find((node) => node.props.accessibilityLabel === "Use category Category 18 for task")).toBeTruthy();
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Use category Category 18 for task")!);
    expect(root.findAll((node) => String(node.type) === "Text" && node.children.includes("Category 18"))).not.toHaveLength(0);

    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Choose task category")!);
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Create a new category for this task")!);
    expect(root.findAll((node) => String(node.type) === "TextInput" && node.props.accessibilityLabel === "New category for task")).toHaveLength(1);
  });

  it("submits an inline new category and its task only once when the confirmation action is pressed repeatedly", async () => {
    let renderer: ReactTestRenderer;
    await act(async () => { renderer = create(<App />); await Promise.resolve(); });
    const root = renderer!.root;

    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Add item")!);
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Add task")!);
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Choose task category")!);
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Create a new category for this task")!);
    const categoryInput = root.findAll((node) => String(node.type) === "TextInput" && node.props.accessibilityLabel === "New category for task")[0]!;
    const taskInput = root.findAll((node) => String(node.type) === "TextInput" && node.props.accessibilityLabel === "Add task")[0]!;
    await act(async () => { categoryInput.props.onChangeText("Test"); taskInput.props.onChangeText("Test"); });
    const confirm = pressables(root).find((node) => node.props.accessibilityLabel === "Confirm add task")!;
    await act(async () => { confirm.props.onPress(); confirm.props.onPress(); await Promise.resolve(); });
    expect(api.createCategoryRemote).toHaveBeenCalledTimes(1);
    expect(api.createCategoryRemote).toHaveBeenCalledWith({ name: "Test", sortOrder: 1, colorIndex: 0 });
    expect(api.createTaskRemote).toHaveBeenCalledTimes(1);
    expect(api.createTaskRemote).toHaveBeenCalledWith(expect.objectContaining({ categoryId: 2, text: "Test" }));
  });

  it("uses a dedicated scrollable parent picker and supports creating a new parent inline", async () => {
    api.getDashboard.mockResolvedValue({
      ...dashboard,
      tasks: Array.from({ length: 18 }, (_, index) => ({ ...dashboard.tasks[0], id: index + 9, text: index === 0 ? "Current parent" : `Available parent ${index}`, sortOrder: index })),
    });
    api.createTaskRemote.mockReset().mockResolvedValueOnce({ id: 31 }).mockResolvedValueOnce({ id: 32 });
    let renderer: ReactTestRenderer;
    await act(async () => { renderer = create(<App />); await Promise.resolve(); });
    const root = renderer!.root;

    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Change priority for Current parent")!);
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Add sub-category under Current parent")!);
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Choose parent task for sub-task")!);
    const pickerScroll = root.findAll((node) => String(node.type) === "ScrollView").find((node) => node.props.nestedScrollEnabled === true)!;
    expect(pickerScroll.props.showsVerticalScrollIndicator).toBe(true);
    expect(pressables(root).find((node) => node.props.accessibilityLabel === "Use Available parent 17 as sub-task parent")).toBeTruthy();
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Create a new parent task")!);
    const parentInput = root.findAll((node) => String(node.type) === "TextInput" && node.props.accessibilityLabel === "New parent task")[0]!;
    const childInput = root.findAll((node) => String(node.type) === "TextInput" && node.props.accessibilityLabel === "Add sub-category")[0]!;
    await act(async () => { parentInput.props.onChangeText("New parent"); childInput.props.onChangeText("New child"); });
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Confirm add sub-category")!);
    expect(api.createTaskRemote).toHaveBeenNthCalledWith(1, expect.objectContaining({ categoryId: 1, text: "New parent" }));
    expect(api.createTaskRemote).toHaveBeenNthCalledWith(2, expect.objectContaining({ categoryId: 1, parentId: 31, text: "New child" }));
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

  it("drag-reorders top-level tasks and moves a task beneath another valid task", async () => {
    api.getDashboard.mockResolvedValue({
      ...dashboard,
      tasks: [
        { ...dashboard.tasks[0], id: 9, text: "First urgent", sortOrder: 0 },
        { ...dashboard.tasks[0], id: 10, text: "Second urgent", sortOrder: 1 },
      ],
    });
    let renderer: ReactTestRenderer;
    await act(async () => { renderer = create(<App />); await Promise.resolve(); });
    const root = renderer!.root;

    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Filter by URGENT")!);
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Reorder tasks in current category")!);
    const draggableTasks = root.findAll((node) => String(node.type) === "DraggableFlatList")[0]!;
    await act(async () => { draggableTasks.props.onDragEnd({ data: [{ id: 10, categoryId: 1 }, { id: 9, categoryId: 1 }] }); await Promise.resolve(); });
    expect(api.reorderTasksRemote).toHaveBeenCalledWith([{ id: 10, sortOrder: 0, parentId: null, categoryId: 1 }, { id: 9, sortOrder: 1, parentId: null, categoryId: 1 }]);

    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Close task reordering")!);
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Change priority for Second urgent")!);
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Move task Second urgent")!);
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Move Second urgent under First urgent")!);
    expect(api.reorderTasksRemote).toHaveBeenCalledWith([{ id: 9, categoryId: 1, parentId: null, sortOrder: 0 }, { id: 10, categoryId: 1, parentId: 9, sortOrder: 0 }]);
  });

  it("returns to the main task list from the prominent task-reordering completion action", async () => {
    api.getDashboard.mockResolvedValue({
      ...dashboard,
      tasks: [...dashboard.tasks, { ...dashboard.tasks[0], id: 10, text: "Second urgent", sortOrder: 1 }],
    });
    let renderer: ReactTestRenderer;
    await act(async () => { renderer = create(<App />); await Promise.resolve(); });
    const root = renderer!.root;

    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Filter by URGENT")!);
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Reorder tasks in current category")!);
    expect(root.findAll((node) => String(node.type) === "Modal")).toHaveLength(1);
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Finish reordering and return to task list")!);
    expect(root.findAll((node) => String(node.type) === "Modal")).toHaveLength(0);
    expect(pressables(root).find((node) => node.props.accessibilityLabel === "Reorder tasks in current category")).toBeTruthy();
  });

  it("renders child tasks directly after their parent with an explicit nested sub-category treatment", async () => {
    api.getDashboard.mockResolvedValue({
      ...dashboard,
      tasks: [
        { ...dashboard.tasks[0], id: 9, text: "Parent task", sortOrder: 1 },
        { ...dashboard.tasks[0], id: 10, parentId: 9, text: "Nested child", sortOrder: 0 },
        { ...dashboard.tasks[0], id: 8, text: "First root", sortOrder: 0 },
      ],
    });
    let renderer: ReactTestRenderer;
    await act(async () => { renderer = create(<App />); await Promise.resolve(); });
    const root = renderer!.root;
    const textNodes = root.findAll((node) => String(node.type) === "Text");
    const renderedText = textNodes.map((node) => node.children.join(""));

    expect(renderedText.indexOf("Parent task")).toBeLessThan(renderedText.indexOf("↳ Sub-category of Parent task"));
    expect(renderedText).toContain("Nested child");
    const nestedCard = root.findAll((node) => String(node.type) === "View" && Array.isArray(node.props.style) && node.props.style.some((entry: any) => entry?.borderLeftWidth === 4));
    expect(nestedCard).toHaveLength(1);
    expect(nestedCard[0]?.props.style).toContainEqual(expect.objectContaining({ marginLeft: 16 }));
  });

  it("selects multiple tasks and moves them together to a category or valid parent", async () => {
    api.getDashboard.mockResolvedValue({
      ...dashboard,
      categories: [...dashboard.categories, { id: 2, name: "Planning", kind: "normal", colorIndex: 1, sortOrder: 1 }],
      tasks: [
        { ...dashboard.tasks[0], id: 9, text: "Parent task", sortOrder: 0 },
        { ...dashboard.tasks[0], id: 10, text: "First selected", sortOrder: 1 },
        { ...dashboard.tasks[0], id: 11, text: "Second selected", sortOrder: 2 },
      ],
    });
    let renderer: ReactTestRenderer;
    await act(async () => { renderer = create(<App />); await Promise.resolve(); });
    const root = renderer!.root;

    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Select multiple tasks")!);
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Select First selected")!);
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Select Second selected")!);
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Move selected tasks")!);
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Move selected tasks to Planning")!);
    expect(api.reorderTasksRemote).toHaveBeenCalledWith([
      { id: 9, categoryId: 1, parentId: null, sortOrder: 0 },
      { id: 10, categoryId: 2, parentId: null, sortOrder: 0 },
      { id: 11, categoryId: 2, parentId: null, sortOrder: 1 },
    ]);

    api.reorderTasksRemote.mockClear();
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Select multiple tasks")!);
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Select First selected")!);
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Select Second selected")!);
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Move selected tasks")!);
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Move selected tasks under Parent task")!);
    expect(api.reorderTasksRemote).toHaveBeenCalledWith([
      { id: 9, categoryId: 1, parentId: null, sortOrder: 0 },
      { id: 10, categoryId: 1, parentId: 9, sortOrder: 0 },
      { id: 11, categoryId: 1, parentId: 9, sortOrder: 1 },
    ]);
  });

  it("confirms swipe and bulk task deletion, including nested sub-categories, before removing items", async () => {
    api.getDashboard.mockResolvedValue({
      ...dashboard,
      tasks: [
        { ...dashboard.tasks[0], id: 9, text: "Parent task", sortOrder: 0 },
        { ...dashboard.tasks[0], id: 10, text: "Standalone task", sortOrder: 1 },
        { ...dashboard.tasks[0], id: 11, parentId: 9, text: "Nested sub-category", sortOrder: 0 },
      ],
    });
    let renderer: ReactTestRenderer;
    await act(async () => { renderer = create(<App />); await Promise.resolve(); });
    const root = renderer!.root;

    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Swipe delete Parent task")!);
    expect(alertMock).toHaveBeenLastCalledWith("Delete task?", expect.stringContaining("2 items"), expect.any(Array));
    const swipeDeleteButtons = alertMock.mock.calls.at(-1)?.[2] as Array<{ onPress?: () => void }>;
    await act(async () => { swipeDeleteButtons[1]?.onPress?.(); await Promise.resolve(); });
    expect(api.deleteTaskRemote).toHaveBeenCalledWith(9);

    api.deleteTaskRemote.mockClear();
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Select multiple tasks")!);
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Select Parent task")!);
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Select Standalone task")!);
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Delete selected tasks")!);
    expect(alertMock).toHaveBeenLastCalledWith("Delete selected tasks?", expect.stringContaining("3 items"), expect.any(Array));
    const bulkDeleteButtons = alertMock.mock.calls.at(-1)?.[2] as Array<{ onPress?: () => void }>;
    await act(async () => { bulkDeleteButtons[1]?.onPress?.(); await Promise.resolve(); });
    expect(api.deleteTaskRemote).toHaveBeenCalledTimes(2);
    expect(api.deleteTaskRemote).toHaveBeenNthCalledWith(1, 9);
    expect(api.deleteTaskRemote).toHaveBeenNthCalledWith(2, 10);

    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Add item")!);
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Manage categories")!);
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Delete category URGENT")!);
    expect(alertMock).toHaveBeenLastCalledWith("Delete category and its tasks?", expect.stringContaining("3 tasks"), expect.any(Array));
  });

  it("removes a deleted category immediately after the shared dashboard confirms it, and restores it on failure", async () => {
    const withoutUrgent = { ...dashboard, categories: [], tasks: [] };
    api.getDashboard.mockReset().mockResolvedValueOnce(dashboard).mockResolvedValueOnce(withoutUrgent);
    let renderer: ReactTestRenderer;
    await act(async () => { renderer = create(<App />); await Promise.resolve(); });
    const root = renderer!.root;

    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Add item")!);
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Manage categories")!);
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Delete category URGENT")!);
    const successButtons = alertMock.mock.calls.at(-1)?.[2] as Array<{ onPress?: () => void }>;
    await act(async () => { successButtons[1]?.onPress?.(); await Promise.resolve(); });
    expect(api.deleteCategoryRemote).toHaveBeenCalledWith(1);
    expect(root.findAll((node) => String(node.type) === "Text" && node.children.includes("URGENT"))).toHaveLength(0);

    api.getDashboard.mockReset().mockResolvedValue(dashboard);
    api.deleteCategoryRemote.mockRejectedValueOnce(new Error("Network unavailable"));
    let failureRenderer: ReactTestRenderer;
    await act(async () => { failureRenderer = create(<App />); await Promise.resolve(); });
    const failureRoot = failureRenderer!.root;
    await tap(pressables(failureRoot).find((node) => node.props.accessibilityLabel === "Add item")!);
    await tap(pressables(failureRoot).find((node) => node.props.accessibilityLabel === "Manage categories")!);
    await tap(pressables(failureRoot).find((node) => node.props.accessibilityLabel === "Delete category URGENT")!);
    const failureButtons = alertMock.mock.calls.at(-1)?.[2] as Array<{ onPress?: () => void }>;
    await act(async () => { failureButtons[1]?.onPress?.(); await Promise.resolve(); });
    expect(alertMock).toHaveBeenLastCalledWith("Could not delete category", "Network unavailable");
  });
});

import React from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const alertMock = vi.hoisted(() => vi.fn());
const linking = vi.hoisted(() => ({ canOpenURL: vi.fn(), openURL: vi.fn() }));
const keyboard = vi.hoisted(() => ({ dismiss: vi.fn() }));
const dimensions = vi.hoisted(() => ({ width: 375, height: 812 }));
const appState = vi.hoisted(() => {
  let listener: ((state: string) => void) | null = null;
  return {
    currentState: "active",
    addEventListener: vi.fn((_event: string, callback: (state: string) => void) => {
      listener = callback;
      return { remove: vi.fn(() => { listener = null; }) };
    }),
    emit: (state: string) => listener?.(state),
    reset: () => { listener = null; },
  };
});
const netInfo = vi.hoisted(() => {
  let listener: ((state: { isConnected: boolean; isInternetReachable: boolean | null }) => void) | null = null;
  return {
    fetch: vi.fn(),
    addEventListener: vi.fn((callback: (state: { isConnected: boolean; isInternetReachable: boolean | null }) => void) => {
      listener = callback;
      return () => { listener = null; };
    }),
    emit: (state: { isConnected: boolean; isInternetReachable: boolean | null }) => listener?.(state),
    reset: () => { listener = null; },
  };
});
const api = vi.hoisted(() => ({
  getDashboard: vi.fn(), patchTask: vi.fn(), createTaskRemote: vi.fn(), deleteTaskRemote: vi.fn(),
  createCategoryRemote: vi.fn(), createDirectReportRemote: vi.fn(), updateCategoryRemote: vi.fn(),
  deleteCategoryRemote: vi.fn(), reorderCategoriesRemote: vi.fn(), updateDirectReportRemote: vi.fn(),
  deleteDirectReportRemote: vi.fn(), reorderTasksRemote: vi.fn(),
}));

vi.mock("./api", () => api);
vi.mock("@react-native-community/netinfo", () => ({ default: netInfo }));
vi.mock("expo-haptics", () => ({ ImpactFeedbackStyle: { Light: "light" }, impactAsync: vi.fn() }));
vi.mock("expo-status-bar", () => ({ StatusBar: () => null }));
vi.mock("@react-native-community/datetimepicker", async () => {
  const ReactModule = await import("react");
  return { default: (props: any) => ReactModule.createElement("DateTimePicker", props) };
});
vi.mock("react-native-gesture-handler", async () => {
  const ReactModule = await import("react");
  return {
    GestureHandlerRootView: ({ children, ...props }: any) => ReactModule.createElement("GestureHandlerRootView", props, children),
    Swipeable: ({ children, renderRightActions, ...props }: any) => ReactModule.createElement("Swipeable", props, children, renderRightActions?.()),
  };
});
vi.mock("react-native-draggable-flatlist", async () => {
  const ReactModule = await import("react");
  return {
    default: ({ data, renderItem, ListEmptyComponent, ...props }: any) => ReactModule.createElement(
      "DraggableFlatList",
      props,
      data.length ? data.map((item: any, index: number) => renderItem({ item, index, drag: vi.fn(), isActive: false })) : ListEmptyComponent,
    ),
  };
});
vi.mock("react-native", async () => {
  const ReactModule = await import("react");
  const stub = (name: string) => ({ children, ...props }: any) => ReactModule.createElement(name, props, children);
  return {
    ActivityIndicator: stub("ActivityIndicator"),
    Alert: { alert: alertMock },
    AppState: appState,
    FlatList: ({ data, renderItem, ListEmptyComponent, ...props }: any) => ReactModule.createElement("FlatList", props, data.length ? data.map((item: any, index: number) => renderItem({ item, index })) : ListEmptyComponent),
    Keyboard: keyboard,
    KeyboardAvoidingView: stub("KeyboardAvoidingView"),
    Linking: linking,
    Modal: ({ visible, children }: any) => visible ? ReactModule.createElement("Modal", null, children) : null,
    Platform: { OS: "ios" },
    Pressable: stub("Pressable"),
    RefreshControl: stub("RefreshControl"),
    SafeAreaView: stub("SafeAreaView"),
    ScrollView: stub("ScrollView"),
    StyleSheet: { create: (styles: any) => styles },
    Text: stub("Text"),
    TextInput: stub("TextInput"),
    View: stub("View"),
    useWindowDimensions: () => ({ width: dimensions.width, height: dimensions.height, scale: 1, fontScale: 1 }),
  };
});

import App from "../App";
import AsyncStorage from "@react-native-async-storage/async-storage";

const online = { isConnected: true, isInternetReachable: true };
const offline = { isConnected: false, isInternetReachable: false };
const dashboard = {
  categories: [
    { id: 1, name: "URGENT", kind: "urgent" as const, colorIndex: 0, sortOrder: 0 },
    { id: 2, name: "Planning", kind: "normal" as const, colorIndex: 1, sortOrder: 1 },
  ],
  tasks: [
    { id: 9, categoryId: 1, parentId: null, text: "Prepare brief", note: "Existing note", done: false, sortOrder: 0, dueAt: null, priority: "medium" as const, recurrence: "none" as const, accountableDirectReportId: null },
  ],
  directReports: [{ id: 4, name: "Ava", sortOrder: 0 }],
  syncedAt: 1,
};

const pressables = (root: ReactTestInstance) => root.findAll((node) => String(node.type) === "Pressable");
const button = (root: ReactTestInstance, label: string) => {
  const instance = pressables(root).find((node) => node.props.accessibilityLabel === label);
  expect(instance, `Expected visible control “${label}”`).toBeTruthy();
  return instance!;
};
const textInput = (root: ReactTestInstance, label: string) => {
  const instance = root.findAll((node) => String(node.type) === "TextInput").find((node) => node.props.accessibilityLabel === label);
  expect(instance, `Expected input “${label}”`).toBeTruthy();
  return instance!;
};
const containsText = (root: ReactTestInstance, value: string) => root.findAll((node) => String(node.type) === "Text" && node.children.join("") === value).length > 0;
const tap = async (instance: ReactTestInstance) => act(async () => { instance.props.onPress?.(); await Promise.resolve(); });
const settle = async () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); await Promise.resolve(); });

async function mountApp() {
  let renderer: ReactTestRenderer;
  await act(async () => { renderer = create(<App />); });
  await settle();
  return renderer!;
}

describe("redesigned iOS companion interactions", () => {
  const mounted: ReactTestRenderer[] = [];

  beforeEach(async () => {
    dimensions.width = 375;
    dimensions.height = 812;
    netInfo.reset();
    appState.reset();
    netInfo.fetch.mockReset().mockResolvedValue(online);
    netInfo.addEventListener.mockClear();
    api.getDashboard.mockReset().mockResolvedValue(dashboard);
    api.patchTask.mockReset().mockResolvedValue({ success: true });
    api.createTaskRemote.mockReset().mockResolvedValue({ id: 10 });
    api.deleteTaskRemote.mockReset().mockResolvedValue({ success: true });
    api.createCategoryRemote.mockReset().mockResolvedValue({ id: 3 });
    api.createDirectReportRemote.mockReset().mockResolvedValue({ id: 5 });
    api.updateCategoryRemote.mockReset().mockResolvedValue({ success: true });
    api.deleteCategoryRemote.mockReset().mockResolvedValue({ success: true });
    api.reorderCategoriesRemote.mockReset().mockResolvedValue({ success: true });
    api.updateDirectReportRemote.mockReset().mockResolvedValue({ success: true });
    api.deleteDirectReportRemote.mockReset().mockResolvedValue({ success: true });
    api.reorderTasksRemote.mockReset().mockResolvedValue({ success: true });
    linking.canOpenURL.mockReset().mockResolvedValue(true);
    linking.openURL.mockReset().mockResolvedValue(undefined);
    keyboard.dismiss.mockReset();
    alertMock.mockReset();
    await (AsyncStorage as any).clear();
  });

  afterEach(async () => {
    await act(async () => { mounted.splice(0).forEach((renderer) => renderer.unmount()); });
    dimensions.width = 375;
    dimensions.height = 812;
    netInfo.reset();
    appState.reset();
  });

  it("shows no-cache offline recovery and loads the workspace when connectivity returns", async () => {
    netInfo.fetch.mockResolvedValue(offline);
    const renderer = await mountApp();
    mounted.push(renderer);
    const root = renderer.root;

    expect(containsText(root, "No offline workspace yet")).toBe(true);
    expect(button(root, "Retry loading workspace")).toBeTruthy();
    expect(api.getDashboard).not.toHaveBeenCalled();

    await act(async () => { netInfo.emit(online); });
    await settle();

    expect(api.getDashboard).toHaveBeenCalledTimes(1);
    expect(button(root, "Open Prepare brief")).toBeTruthy();
    expect(containsText(root, "Synced")).toBe(true);
  });

  it("edits an existing task schedule and replays sparse date and recurrence patches on reconnect", async () => {
    const renderer = await mountApp();
    mounted.push(renderer);
    const root = renderer.root;
    const dueDate = new Date(2026, 8, 15);

    await act(async () => { netInfo.emit(offline); });
    await tap(button(root, "Change priority for Prepare brief"));
    await tap(button(root, "Choose due date for Prepare brief"));
    const picker = root.findAll((node) => String(node.type) === "DateTimePicker")[0]!;
    await act(async () => { picker.props.onChange({}, dueDate); });
    await settle();
    await tap(button(root, "Set repeat weekly for Prepare brief"));
    await settle();

    const queued = JSON.parse(await (AsyncStorage as any).getItem("stephens-todo.mutations.v1"));
    expect(queued.map((entry: any) => ({ type: entry.type, taskId: entry.taskId, patch: entry.patch }))).toEqual([
      { type: "patch", taskId: 9, patch: { dueAt: new Date(2026, 8, 15).getTime() } },
      { type: "patch", taskId: 9, patch: { recurrence: "weekly" } },
    ]);
    expect(api.patchTask).not.toHaveBeenCalled();

    await act(async () => { netInfo.emit(online); });
    await settle();

    expect(api.patchTask).toHaveBeenNthCalledWith(1, 9, { dueAt: new Date(2026, 8, 15).getTime() });
    expect(api.patchTask).toHaveBeenNthCalledWith(2, 9, { recurrence: "weekly" });
  });

  it("uses the iPhone Today focus and Top 3 flow instead of always-visible planning controls", async () => {
    api.getDashboard.mockResolvedValue({
      ...dashboard,
      tasks: [
        { ...dashboard.tasks[0], id: 9, text: "Due high", priority: "high", dueAt: new Date(2026, 8, 2).getTime(), sortOrder: 0 },
        { ...dashboard.tasks[0], id: 10, text: "Later high", priority: "high", dueAt: new Date(2026, 8, 3).getTime(), sortOrder: 1 },
        { ...dashboard.tasks[0], id: 11, text: "Medium work", priority: "medium", dueAt: null, sortOrder: 2 },
        { ...dashboard.tasks[0], id: 12, text: "Low backlog", priority: "low", dueAt: null, sortOrder: 3 },
      ],
    });
    const renderer = await mountApp();
    mounted.push(renderer);
    const root = renderer.root;

    expect(containsText(root, "Today")).toBe(true);
    expect(containsText(root, "Top 3")).toBe(true);
    expect(button(root, "Focus task Due high")).toBeTruthy();
    expect(button(root, "Focus task Later high")).toBeTruthy();
    expect(button(root, "Focus task Medium work")).toBeTruthy();
    expect(pressables(root).find((node) => node.props.accessibilityLabel === "Focus task Low backlog")).toBeUndefined();
    expect(button(root, "Open task filters")).toBeTruthy();

    await tap(button(root, "More workspace actions"));
    expect(containsText(root, "More")).toBe(true);
    expect(button(root, "Add task")).toBeTruthy();
    expect(button(root, "Compose corporate email")).toBeTruthy();
  });

  it("renders the regular-width iPad planning workspace and opens its inspector", async () => {
    dimensions.width = 1024;
    dimensions.height = 768;
    const renderer = await mountApp();
    mounted.push(renderer);
    const root = renderer.root;

    expect(containsText(root, "Plan")).toBe(true);
    expect(containsText(root, "CATEGORY SCOPE")).toBe(true);
    expect(containsText(root, "TASK INSPECTOR")).toBe(true);
    expect(containsText(root, "Select a task")).toBe(true);
    expect(button(root, "Filter by Planning")).toBeTruthy();

    await tap(button(root, "Open Prepare brief"));

    expect(containsText(root, "Schedule")).toBe(true);
    expect(button(root, "Choose due date for Prepare brief")).toBeTruthy();
    expect(button(root, "Reorder tasks in current category")).toBeTruthy();
  });

  it("clears task selection when a filter changes, keeping bulk actions from applying to a changed list", async () => {
    api.getDashboard.mockResolvedValue({
      ...dashboard,
      tasks: [
        { ...dashboard.tasks[0], id: 9, text: "High priority", priority: "high", sortOrder: 0 },
        { ...dashboard.tasks[0], id: 10, text: "Medium priority", priority: "medium", sortOrder: 1 },
      ],
    });
    const renderer = await mountApp();
    mounted.push(renderer);
    const root = renderer.root;

    await tap(button(root, "Select multiple tasks"));
    await tap(button(root, "Select Medium priority"));
    expect(button(root, "Deselect Medium priority")).toBeTruthy();
    expect(button(root, "Move selected tasks")).toBeTruthy();

    await tap(button(root, "Open task filters"));
    await tap(button(root, "Filter priority high"));
    await settle();

    expect(button(root, "Select multiple tasks")).toBeTruthy();
    expect(pressables(root).find((node) => node.props.accessibilityLabel === "Move selected tasks")).toBeUndefined();
    expect(pressables(root).find((node) => node.props.accessibilityLabel === "Deselect Medium priority")).toBeUndefined();
    expect(button(root, "Mark High priority complete")).toBeTruthy();
    expect(pressables(root).find((node) => node.props.accessibilityLabel === "Open Medium priority")).toBeUndefined();
  });

  it("creates a configured task through More and retains task setup fields", async () => {
    const renderer = await mountApp();
    mounted.push(renderer);
    const root = renderer.root;
    const dueDate = new Date(2026, 8, 15);

    await tap(button(root, "Add item"));
    await tap(button(root, "Add task"));
    await tap(button(root, "Set new task priority high"));
    await tap(button(root, "Assign Responsible Colleague Ava to new task"));
    await tap(button(root, "Set new task repeat weekly"));
    await tap(button(root, "Choose due date for new task"));
    const picker = root.findAll((node) => String(node.type) === "DateTimePicker")[0]!;
    await act(async () => { picker.props.onChange({}, dueDate); });
    await act(async () => { textInput(root, "Add task").props.onChangeText("Configured task"); });
    await tap(button(root, "Confirm add task"));
    await settle();

    expect(api.createTaskRemote).toHaveBeenCalledWith(expect.objectContaining({
      categoryId: 1,
      text: "Configured task",
      priority: "high",
      responsibleColleagueIds: [4],
      recurrence: "weekly",
      dueAt: new Date(2026, 8, 15).getTime(),
    }));
  });

  it("requires explicit review before handing a corporate email to the native mail client", async () => {
    const renderer = await mountApp();
    mounted.push(renderer);
    const root = renderer.root;

    await tap(button(root, "More workspace actions"));
    await tap(button(root, "Compose corporate email"));
    await act(async () => {
      textInput(root, "Corporate email recipients").props.onChangeText("colleague@example.com");
      textInput(root, "Corporate email subject").props.onChangeText("Project update");
      textInput(root, "Corporate email message").props.onChangeText("The task is complete.");
    });
    expect(linking.openURL).not.toHaveBeenCalled();

    await tap(button(root, "Review corporate email"));
    expect(root.findAll((node) => node.props.accessibilityLabel === "Corporate email review").length).toBeGreaterThan(0);
    expect(linking.openURL).not.toHaveBeenCalled();

    await tap(button(root, "Open email app to send"));
    expect(linking.openURL).toHaveBeenCalledWith(expect.stringContaining("mailto:colleague%40example.com?subject=Project%20update"));
  });
});

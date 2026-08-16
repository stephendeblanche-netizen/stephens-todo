import React from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ getDashboard: vi.fn(), patchTask: vi.fn(), addTask: vi.fn() }));
vi.mock("./api", () => api);
vi.mock("expo-haptics", () => ({ ImpactFeedbackStyle: { Light: "light" }, impactAsync: vi.fn() }));
vi.mock("expo-status-bar", () => ({ StatusBar: () => null }));
vi.mock("react-native", async () => {
  const ReactModule = await import("react");
  const stub = (name: string) => ({ children, ...props }: any) => ReactModule.createElement(name, props, children);
  return {
    ActivityIndicator: stub("ActivityIndicator"), Alert: { alert: vi.fn() }, FlatList: ({ data, renderItem, ListEmptyComponent, ...props }: any) => ReactModule.createElement("FlatList", props, data.length ? data.map((item: any, index: number) => renderItem({ item, index })) : ListEmptyComponent),
    Modal: ({ visible, children }: any) => visible ? ReactModule.createElement("Modal", null, children) : null,
    Platform: { OS: "ios" }, Pressable: stub("Pressable"), RefreshControl: stub("RefreshControl"), SafeAreaView: stub("SafeAreaView"), StyleSheet: { create: (styles: any) => styles }, Text: stub("Text"), TextInput: stub("TextInput"), View: stub("View"),
  };
});

import App from "../App";

const dashboard = {
  categories: [{ id: 1, name: "URGENT", kind: "urgent" as const, colorIndex: 0, sortOrder: 0 }],
  tasks: [{ id: 9, categoryId: 1, parentId: null, text: "Prepare brief", note: "Existing note", done: false, sortOrder: 0, dueAt: null, priority: "medium" as const, recurrence: "none" as const, accountableDirectReportId: null }],
  directReports: [], syncedAt: 1,
};

const pressables = (root: ReactTestInstance) => root.findAll((node) => String(node.type) === "Pressable");
const tap = async (instance: ReactTestInstance) => act(async () => { instance.props.onPress?.(); await Promise.resolve(); });

describe("restored iOS companion interactions", () => {
  beforeEach(() => {
    api.getDashboard.mockReset().mockResolvedValue(dashboard);
    api.patchTask.mockReset().mockResolvedValue({ success: true });
    api.addTask.mockReset().mockResolvedValue({ id: 10 });
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

    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Add task")!);
    expect(root.findAll((node) => String(node.type) === "Modal")).toHaveLength(1);

    const newTaskInput = root.findAll((node) => String(node.type) === "TextInput" && node.props.placeholder === "What needs doing?")[0]!;
    await act(async () => { newTaskInput.props.onChangeText("Create from iPhone"); });
    await tap(pressables(root).find((node) => node.props.accessibilityLabel === "Confirm add task")!);
    expect(api.addTask).toHaveBeenCalledWith(1, "Create from iPhone");
    expect(api.getDashboard.mock.calls.length).toBeGreaterThan(1);
  });
});

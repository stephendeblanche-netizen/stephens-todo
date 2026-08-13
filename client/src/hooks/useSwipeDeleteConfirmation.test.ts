// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSwipeDeleteConfirmation } from "./useSwipeDeleteConfirmation";

describe("useSwipeDeleteConfirmation", () => {
  beforeEach(() => window.localStorage.clear());

  it("opens a confirmation flow when the persisted preference is enabled", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSwipeDeleteConfirmation(onDelete));

    act(() => result.current.requestSwipeDelete(7, "Call supplier"));
    expect(result.current.pendingSwipeDelete).toEqual({ id: 7, text: "Call supplier" });
    expect(onDelete).not.toHaveBeenCalled();

    act(() => result.current.confirmPendingSwipeDelete());
    expect(onDelete).toHaveBeenCalledWith(7, "Call supplier");
    expect(result.current.pendingSwipeDelete).toBeNull();
  });

  it("bypasses the prompt when the user disables confirmation and persists that preference", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSwipeDeleteConfirmation(onDelete));

    act(() => result.current.setConfirmSwipeDelete(false));
    expect(window.localStorage.getItem("stephen-todo.confirm-swipe-delete")).toBe("false");

    act(() => result.current.requestSwipeDelete(8, "Send proposal"));
    expect(onDelete).toHaveBeenCalledWith(8, "Send proposal");
    expect(result.current.pendingSwipeDelete).toBeNull();
  });

  it("reads the persisted confirmation preference for a later session", () => {
    window.localStorage.setItem("stephen-todo.confirm-swipe-delete", "false");
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSwipeDeleteConfirmation(onDelete));

    expect(result.current.confirmSwipeDelete).toBe(false);
  });
});

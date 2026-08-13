import { describe, expect, it } from "vitest";
import {
  canStartMobileSwipe,
  clampSwipeOffset,
  MOBILE_SWIPE_DELETE_THRESHOLD,
  MOBILE_SWIPE_DELETE_WIDTH,
  settleSwipeOffset,
  shouldRevealSwipeDelete,
} from "./swipe";

describe("mobile swipe-to-delete", () => {
  it("only permits a left swipe inside the delete action width", () => {
    expect(clampSwipeOffset(-500)).toBe(-MOBILE_SWIPE_DELETE_WIDTH);
    expect(clampSwipeOffset(-36)).toBe(-36);
    expect(clampSwipeOffset(24)).toBe(0);
  });

  it("reveals delete only after a deliberate half-width left swipe", () => {
    expect(shouldRevealSwipeDelete(-MOBILE_SWIPE_DELETE_THRESHOLD + 1)).toBe(false);
    expect(shouldRevealSwipeDelete(-MOBILE_SWIPE_DELETE_THRESHOLD)).toBe(true);
    expect(shouldRevealSwipeDelete(-MOBILE_SWIPE_DELETE_WIDTH)).toBe(true);
  });

  it("settles the row open only after the reveal threshold", () => {
    expect(settleSwipeOffset(-MOBILE_SWIPE_DELETE_THRESHOLD + 1)).toBe(0);
    expect(settleSwipeOffset(-MOBILE_SWIPE_DELETE_THRESHOLD)).toBe(-MOBILE_SWIPE_DELETE_WIDTH);
  });

  it("only starts on a touch gesture outside protected controls and drag handles", () => {
    const unprotected = { closest: () => null } as unknown as EventTarget;
    const protectedControl = { closest: () => ({}) } as unknown as EventTarget;

    expect(canStartMobileSwipe("touch", false, unprotected)).toBe(true);
    expect(canStartMobileSwipe("mouse", false, unprotected)).toBe(false);
    expect(canStartMobileSwipe("touch", true, unprotected)).toBe(false);
    expect(canStartMobileSwipe("touch", false, protectedControl)).toBe(false);
  });
});

export const MOBILE_SWIPE_DELETE_WIDTH = 96;
export const MOBILE_SWIPE_DELETE_THRESHOLD = MOBILE_SWIPE_DELETE_WIDTH / 2;

export function clampSwipeOffset(offset: number): number {
  return Math.max(-MOBILE_SWIPE_DELETE_WIDTH, Math.min(0, offset));
}

export function shouldRevealSwipeDelete(offset: number): boolean {
  return offset <= -MOBILE_SWIPE_DELETE_THRESHOLD;
}

export function canStartMobileSwipe(
  pointerType: string,
  isDragOverlay: boolean,
  target: EventTarget | null,
): boolean {
  if (isDragOverlay || pointerType !== "touch") return false;
  const element = target as { closest?: (selector: string) => Element | null } | null;
  if (!element?.closest) return false;
  return !element.closest("button, input, textarea, [data-drag-handle], [data-no-swipe]");
}

export function settleSwipeOffset(offset: number): number {
  return shouldRevealSwipeDelete(offset) ? -MOBILE_SWIPE_DELETE_WIDTH : 0;
}

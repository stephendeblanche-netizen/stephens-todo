import { useCallback, useState } from "react";
import { resolveSwipeDeletion } from "@/lib/swipe";

export type PendingSwipeDeletion = { id: number; text: string };

const PREFERENCE_KEY = "stephen-todo.confirm-swipe-delete";

function initialConfirmationPreference(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(PREFERENCE_KEY) !== "false";
}

export function useSwipeDeleteConfirmation(
  onDelete: (id: number, text: string) => void,
) {
  const [confirmSwipeDelete, setConfirmSwipeDeleteState] = useState(initialConfirmationPreference);
  const [pendingSwipeDelete, setPendingSwipeDelete] = useState<PendingSwipeDeletion | null>(null);

  const setConfirmSwipeDelete = useCallback((enabled: boolean) => {
    setConfirmSwipeDeleteState(enabled);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(PREFERENCE_KEY, String(enabled));
    }
  }, []);

  const requestSwipeDelete = useCallback((id: number, text: string) => {
    if (resolveSwipeDeletion(confirmSwipeDelete) === "confirm") {
      setPendingSwipeDelete({ id, text });
      return;
    }
    onDelete(id, text);
  }, [confirmSwipeDelete, onDelete]);

  const confirmPendingSwipeDelete = useCallback(() => {
    if (!pendingSwipeDelete) return;
    onDelete(pendingSwipeDelete.id, pendingSwipeDelete.text);
    setPendingSwipeDelete(null);
  }, [pendingSwipeDelete, onDelete]);

  const clearPendingSwipeDelete = useCallback(() => {
    setPendingSwipeDelete(null);
  }, []);

  return {
    confirmSwipeDelete,
    pendingSwipeDelete,
    setConfirmSwipeDelete,
    requestSwipeDelete,
    confirmPendingSwipeDelete,
    clearPendingSwipeDelete,
  };
}

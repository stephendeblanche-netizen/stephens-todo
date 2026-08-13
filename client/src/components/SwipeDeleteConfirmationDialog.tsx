import React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { PendingSwipeDeletion } from "@/hooks/useSwipeDeleteConfirmation";

interface SwipeDeleteConfirmationDialogProps {
  pendingDeletion: PendingSwipeDeletion | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SwipeDeleteConfirmationDialog({
  pendingDeletion,
  onConfirm,
  onCancel,
}: SwipeDeleteConfirmationDialogProps) {
  return (
    <AlertDialog
      open={pendingDeletion !== null}
      onOpenChange={(open) => { if (!open) onCancel(); }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this task?</AlertDialogTitle>
          <AlertDialogDescription>
            {pendingDeletion
              ? `“${pendingDeletion.text}” will be removed. You can still restore it from the Undo notification.`
              : "This task will be removed."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep task</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 text-white hover:bg-red-700"
            onClick={onConfirm}
          >
            Delete task
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

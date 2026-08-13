// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SwipeDeleteConfirmationDialog } from "./SwipeDeleteConfirmationDialog";

describe("SwipeDeleteConfirmationDialog", () => {
  it("displays the task and confirms deletion when requested", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <SwipeDeleteConfirmationDialog
        pendingDeletion={{ id: 3, text: "Review the contract" }}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByRole("alertdialog")).not.toBeNull();
    expect(screen.getByText(/Review the contract/)).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Delete task" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("cancels without confirming when the user keeps the task", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <SwipeDeleteConfirmationDialog
        pendingDeletion={{ id: 4, text: "Prepare briefing" }}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Keep task" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });
});

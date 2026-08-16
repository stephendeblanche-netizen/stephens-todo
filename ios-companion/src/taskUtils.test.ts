import { describe, expect, it } from "vitest";
import { dueText, priorityColor, taskMatchesPriority } from "./taskUtils";

describe("iOS companion task helpers", () => {
  it("filters priority and formats lightweight task metadata", () => {
    const task = { priority: "high" } as any;
    expect(taskMatchesPriority(task, "high")).toBe(true);
    expect(taskMatchesPriority(task, "low")).toBe(false);
    expect(dueText(null)).toBe("No due date");
    expect(priorityColor("low")).toBe("#248A50");
  });
});

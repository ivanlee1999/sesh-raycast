import { describe, it, expect } from "vitest";

/**
 * Type-level tests: these verify that our TypeScript interfaces
 * match the expected shape of server responses.
 *
 * If the interfaces change in a breaking way, these will fail at
 * compile time (via tsc) or at the assertion level below.
 */

import type {
  TimerState,
  Category,
  Session,
  Analytics,
  AnalyticsDay,
} from "../types";

describe("TimerState interface", () => {
  it("matches expected server response fields", () => {
    const timer: TimerState = {
      phase: "running",
      sessionType: "focus",
      intention: "Write tests",
      category: "development",
      targetMs: 1_500_000,
      remainingMs: 1_200_000,
      overflowMs: 0,
      startedAt: 1_711_800_000_000,
      pausedAt: null,
      updatedAt: 1_711_800_000_000,
      todoistTaskId: null,
    };

    // Verify all numeric fields are numbers
    expect(typeof timer.targetMs).toBe("number");
    expect(typeof timer.remainingMs).toBe("number");
    expect(typeof timer.overflowMs).toBe("number");
    expect(typeof timer.updatedAt).toBe("number");

    // Verify nullable timestamp fields
    expect(timer.pausedAt).toBeNull();
    expect(typeof timer.startedAt).toBe("number");

    // Verify string fields
    expect(typeof timer.phase).toBe("string");
    expect(typeof timer.sessionType).toBe("string");
    expect(typeof timer.intention).toBe("string");
    expect(typeof timer.category).toBe("string");
  });

  it("uses epoch ms for timestamps, not ISO strings", () => {
    const timer: TimerState = {
      phase: "running",
      sessionType: "focus",
      intention: "",
      category: "",
      targetMs: 1_500_000,
      remainingMs: 1_500_000,
      overflowMs: 0,
      startedAt: 1_711_800_000_000,
      pausedAt: null,
      updatedAt: 1_711_800_000_000,
      todoistTaskId: null,
    };

    // startedAt should be a large epoch number, not a date string
    expect(timer.startedAt).toBeGreaterThan(1_000_000_000_000);
    // ms values should be in the millisecond range, not seconds
    expect(timer.targetMs).toBeGreaterThan(999);
  });
});

describe("AnalyticsDay interface", () => {
  it("uses 'label' and 'ms' fields (not 'date' and 'totalMs')", () => {
    const day: AnalyticsDay = {
      label: "Mon",
      ms: 3_600_000,
    };

    expect(day).toHaveProperty("label");
    expect(day).toHaveProperty("ms");
    expect(typeof day.label).toBe("string");
    expect(typeof day.ms).toBe("number");

    // Ensure old field names don't exist
    expect(day).not.toHaveProperty("date");
    expect(day).not.toHaveProperty("totalMs");
  });
});

describe("Analytics interface", () => {
  it("has expected top-level fields", () => {
    const analytics: Analytics = {
      todayMs: 3_600_000,
      todayCount: 3,
      streak: 5,
      days: [{ label: "Mon", ms: 1_800_000 }],
    };

    expect(typeof analytics.todayMs).toBe("number");
    expect(typeof analytics.todayCount).toBe("number");
    expect(typeof analytics.streak).toBe("number");
    expect(Array.isArray(analytics.days)).toBe(true);
    expect(analytics.days[0]).toHaveProperty("label");
    expect(analytics.days[0]).toHaveProperty("ms");
  });
});

describe("Category interface", () => {
  it("has expected fields", () => {
    const cat: Category = {
      id: "cat-1",
      name: "development",
      label: "Development",
      color: "#3B82F6",
      sortOrder: 1,
      isDefault: true,
    };

    expect(typeof cat.id).toBe("string");
    expect(typeof cat.name).toBe("string");
    expect(typeof cat.label).toBe("string");
    expect(typeof cat.color).toBe("string");
    expect(typeof cat.sortOrder).toBe("number");
    expect(typeof cat.isDefault).toBe("boolean");
  });
});

describe("Session interface", () => {
  it("has expected fields with correct types", () => {
    const session: Session = {
      id: "sess-1",
      intention: "Write tests",
      category: "development",
      type: "focus",
      targetMs: 1_500_000,
      actualMs: 1_400_000,
      overflowMs: 0,
      startedAt: 1_711_800_000_000,
      endedAt: 1_711_801_500_000,
      notes: "",
    };

    expect(typeof session.id).toBe("string");
    expect(typeof session.targetMs).toBe("number");
    expect(typeof session.actualMs).toBe("number");
    expect(typeof session.startedAt).toBe("number");
    expect(typeof session.endedAt).toBe("number");
  });
});

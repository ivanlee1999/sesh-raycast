import { describe, expect, it } from "vitest";

import {
  categoryLabel,
  defaultCategoryName,
  durationForTasks,
  estimateMinutes,
  groupTasks,
  intentionForTasks,
  sortTasks,
  taskCategory,
  taskGroup,
  taskRefsFor,
} from "../task-view";
import type { Category, ExternalTask } from "../types";

function makeTask(overrides: Partial<ExternalTask> = {}): ExternalTask {
  return {
    id: "1",
    provider: "todoist",
    content: "A task",
    duration: null,
    labels: [],
    priority: 4,
    ...overrides,
  };
}

const CATEGORIES: Category[] = [
  {
    id: "a",
    name: "development",
    label: "Development",
    color: "#123456",
    sortOrder: 0,
    isDefault: false,
  },
  {
    id: "b",
    name: "writing",
    label: "Writing",
    color: "#654321",
    sortOrder: 1,
    isDefault: true,
  },
];

describe("estimateMinutes", () => {
  it("reads a task's own estimate", () => {
    expect(
      estimateMinutes(makeTask({ duration: { amount: 45, unit: "minute" } })),
    ).toBe(45);
  });

  it("returns null when it carries none — Things has no duration at all", () => {
    expect(estimateMinutes(makeTask())).toBeNull();
    expect(
      estimateMinutes(makeTask({ duration: { amount: 0, unit: "minute" } })),
    ).toBeNull();
  });
});

describe("durationForTasks", () => {
  it("takes its length from the lead task", () => {
    expect(
      durationForTasks(
        [makeTask({ duration: { amount: 45, unit: "minute" } })],
        25,
      ),
    ).toBe(45);
  });

  it("clamps to what a single sitting can be", () => {
    expect(
      durationForTasks(
        [makeTask({ duration: { amount: 240, unit: "minute" } })],
        25,
      ),
    ).toBe(60);
    expect(
      durationForTasks(
        [makeTask({ duration: { amount: 2, unit: "minute" } })],
        25,
      ),
    ).toBe(5);
  });

  it("falls back to the configured length when no estimate is offered", () => {
    expect(durationForTasks([makeTask()], 25)).toBe(25);
    expect(durationForTasks([], 50)).toBe(50);
  });
});

describe("taskCategory", () => {
  it("matches a category by name or by label, case-insensitively", () => {
    expect(
      taskCategory(makeTask({ category: "Development" }), CATEGORIES, ""),
    ).toBe("development");
    expect(
      taskCategory(makeTask({ labels: ["writing"] }), CATEGORIES, ""),
    ).toBe("writing");
  });

  it("prefers the task's own category over its labels", () => {
    const task = makeTask({ category: "writing", labels: ["development"] });
    expect(taskCategory(task, CATEGORIES, "")).toBe("writing");
  });

  it("leaves the current choice alone rather than re-filing the session", () => {
    expect(
      taskCategory(
        makeTask({ labels: ["errands"] }),
        CATEGORIES,
        "development",
      ),
    ).toBe("development");
  });
});

describe("intentionForTasks", () => {
  it("names every picked task on the one line that says what the session is for", () => {
    expect(
      intentionForTasks([
        makeTask({ content: "A" }),
        makeTask({ content: "B" }),
      ]),
    ).toBe("A · B");
  });
});

describe("taskRefsFor", () => {
  it("encodes each task the way sesh-web stores it", () => {
    const refs = taskRefsFor([
      makeTask({ id: "12345" }),
      makeTask({ id: "ABC", provider: "things" }),
    ]);
    expect(refs).toEqual(["12345", "things:ABC"]);
  });
});

describe("sortTasks", () => {
  it("puts what is due soonest first, then priority, then alphabetically", () => {
    const tasks = [
      makeTask({ id: "3", content: "Zebra", due: "today", priority: 1 }),
      makeTask({ id: "1", content: "Apple", due: "upcoming", priority: 1 }),
      makeTask({ id: "2", content: "Beta", due: "today", priority: 4 }),
    ];
    expect(sortTasks(tasks).map((task) => task.id)).toEqual(["3", "2", "1"]);
  });

  it("does not reorder its input", () => {
    const tasks = [
      makeTask({ id: "b", content: "B" }),
      makeTask({ id: "a", content: "A" }),
    ];
    sortTasks(tasks);
    expect(tasks.map((task) => task.id)).toEqual(["b", "a"]);
  });
});

describe("grouping", () => {
  it("heads a task with its project, then its area, then the app it came from", () => {
    expect(taskGroup(makeTask({ projectName: "Sesh", areaName: "Work" }))).toBe(
      "Sesh",
    );
    expect(taskGroup(makeTask({ areaName: "Work" }))).toBe("Work");
    expect(taskGroup(makeTask({ provider: "things" }))).toBe("Things");
    expect(taskGroup(makeTask())).toBe("Todoist");
  });

  it("collects tasks under one heading each", () => {
    const groups = groupTasks([
      makeTask({ id: "1", content: "A", projectName: "Sesh" }),
      makeTask({ id: "2", content: "B", projectName: "Other" }),
      makeTask({ id: "3", content: "C", projectName: "Sesh" }),
    ]);
    expect(groups.map((group) => group.title)).toEqual(["Sesh", "Other"]);
    expect(groups[0].items).toHaveLength(2);
  });
});

describe("categories", () => {
  it("picks the default category, falling back to the first", () => {
    expect(defaultCategoryName(CATEGORIES)).toBe("writing");
    expect(defaultCategoryName([CATEGORIES[0]])).toBe("development");
    expect(defaultCategoryName([])).toBe("");
  });

  it("shows a category's label, and its raw name when there is no match", () => {
    expect(categoryLabel(CATEGORIES, "writing")).toBe("Writing");
    expect(categoryLabel(CATEGORIES, "errands")).toBe("errands");
    expect(categoryLabel(CATEGORIES, null)).toBe("—");
  });
});

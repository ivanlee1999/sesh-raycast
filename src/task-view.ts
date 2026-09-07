import { encodeTaskRef } from "./task-ref";
import {
  resolveProvider,
  type Category,
  type ExternalTask,
  type TaskFilter,
} from "./types";

/**
 * How sesh-web turns a picked to-do into a session, kept here so Raycast starts
 * the same session the web app would from the same task.
 */

/** A task's own estimate in minutes, or null when it carries none. */
export function estimateMinutes(task: ExternalTask): number | null {
  const amount = task.duration?.amount;
  return typeof amount === "number" && Number.isFinite(amount) && amount > 0
    ? amount
    : null;
}

/**
 * A session length taken from the lead task's estimate, clamped to something a
 * single sitting can actually be.
 */
export function durationForTasks(
  tasks: ExternalTask[],
  fallbackMinutes: number,
): number {
  const lead = tasks[0] ? estimateMinutes(tasks[0]) : null;
  return lead === null ? fallbackMinutes : Math.min(60, Math.max(5, lead));
}

/**
 * Which sesh category a to-do belongs to. Its own category field wins, then any
 * label that names one; failing both, the caller's current choice stands rather
 * than the task silently re-filing the session.
 */
export function taskCategory(
  task: ExternalTask,
  categories: Category[],
  fallback: string,
): string {
  const candidates = [task.category, ...(task.labels ?? [])]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  for (const candidate of candidates) {
    const found = categories.find(
      (category) =>
        category.name.toLowerCase() === candidate ||
        category.label.toLowerCase() === candidate,
    );
    if (found) return found.name;
  }
  return fallback;
}

/** The one line that says what a session is for. */
export function intentionForTasks(tasks: ExternalTask[]): string {
  return tasks.map((task) => task.content).join(" · ");
}

export function taskRefsFor(tasks: ExternalTask[]): string[] {
  return tasks.map((task) => encodeTaskRef(resolveProvider(task), task.id));
}

export function defaultCategoryName(
  categories: Category[] | undefined,
): string {
  if (!categories || categories.length === 0) return "";
  return (categories.find((category) => category.isDefault) ?? categories[0])
    .name;
}

export function categoryLabel(
  categories: Category[] | undefined,
  name: string | null | undefined,
): string {
  if (!name) return "—";
  return categories?.find((category) => category.name === name)?.label || name;
}

/**
 * The list order: soonest first, then by priority, then alphabetically — so a
 * refresh cannot shuffle two equal tasks past each other.
 */
const DUE_ORDER: Record<string, number> = {
  today: 0,
  tomorrow: 1,
  upcoming: 2,
};

export function sortTasks(tasks: ExternalTask[]): ExternalTask[] {
  return [...tasks].sort((a, b) => {
    const dueA = DUE_ORDER[a.due ?? ""] ?? 3;
    const dueB = DUE_ORDER[b.due ?? ""] ?? 3;
    if (dueA !== dueB) return dueA - dueB;
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.content.localeCompare(b.content);
  });
}

/** The heading a task sits under: its project or area, falling back to its app. */
export function taskGroup(task: ExternalTask): string {
  return (
    task.projectName ||
    task.areaName ||
    (resolveProvider(task) === "things" ? "Things" : "Todoist")
  );
}

export function groupTasks(
  tasks: ExternalTask[],
): { title: string; items: ExternalTask[] }[] {
  const groups = new Map<string, ExternalTask[]>();
  for (const task of sortTasks(tasks)) {
    const key = taskGroup(task);
    const existing = groups.get(key);
    if (existing) existing.push(task);
    else groups.set(key, [task]);
  }
  return Array.from(groups.entries()).map(([title, items]) => ({
    title,
    items,
  }));
}

export const TASK_FILTERS: { value: TaskFilter; title: string }[] = [
  { value: "today", title: "Today" },
  { value: "upcoming", title: "Upcoming" },
  { value: "all", title: "All" },
];

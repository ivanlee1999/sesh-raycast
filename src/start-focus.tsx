import {
  Action,
  ActionPanel,
  Form,
  Icon,
  popToRoot,
  showToast,
  Toast,
} from "@raycast/api";
import { useEffect, useMemo, useState } from "react";
import {
  getTimer,
  putTimer,
  useCategories,
  useSettings,
  useTasks,
} from "./api";
import { encodeTaskRef, splitTaskRefs } from "./task-ref";
import { buildStartPayload } from "./timer-state";
import {
  defaultCategoryName,
  durationForTasks,
  estimateMinutes,
  intentionForTasks,
  sortTasks,
  taskCategory,
  taskGroup,
  taskRefsFor,
} from "./task-view";
import {
  PROVIDER_LABEL,
  resolveProvider,
  taskKey,
  type ExternalTask,
  type SessionType,
} from "./types";

const DURATION_OPTIONS = [5, 10, 15, 20, 25, 30, 45, 60, 90];

/**
 * The three cells the web app offers, over the two types the server stores: a
 * long break is a break with a longer target, not a type of its own.
 */
type TypeKey = "focus" | "short-break" | "long-break";

const TYPE_OPTIONS: { value: TypeKey; title: string }[] = [
  { value: "focus", title: "Focus" },
  { value: "short-break", title: "Short Break" },
  { value: "long-break", title: "Long Break" },
];

function serverType(key: TypeKey): SessionType {
  return key === "focus" ? "focus" : "break";
}

interface FormValues {
  intention: string;
  category: string;
  duration: string;
  sessionType: string;
  taskKeys: string[];
}

export default function StartFocus() {
  const { data: categories, isLoading: categoriesLoading } = useCategories();
  const { data: settings, isLoading: settingsLoading } = useSettings();
  const { data: taskData, isLoading: tasksLoading } = useTasks("today");

  const [typeKey, setTypeKey] = useState<TypeKey>("focus");
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [intention, setIntention] = useState("");
  const [category, setCategory] = useState("");
  const [duration, setDuration] = useState("");

  /*
   * Show the category the session will actually get. Leaving this blank would
   * be a lie: `PUT /api/timer` resolves an empty or unknown category to the
   * default one, so the session is filed somewhere either way.
   */
  useEffect(() => {
    if (category || !categories || categories.length === 0) return;
    setCategory(defaultCategoryName(categories));
  }, [categories, category]);

  const tasks = useMemo(() => sortTasks(taskData?.tasks ?? []), [taskData]);
  const byKey = useMemo(
    () => new Map(tasks.map((task) => [taskKey(task), task])),
    [tasks],
  );

  const picked = useMemo(
    () =>
      selectedKeys
        .map((key) => byKey.get(key))
        .filter((task): task is ExternalTask => Boolean(task)),
    [byKey, selectedKeys],
  );

  /**
   * The configured length for whichever cell is selected — the same numbers the
   * web app and the phone use, rather than a duration this extension invented.
   */
  const configuredMinutes =
    typeKey === "focus"
      ? (settings?.focusDuration ?? 25)
      : typeKey === "long-break"
        ? (settings?.longBreakDuration ?? 15)
        : (settings?.breakDuration ?? 5);

  const effectiveDuration = duration || String(configuredMinutes);
  const durationChoices = Array.from(
    new Set([...DURATION_OPTIONS, configuredMinutes]),
  ).sort((a, b) => a - b);

  /**
   * Picking a to-do sets up the whole session: it names it, it decides the
   * category, and its own estimate sets the length. Exactly what tapping one in
   * the web app does.
   */
  function applyTasks(keys: string[]) {
    setSelectedKeys(keys);
    const next = keys
      .map((key) => byKey.get(key))
      .filter((task): task is ExternalTask => Boolean(task));
    if (next.length === 0) return;
    setIntention(intentionForTasks(next));
    setCategory(taskCategory(next[0], categories ?? [], category));
    const lead = estimateMinutes(next[0]);
    if (lead !== null)
      setDuration(String(durationForTasks(next, configuredMinutes)));
  }

  async function handleSubmit(values: FormValues) {
    const key = (values.sessionType || "focus") as TypeKey;
    const minutes = parseInt(values.duration, 10) || configuredMinutes;
    const chosen = (values.taskKeys ?? [])
      .map((k) => byKey.get(k))
      .filter((task): task is ExternalTask => Boolean(task));

    try {
      await putTimer(
        buildStartPayload({
          sessionType: serverType(key),
          durationMinutes: minutes,
          intention:
            values.intention ||
            (chosen.length > 0 ? intentionForTasks(chosen) : ""),
          category: values.category,
          taskRefs: taskRefsFor(chosen),
        }),
      );
      await showToast({
        style: Toast.Style.Success,
        title: key === "focus" ? "Focus Started" : "Break Started",
        message: `${key === "focus" ? "⏱" : "☕"} ${minutes}m${values.intention ? ` — ${values.intention}` : ""}`,
      });
      await popToRoot();
    } catch {
      // The API layer has already raised a toast.
    }
  }

  /**
   * Pick up whatever the web app or the Tasks command last parked on the idle
   * timer, so a topic set on the phone is already filled in here.
   */
  async function pullCurrentTopic() {
    try {
      const timer = await getTimer();
      const refs = new Set(splitTaskRefs(timer.todoistTaskId));
      setIntention(timer.intention ?? "");
      if (timer.category) setCategory(timer.category);
      setSelectedKeys(
        tasks
          .filter((task) =>
            refs.has(encodeTaskRef(resolveProvider(task), task.id)),
          )
          .map(taskKey),
      );
      await showToast({
        style: Toast.Style.Success,
        title: "Pulled the current topic",
      });
    } catch {
      // The API layer has already raised a toast.
    }
  }

  const isLoading = categoriesLoading || settingsLoading || tasksLoading;

  return (
    <Form
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Start Session"
            icon={Icon.Play}
            onSubmit={handleSubmit}
          />
          <Action
            title="Use Current Topic"
            icon={Icon.Download}
            shortcut={{ modifiers: ["cmd"], key: "u" }}
            onAction={pullCurrentTopic}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="intention"
        title="Intention"
        placeholder="What will you focus on?"
        value={intention}
        onChange={setIntention}
      />

      <Form.TagPicker
        id="taskKeys"
        title="To-Dos"
        placeholder={
          tasks.length > 0
            ? "Link this session to a to-do"
            : "No to-dos due today"
        }
        value={selectedKeys}
        onChange={applyTasks}
      >
        {tasks.map((task) => (
          <Form.TagPicker.Item
            key={taskKey(task)}
            value={taskKey(task)}
            title={`${task.content} — ${taskGroup(task)}`}
            icon={Icon.Circle}
          />
        ))}
      </Form.TagPicker>

      {picked.length > 0 ? (
        <Form.Description
          title="Logging to"
          text={picked
            .map(
              (task) =>
                `${PROVIDER_LABEL[resolveProvider(task)]}: ${task.content}`,
            )
            .join("\n")}
        />
      ) : null}

      <Form.Dropdown
        id="category"
        title="Category"
        value={category}
        onChange={setCategory}
      >
        <Form.Dropdown.Item value="" title="None" />
        {(categories ?? [])
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((cat) => (
            <Form.Dropdown.Item
              key={cat.id}
              value={cat.name}
              title={cat.label || cat.name}
            />
          ))}
      </Form.Dropdown>

      <Form.Dropdown
        id="duration"
        title="Duration"
        value={effectiveDuration}
        onChange={setDuration}
      >
        {durationChoices.map((minutes) => (
          <Form.Dropdown.Item
            key={minutes}
            value={String(minutes)}
            title={
              minutes === configuredMinutes
                ? `${minutes} minutes (default)`
                : `${minutes} minutes`
            }
          />
        ))}
      </Form.Dropdown>

      <Form.Dropdown
        id="sessionType"
        title="Session Type"
        value={typeKey}
        onChange={(next) => {
          setTypeKey(next as TypeKey);
          // The duration follows the cell unless it was chosen by hand.
          setDuration("");
        }}
      >
        {TYPE_OPTIONS.map((opt) => (
          <Form.Dropdown.Item
            key={opt.value}
            value={opt.value}
            title={opt.title}
          />
        ))}
      </Form.Dropdown>
    </Form>
  );
}

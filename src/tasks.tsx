import {
  Action,
  ActionPanel,
  Color,
  confirmAlert,
  Form,
  Icon,
  List,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useState } from "react";
import {
  canCreateTasks,
  completeTask,
  createTask,
  getSettings,
  getTimer,
  putTimer,
  useCategories,
  useTasks,
} from "./api";
import {
  buildIdlePayload,
  buildStartPayload,
  buildUpdatePayload,
} from "./timer-state";
import {
  categoryLabel,
  durationForTasks,
  groupTasks,
  taskCategory,
  taskRefsFor,
  TASK_FILTERS,
} from "./task-view";
import {
  DEFAULT_SETTINGS,
  PROVIDER_LABEL,
  resolveProvider,
  taskKey,
  type ExternalTask,
  type NewTaskWhen,
  type TaskFilter,
  type TaskProvider,
} from "./types";

const PROVIDER_TINT: Record<TaskProvider, Color> = {
  todoist: Color.Red,
  things: Color.Blue,
};

const WHEN_OPTIONS: { value: NewTaskWhen; title: string }[] = [
  { value: "today", title: "Today" },
  { value: "anytime", title: "Anytime" },
  { value: "someday", title: "Someday" },
  { value: "inbox", title: "Inbox" },
];

function AddTaskForm({
  provider,
  onAdded,
}: {
  provider: TaskProvider;
  onAdded: () => void;
}) {
  const { pop } = useNavigation();
  const [title, setTitle] = useState("");
  const [titleError, setTitleError] = useState<string | undefined>();

  async function submit(values: { title: string; when: string }) {
    const trimmed = values.title.trim();
    if (!trimmed) {
      setTitleError("A to-do needs a title");
      return;
    }
    try {
      await createTask(provider, {
        title: trimmed,
        when: (values.when || "inbox") as NewTaskWhen,
      });
      await showToast({
        style: Toast.Style.Success,
        title: "To-Do Added",
        message: trimmed,
      });
      onAdded();
      pop();
    } catch {
      // The API layer has already raised a toast.
    }
  }

  return (
    <Form
      navigationTitle={`New ${PROVIDER_LABEL[provider]} To-Do`}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Add To-do"
            icon={Icon.Plus}
            onSubmit={submit}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="title"
        title="To-Do"
        placeholder="What needs doing?"
        value={title}
        error={titleError}
        onChange={(next) => {
          setTitle(next);
          if (titleError) setTitleError(undefined);
        }}
      />
      <Form.Dropdown id="when" title="When" defaultValue="today">
        {WHEN_OPTIONS.map((opt) => (
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

export default function Tasks() {
  const [filter, setFilter] = useState<TaskFilter>("today");
  const { data, isLoading, revalidate } = useTasks(filter);
  const { data: categories } = useCategories();

  const groups = groupTasks(data?.tasks ?? []);
  const creatable = (data?.providers ?? []).filter(canCreateTasks);

  /**
   * Start a session on this to-do exactly as the web app would: it names the
   * session, it decides the category, and its own estimate sets the length.
   * The link is what makes the finished minutes land back on the to-do.
   */
  async function startOn(task: ExternalTask) {
    const settings = await getSettings().catch(() => DEFAULT_SETTINGS);
    const minutes = durationForTasks([task], settings.focusDuration);
    try {
      await putTimer(
        buildStartPayload({
          sessionType: "focus",
          durationMinutes: minutes,
          intention: task.content,
          category: taskCategory(task, categories ?? [], ""),
          taskRefs: taskRefsFor([task]),
        }),
      );
      await showToast({
        style: Toast.Style.Success,
        title: "Focus Started",
        message: `⏱ ${minutes}m — ${task.content}`,
      });
    } catch {
      // The API layer has already raised a toast.
    }
  }

  /**
   * Set the to-do up as the next session without starting the clock. sesh keeps
   * the topic on the server, so this lands on the phone and the web app too.
   */
  async function queueTask(task: ExternalTask) {
    try {
      const [timer, settings] = await Promise.all([
        getTimer(),
        getSettings().catch(() => DEFAULT_SETTINGS),
      ]);
      const category = taskCategory(
        task,
        categories ?? [],
        timer.category ?? "",
      );
      const minutes = durationForTasks([task], settings.focusDuration);

      // A session already under way gets re-pointed rather than replaced —
      // ending it here would throw away time that has actually been spent.
      const payload =
        timer.phase === "idle"
          ? buildIdlePayload({
              intention: task.content,
              category,
              taskRefs: taskRefsFor([task]),
              targetMs: minutes * 60_000,
            })
          : buildUpdatePayload(timer, {
              intention: task.content,
              category,
              taskRefs: taskRefsFor([task]),
            });

      await putTimer(payload);
      await showToast({
        style: Toast.Style.Success,
        title:
          timer.phase === "idle"
            ? "Queued for Next Session"
            : "Current Session Re-Pointed",
        message: task.content,
      });
    } catch {
      // The API layer has already raised a toast.
    }
  }

  async function close(task: ExternalTask) {
    const provider = resolveProvider(task);
    const confirmed = await confirmAlert({
      title: "Complete To-Do",
      message: `Mark "${task.content}" done in ${PROVIDER_LABEL[provider]}?`,
      icon: Icon.Checkmark,
    });
    if (!confirmed) return;
    try {
      await completeTask(provider, task.id);
      await showToast({
        style: Toast.Style.Success,
        title: "Completed",
        message: task.content,
      });
      revalidate();
    } catch {
      // The API layer has already raised a toast.
    }
  }

  const problems = [
    ...(data?.errors ?? []).map(
      (error) => `${PROVIDER_LABEL[error.provider]}: ${error.message}`,
    ),
    ...(data?.statuses ?? [])
      .filter((status) => status.state !== "connected")
      .map((status) => `${PROVIDER_LABEL[status.provider]}: ${status.message}`),
  ];

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search to-dos..."
      searchBarAccessory={
        <List.Dropdown
          tooltip="Scope"
          value={filter}
          onChange={(next) => setFilter(next as TaskFilter)}
        >
          {TASK_FILTERS.map((option) => (
            <List.Dropdown.Item
              key={option.value}
              value={option.value}
              title={option.title}
            />
          ))}
        </List.Dropdown>
      }
    >
      {groups.length === 0 && !isLoading ? (
        <List.EmptyView
          icon={Icon.Checkmark}
          title={problems.length > 0 ? "No To-Dos Loaded" : "Nothing Due"}
          description={
            problems.length > 0
              ? problems.join("\n")
              : data?.syncing
                ? "Still catching up with your task app — this list will fill in."
                : "Nothing in this scope. Try Upcoming or All."
          }
          actions={
            <ActionPanel>
              {creatable.map((provider) => (
                <Action.Push
                  key={provider}
                  title={`Add ${PROVIDER_LABEL[provider]} To-Do`}
                  icon={Icon.Plus}
                  target={
                    <AddTaskForm provider={provider} onAdded={revalidate} />
                  }
                />
              ))}
              <Action
                title="Refresh"
                icon={Icon.ArrowClockwise}
                onAction={revalidate}
              />
            </ActionPanel>
          }
        />
      ) : (
        groups.map((group) => (
          <List.Section key={group.title} title={group.title}>
            {group.items.map((task) => {
              const provider = resolveProvider(task);
              const category = taskCategory(task, categories ?? [], "");
              return (
                <List.Item
                  key={taskKey(task)}
                  icon={{
                    source: Icon.Circle,
                    tintColor: PROVIDER_TINT[provider],
                  }}
                  title={task.content}
                  subtitle={PROVIDER_LABEL[provider]}
                  keywords={[...(task.labels ?? []), group.title]}
                  accessories={[
                    ...(category
                      ? [{ tag: categoryLabel(categories, category) }]
                      : []),
                    ...(task.duration
                      ? [{ text: `${task.duration.amount}m`, icon: Icon.Clock }]
                      : []),
                    ...(task.dueLabel
                      ? [{ text: task.dueLabel, icon: Icon.Calendar }]
                      : []),
                  ]}
                  actions={
                    <ActionPanel>
                      <Action
                        title="Start Focus on This"
                        icon={Icon.Play}
                        onAction={() => startOn(task)}
                      />
                      <Action
                        title="Set as Next Session"
                        icon={Icon.Pin}
                        shortcut={{ modifiers: ["cmd"], key: "n" }}
                        onAction={() => queueTask(task)}
                      />
                      <Action
                        title="Complete To-do"
                        icon={Icon.Checkmark}
                        shortcut={{ modifiers: ["cmd"], key: "d" }}
                        onAction={() => close(task)}
                      />
                      <ActionPanel.Section>
                        {creatable.map((target) => (
                          <Action.Push
                            key={target}
                            title={`Add ${PROVIDER_LABEL[target]} To-Do`}
                            icon={Icon.Plus}
                            shortcut={{ modifiers: ["cmd"], key: "t" }}
                            target={
                              <AddTaskForm
                                provider={target}
                                onAdded={revalidate}
                              />
                            }
                          />
                        ))}
                        <Action.CopyToClipboard
                          title="Copy To-do"
                          content={task.content}
                        />
                        <Action
                          title="Refresh"
                          icon={Icon.ArrowClockwise}
                          shortcut={{ modifiers: ["cmd"], key: "r" }}
                          onAction={revalidate}
                        />
                      </ActionPanel.Section>
                    </ActionPanel>
                  }
                />
              );
            })}
          </List.Section>
        ))
      )}
    </List>
  );
}

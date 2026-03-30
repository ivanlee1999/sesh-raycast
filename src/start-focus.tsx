import {
  Action,
  ActionPanel,
  Form,
  showToast,
  Toast,
  popToRoot,
  Icon,
} from "@raycast/api";
import { useFetch } from "@raycast/utils";
import type { Category } from "./types";
import { categoriesUrl, putTimer, getDefaultDurationMinutes } from "./api";
import { buildStartPayload } from "./timer-state";

const DURATION_OPTIONS = [
  { value: "15", title: "15 minutes" },
  { value: "20", title: "20 minutes" },
  { value: "25", title: "25 minutes" },
  { value: "30", title: "30 minutes" },
  { value: "45", title: "45 minutes" },
  { value: "60", title: "60 minutes" },
];

const SESSION_TYPE_OPTIONS = [
  { value: "focus", title: "Focus" },
  { value: "short-break", title: "Short Break" },
  { value: "long-break", title: "Long Break" },
];

interface FormValues {
  intention: string;
  category: string;
  duration: string;
  sessionType: string;
}

export default function StartFocus() {
  const { data: categories, isLoading } = useFetch<Category[]>(
    categoriesUrl(),
    {
      keepPreviousData: true,
    },
  );

  const defaultDuration = String(getDefaultDurationMinutes());

  async function handleSubmit(values: FormValues) {
    const durationMinutes = parseInt(values.duration, 10) || 25;
    const sessionType = (values.sessionType || "focus") as
      | "focus"
      | "short-break"
      | "long-break";

    try {
      const payload = buildStartPayload({
        sessionType,
        durationMinutes,
        intention: values.intention,
        category: values.category,
      });
      await putTimer(payload);
      await showToast({
        style: Toast.Style.Success,
        title: "Timer Started",
        message: `${sessionType === "focus" ? "⏱" : "☕"} ${durationMinutes}m ${values.intention || sessionType}`,
      });
      await popToRoot();
    } catch {
      // Error toast already shown by API layer
    }
  }

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
        </ActionPanel>
      }
    >
      <Form.TextField
        id="intention"
        title="Intention"
        placeholder="What will you focus on?"
      />
      <Form.Dropdown id="category" title="Category" defaultValue="">
        <Form.Dropdown.Item value="" title="None" />
        {(categories ?? [])
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
        defaultValue={defaultDuration}
      >
        {DURATION_OPTIONS.map((opt) => (
          <Form.Dropdown.Item
            key={opt.value}
            value={opt.value}
            title={opt.title}
          />
        ))}
      </Form.Dropdown>
      <Form.Dropdown id="sessionType" title="Session Type" defaultValue="focus">
        {SESSION_TYPE_OPTIONS.map((opt) => (
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

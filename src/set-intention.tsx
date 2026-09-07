import {
  Action,
  ActionPanel,
  Form,
  Icon,
  popToRoot,
  showToast,
  Toast,
} from "@raycast/api";
import { useEffect, useState } from "react";
import {
  getSettings,
  putTimer,
  useCategories,
  useSettings,
  useTimer,
} from "./api";
import { buildIdlePayload, buildUpdatePayload } from "./timer-state";
import { defaultCategoryName } from "./task-view";
import { DEFAULT_SETTINGS } from "./types";

/**
 * Write a custom intention — the one line that says what this session is for.
 *
 * sesh keeps the topic on the server whether or not the clock is running, so
 * this is the same field the web app's idle screen writes: set it here and the
 * phone, the menu bar and the web app all agree about what you are doing next.
 */
export default function SetIntention() {
  const { data: timer, isLoading: timerLoading } = useTimer();
  const { data: categories, isLoading: categoriesLoading } = useCategories();
  const { data: settings, isLoading: settingsLoading } = useSettings();

  const [intention, setIntention] = useState("");
  const [category, setCategory] = useState("");
  const [seeded, setSeeded] = useState(false);

  // Seed once from whatever is already on the timer, then leave the fields
  // alone — a background refresh must not overwrite half-typed text.
  useEffect(() => {
    // Wait for the categories too: seeding the dropdown before they arrive
    // would fall back to "None" for a session that has a category already.
    if (seeded || !timer || !categories) return;
    setIntention(timer.intention ?? "");
    setCategory(timer.category || defaultCategoryName(categories));
    setSeeded(true);
  }, [categories, seeded, timer]);

  const running = Boolean(timer) && timer?.phase !== "idle";

  async function submit(values: { intention: string; category: string }) {
    if (!timer) return;
    const text = values.intention.trim();

    try {
      if (running) {
        // Re-titling a session in flight must not move its clock, so the
        // remaining time is recomputed as of now rather than resent as stored.
        await putTimer(
          buildUpdatePayload(timer, {
            intention: text,
            category: values.category,
          }),
        );
      } else {
        const resolved =
          settings ?? (await getSettings().catch(() => DEFAULT_SETTINGS));
        // An idle timer may never have been given a target; fall back to the
        // configured focus length rather than parking a zero-length session.
        const target =
          Number(timer.targetMs) > 0
            ? Number(timer.targetMs)
            : resolved.focusDuration * 60_000;
        await putTimer(
          buildIdlePayload({
            sessionType: "focus",
            intention: text,
            category: values.category,
            // Setting an intention by hand replaces the to-dos it was linked
            // to: the session is about what you just typed, not about them.
            taskRefs: [],
            targetMs: target,
          }),
        );
      }

      await showToast({
        style: Toast.Style.Success,
        title: running ? "Session Re-Titled" : "Intention Set",
        message: text || "Cleared",
      });
      await popToRoot();
    } catch {
      // The API layer has already raised a toast.
    }
  }

  return (
    <Form
      isLoading={timerLoading || categoriesLoading || settingsLoading}
      navigationTitle={
        running ? "Change What This Session Is About" : "Set Intention"
      }
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={running ? "Update Session" : "Set Intention"}
            icon={Icon.Pencil}
            onSubmit={submit}
          />
        </ActionPanel>
      }
    >
      <Form.Description
        title="Timer"
        text={
          running
            ? "A session is running — this renames it without touching the clock."
            : "Nothing is running. This waits on the idle timer, ready for the next session."
        }
      />
      <Form.TextField
        id="intention"
        title="Intention"
        placeholder="What is this session for?"
        value={intention}
        onChange={setIntention}
      />
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
    </Form>
  );
}

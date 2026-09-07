import {
  Action,
  ActionPanel,
  Color,
  confirmAlert,
  Detail,
  Icon,
  showHUD,
  showToast,
  Toast,
} from "@raycast/api";
import { useEffect, useState } from "react";
import {
  completeSession,
  getSettings,
  putTimer,
  useCategories,
  useSettings,
  useTasks,
  useTimer,
} from "./api";
import {
  formatCountdown,
  formatMinutes,
  getPhaseLabel,
  sessionTypeLabel,
} from "./format";
import {
  buildAbandonPayload,
  buildPausePayload,
  buildResumePayload,
  buildUpdatePayload,
  getEffectiveOverflowMs,
  getSignedRemainingMs,
} from "./timer-state";
import { decodeTaskRefs, encodeTaskRef } from "./task-ref";
import { categoryLabel } from "./task-view";
import { DEFAULT_SETTINGS, PROVIDER_LABEL, resolveProvider } from "./types";

function progressBar(pct: number, width = 20): string {
  const filled = Math.round(Math.min(1, Math.max(0, pct)) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

const RATINGS = [1, 2, 3, 4, 5];

export default function ViewTimer() {
  const { data: timer, isLoading, revalidate } = useTimer();
  const { data: categories } = useCategories();
  const { data: settings } = useSettings();
  const { data: taskData } = useTasks("all");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const isIdle = !timer || timer.phase === "idle";
  const isRunning = timer?.phase === "running";
  const isPaused = timer?.phase === "paused";

  const signed = timer ? getSignedRemainingMs(timer, now) : 0;
  const overtime = timer ? getEffectiveOverflowMs(timer, now) : 0;
  const target = Number(timer?.targetMs) || 0;
  const elapsed = Math.max(0, target - signed);
  const progress = target > 0 ? elapsed / target : 0;

  /**
   * The to-dos this session will log its minutes against when it finishes.
   * A ref with no match — closed elsewhere, or its provider switched off since
   * the session started — still shows, rather than silently vanishing from a
   * session that is going to write time against it.
   */
  const taskTitles = new Map(
    (taskData?.tasks ?? []).map((task) => [
      encodeTaskRef(resolveProvider(task), task.id),
      task.content,
    ]),
  );
  const links = decodeTaskRefs(timer?.todoistTaskId).map((ref) => {
    const encoded = encodeTaskRef(ref.provider, ref.id);
    return { ...ref, title: taskTitles.get(encoded) ?? ref.id };
  });

  const markdown = isIdle
    ? [
        "# ⏱ No Active Session",
        "",
        timer?.intention
          ? `Queued up: **${timer.intention}**`
          : "Nothing queued up.",
        "",
        "Use **Start Focus Session**, **Quick Start Focus**, or pick a to-do in **Tasks**.",
      ].join("\n")
    : [
        `# ${timer?.intention || sessionTypeLabel(timer?.sessionType ?? "focus")}`,
        "",
        `## ${getPhaseLabel(timer!, now)}`,
        "",
        `\`${progressBar(progress)}\` ${Math.round(progress * 100)}%`,
        "",
        "| | |",
        "|---|---|",
        overtime > 0
          ? `| **Overtime** | +${formatCountdown(overtime)} |`
          : `| **Remaining** | ${formatCountdown(signed)} |`,
        `| **Elapsed** | ${formatMinutes(elapsed)} |`,
        `| **Target** | ${formatMinutes(target)} |`,
        `| **Category** | ${categoryLabel(categories, timer?.category)} |`,
        `| **Type** | ${sessionTypeLabel(timer?.sessionType ?? "")} |`,
        ...(timer?.startedAt
          ? [
              `| **Started** | ${new Date(timer.startedAt).toLocaleTimeString()} |`,
            ]
          : []),
        "",
        ...(links.length > 0
          ? [
              "### Logging to",
              "",
              ...links.map(
                (ref) => `- ${ref.title} _(${PROVIDER_LABEL[ref.provider]})_`,
              ),
              "",
            ]
          : []),
        overtime > 0
          ? `> ⏰ Running **${formatMinutes(overtime)}** past target.`
          : "",
      ].join("\n");

  async function pauseResume() {
    if (!timer || isIdle) return;
    try {
      if (isRunning) {
        await putTimer(buildPausePayload(timer));
        await showHUD("⏸ Timer paused");
      } else {
        await putTimer(buildResumePayload(timer));
        await showHUD("▶️ Timer resumed");
      }
      revalidate();
    } catch {
      // The API layer has already raised a toast.
    }
  }

  /**
   * Finish, optionally with a rating. The server owns the arithmetic and the
   * write-back to any linked to-do; a rating is a second write against the same
   * session id, which upserts rather than duplicating.
   */
  async function finish(rating?: number) {
    if (!timer || isIdle || !timer.startedAt) return;
    try {
      const result = await completeSession({
        startedAt: timer.startedAt,
        intention: timer.intention,
        ...(rating === undefined ? {} : { rating }),
      });
      if (!result?.completed) {
        await showHUD("Already saved — sesh had finished this one");
      } else {
        await showHUD(
          `✅ Session complete — ${formatMinutes(result.session?.actualMs ?? 0)} focused`,
        );
      }
      revalidate();
    } catch {
      // The API layer has already raised a toast.
    }
  }

  /** Add time without ending the session — the clock keeps its elapsed run. */
  async function extend(minutes: number) {
    if (!timer || isIdle) return;
    try {
      await putTimer(
        buildUpdatePayload(timer, { addMinutes: minutes }, Date.now()),
      );
      await showToast({
        style: Toast.Style.Success,
        title: `Extended by ${minutes} minutes`,
      });
      revalidate();
    } catch {
      // The API layer has already raised a toast.
    }
  }

  /**
   * Abandoning says the sitting did not happen: nothing is logged and no
   * minutes are written to a to-do. Distinct enough from finishing to confirm.
   */
  async function abandon() {
    if (!timer || isIdle) return;
    const confirmed = await confirmAlert({
      title: "Discard Session",
      message:
        "Nothing is recorded and no time is written back to your to-dos.",
      icon: Icon.Trash,
    });
    if (!confirmed) return;
    try {
      const resolved =
        settings ?? (await getSettings().catch(() => DEFAULT_SETTINGS));
      await putTimer(buildAbandonPayload(resolved.focusDuration * 60_000));
      await showHUD("🗑 Session discarded");
      revalidate();
    } catch {
      // The API layer has already raised a toast.
    }
  }

  return (
    <Detail
      isLoading={isLoading}
      markdown={markdown}
      metadata={
        !isIdle && timer ? (
          <Detail.Metadata>
            <Detail.Metadata.Label
              title="Status"
              text={getPhaseLabel(timer, now)}
              icon={{
                source: isRunning
                  ? Icon.Play
                  : isPaused
                    ? Icon.Pause
                    : Icon.Clock,
                tintColor:
                  overtime > 0
                    ? Color.Orange
                    : isRunning
                      ? Color.Green
                      : Color.SecondaryText,
              }}
            />
            <Detail.Metadata.Label
              title={overtime > 0 ? "Overtime" : "Remaining"}
              text={
                overtime > 0
                  ? `+${formatCountdown(overtime)}`
                  : formatCountdown(signed)
              }
              icon={Icon.Clock}
            />
            <Detail.Metadata.Label
              title="Progress"
              text={`${Math.round(progress * 100)}%`}
              icon={Icon.CircleProgress}
            />
            <Detail.Metadata.Separator />
            <Detail.Metadata.Label
              title="Category"
              text={categoryLabel(categories, timer.category)}
              icon={Icon.Tag}
            />
            <Detail.Metadata.Label
              title="Type"
              text={sessionTypeLabel(timer.sessionType)}
            />
            {timer.intention ? (
              <Detail.Metadata.Label
                title="Intention"
                text={timer.intention}
                icon={Icon.Pencil}
              />
            ) : null}
            {links.length > 0 ? (
              <Detail.Metadata.TagList title="To-Dos">
                {links.map((ref) => (
                  <Detail.Metadata.TagList.Item
                    key={`${ref.provider}:${ref.id}`}
                    text={ref.title}
                    color={ref.provider === "things" ? Color.Blue : Color.Red}
                  />
                ))}
              </Detail.Metadata.TagList>
            ) : null}
          </Detail.Metadata>
        ) : undefined
      }
      actions={
        <ActionPanel>
          {!isIdle ? (
            <>
              <Action
                title={isRunning ? "Pause" : "Resume"}
                icon={isRunning ? Icon.Pause : Icon.Play}
                onAction={pauseResume}
              />
              <Action
                title="Finish Session"
                icon={Icon.Checkmark}
                onAction={() => finish()}
              />
              <ActionPanel.Submenu title="Finish with Rating" icon={Icon.Star}>
                {RATINGS.map((rating) => (
                  <Action
                    key={rating}
                    title={`${"★".repeat(rating)}${"☆".repeat(5 - rating)}`}
                    onAction={() => finish(rating)}
                  />
                ))}
              </ActionPanel.Submenu>
              <ActionPanel.Submenu title="Extend" icon={Icon.Plus}>
                {[5, 10, 15, 25].map((minutes) => (
                  <Action
                    key={minutes}
                    title={`+${minutes} minutes`}
                    onAction={() => extend(minutes)}
                  />
                ))}
              </ActionPanel.Submenu>
              <Action
                title="Discard Session"
                icon={Icon.Trash}
                style={Action.Style.Destructive}
                shortcut={{ modifiers: ["cmd", "shift"], key: "backspace" }}
                onAction={abandon}
              />
            </>
          ) : null}
          <Action
            title="Refresh"
            icon={Icon.ArrowClockwise}
            shortcut={{ modifiers: ["cmd"], key: "r" }}
            onAction={() => revalidate()}
          />
        </ActionPanel>
      }
    />
  );
}

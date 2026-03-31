import { Detail, ActionPanel, Action, Icon, Color, showHUD } from "@raycast/api";
import { useFetch } from "@raycast/utils";
import { useEffect, useState } from "react";
import type { TimerState, Category } from "./types";
import { timerUrl, categoriesUrl, putTimer, completeSession } from "./api";
import { formatCountdown, formatMinutes, getPhaseLabel, sessionTypeLabel } from "./format";
import { getEffectiveRemainingMs, buildPausePayload, buildResumePayload } from "./timer-state";

function progressBar(pct: number, width = 20): string {
  const filled = Math.round(pct * width);
  const empty = width - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

export default function ViewTimer() {
  const { data: timer, isLoading, revalidate } = useFetch<TimerState>(timerUrl());
  const { data: categories } = useFetch<Category[]>(categoriesUrl());
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const isIdle = !timer || timer.phase === "idle";
  const isRunning = timer?.phase === "running";
  const isPaused = timer?.phase === "paused";

  const remaining = timer ? getEffectiveRemainingMs(timer, now) : 0;
  const target = timer?.targetMs ?? 0;
  const elapsed = target - remaining;
  const progress = target > 0 ? Math.min(1, Math.max(0, elapsed / target)) : 0;
  const pctStr = `${Math.round(progress * 100)}%`;

  const catMeta = categories?.find((c) => c.name === timer?.category);

  const markdown = isIdle
    ? [
        "# ⏱ No Active Session",
        "",
        "Start a focus session to see progress here.",
        "",
        "Use **Start Focus Session** or **Quick Start Focus** to begin.",
      ].join("\n")
    : [
        `# ${timer?.intention || "Focus Session"}`,
        "",
        `## ${getPhaseLabel(timer!)}`,
        "",
        `\`${progressBar(progress)}\` ${pctStr}`,
        "",
        `| | |`,
        `|---|---|`,
        `| **Remaining** | ${formatCountdown(remaining)} |`,
        `| **Elapsed** | ${formatMinutes(elapsed)} |`,
        `| **Target** | ${formatMinutes(target)} |`,
        `| **Category** | ${catMeta?.label ?? timer?.category ?? "—"} |`,
        `| **Type** | ${sessionTypeLabel(timer?.sessionType ?? "")} |`,
        ...(timer?.startedAt
          ? [
              `| **Started** | ${new Date(timer.startedAt).toLocaleTimeString()} |`,
            ]
          : []),
        "",
        timer?.overflowMs && timer.overflowMs > 0
          ? `> ⚠️ **Overflow:** +${formatMinutes(timer.overflowMs)}`
          : "",
      ].join("\n");

  async function handlePauseResume() {
    if (!timer || isIdle) return;
    if (isRunning) {
      await putTimer(buildPausePayload(timer));
      await showHUD("⏸ Timer paused");
    } else if (isPaused) {
      await putTimer(buildResumePayload(timer));
      await showHUD("▶️ Timer resumed");
    }
    revalidate();
  }

  async function handleFinish() {
    if (!timer || isIdle) return;
    await completeSession({
      startedAt: timer.startedAt ?? Date.now(),
      intention: timer.intention,
      category: timer.category,
    });
    await showHUD("✅ Session complete");
    revalidate();
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
              text={getPhaseLabel(timer)}
              icon={{
                source: isRunning ? Icon.Play : isPaused ? Icon.Pause : Icon.Clock,
                tintColor: isRunning ? Color.Green : isPaused ? Color.Orange : Color.SecondaryText,
              }}
            />
            <Detail.Metadata.Label
              title="Remaining"
              text={formatCountdown(remaining)}
              icon={Icon.Clock}
            />
            <Detail.Metadata.Label
              title="Progress"
              text={pctStr}
              icon={Icon.CircleProgress}
            />
            <Detail.Metadata.Separator />
            <Detail.Metadata.Label
              title="Category"
              text={catMeta?.label ?? timer.category ?? "—"}
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
          </Detail.Metadata>
        ) : undefined
      }
      actions={
        <ActionPanel>
          {!isIdle && (
            <>
              <Action
                title={isRunning ? "Pause" : "Resume"}
                icon={isRunning ? Icon.Pause : Icon.Play}
                onAction={handlePauseResume}
              />
              <Action
                title="Finish Session"
                icon={Icon.Checkmark}
                onAction={handleFinish}
              />
            </>
          )}
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

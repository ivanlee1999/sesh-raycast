import {
  Color,
  Icon,
  LaunchType,
  MenuBarExtra,
  launchCommand,
  showHUD,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { completeSession, getSettings, putTimer, useTimer } from "./api";
import {
  formatCountdown,
  getMenuBarTitle,
  getPhaseLabel,
  sessionTypeLabel,
} from "./format";
import {
  buildAbandonPayload,
  buildPausePayload,
  buildResumePayload,
  getEffectiveOverflowMs,
  getSignedRemainingMs,
} from "./timer-state";
import { decodeTaskRefs } from "./task-ref";
import { DEFAULT_SETTINGS, PROVIDER_LABEL } from "./types";

async function open(name: string, fallback: string) {
  try {
    await launchCommand({ name, type: LaunchType.UserInitiated });
  } catch {
    await showHUD(fallback);
  }
}

export default function MenuBarTimer() {
  const { data: timer, isLoading, revalidate } = useTimer();
  const [now, setNow] = useState(Date.now());

  // Tick every second so the countdown in the menu bar stays honest between
  // the extension's own refreshes.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const isIdle = !timer || timer.phase === "idle";
  const isRunning = timer?.phase === "running";
  const overtime = timer ? getEffectiveOverflowMs(timer, now) : 0;
  const signed = timer ? getSignedRemainingMs(timer, now) : 0;
  const links = decodeTaskRefs(timer?.todoistTaskId);

  async function pauseResume() {
    if (!timer || isIdle) {
      await showHUD("No active timer to pause or resume");
      return;
    }
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

  async function finish() {
    if (!timer || isIdle || !timer.startedAt) {
      await showHUD("No active session to finish");
      return;
    }
    try {
      const result = await completeSession({
        startedAt: timer.startedAt,
        intention: timer.intention,
      });
      await showHUD(
        result?.completed ? "✅ Session complete" : "Already saved by sesh",
      );
      revalidate();
    } catch {
      // The API layer has already raised a toast.
    }
  }

  async function discard() {
    if (!timer || isIdle) return;
    try {
      const settings = await getSettings().catch(() => DEFAULT_SETTINGS);
      await putTimer(buildAbandonPayload(settings.focusDuration * 60_000));
      await showHUD("🗑 Session discarded");
      revalidate();
    } catch {
      // The API layer has already raised a toast.
    }
  }

  return (
    <MenuBarExtra
      icon={isIdle ? Icon.Clock : undefined}
      title={timer ? getMenuBarTitle(timer, now) : "sesh"}
      isLoading={isLoading}
      tooltip={timer?.intention || "sesh"}
    >
      {timer && !isIdle ? (
        <MenuBarExtra.Section>
          <MenuBarExtra.Item
            icon={{
              source: Icon.Dot,
              tintColor: overtime > 0 ? Color.Orange : Color.Green,
            }}
            title={getPhaseLabel(timer, now)}
            subtitle={`${sessionTypeLabel(timer.sessionType)} — ${
              overtime > 0
                ? `+${formatCountdown(overtime)} over`
                : formatCountdown(signed)
            }`}
            onAction={() =>
              open("view-timer", "Could not open the session view")
            }
          />
          {timer.intention ? (
            <MenuBarExtra.Item icon={Icon.Pencil} title={timer.intention} />
          ) : null}
          {timer.category ? (
            <MenuBarExtra.Item icon={Icon.Tag} title={timer.category} />
          ) : null}
          {links.map((ref) => (
            <MenuBarExtra.Item
              key={`${ref.provider}:${ref.id}`}
              icon={Icon.CheckCircle}
              title={`Logging to ${PROVIDER_LABEL[ref.provider]}`}
            />
          ))}
        </MenuBarExtra.Section>
      ) : null}

      <MenuBarExtra.Section>
        {!isIdle ? (
          <>
            <MenuBarExtra.Item
              icon={isRunning ? Icon.Pause : Icon.Play}
              title={isRunning ? "Pause" : "Resume"}
              onAction={pauseResume}
            />
            <MenuBarExtra.Item
              icon={Icon.Checkmark}
              title="Finish Session"
              onAction={finish}
            />
            <MenuBarExtra.Item
              icon={Icon.Trash}
              title="Discard Session"
              onAction={discard}
            />
          </>
        ) : null}
        <MenuBarExtra.Item
          icon={Icon.Plus}
          title="Start Focus Session"
          onAction={() => open("start-focus", "Could not open Start Focus")}
        />
        <MenuBarExtra.Item
          icon={Icon.Pencil}
          title={isIdle ? "Set Intention" : "Change Intention"}
          onAction={() => open("set-intention", "Could not open Set Intention")}
        />
      </MenuBarExtra.Section>

      <MenuBarExtra.Section>
        <MenuBarExtra.Item
          icon={Icon.CheckCircle}
          title="Tasks"
          onAction={() => open("tasks", "Could not open Tasks")}
        />
        <MenuBarExtra.Item
          icon={Icon.List}
          title="View History"
          onAction={() => open("view-history", "Could not open History")}
        />
        <MenuBarExtra.Item
          icon={Icon.BarChart}
          title="View Analytics"
          onAction={() => open("view-analytics", "Could not open Analytics")}
        />
      </MenuBarExtra.Section>
    </MenuBarExtra>
  );
}

import {
  Icon,
  MenuBarExtra,
  showHUD,
  LaunchType,
  launchCommand,
} from "@raycast/api";
import { useEffect, useState } from "react";
import type { TimerState } from "./types";
import { useTimer, putTimer, completeSession } from "./api";
import {
  getMenuBarTitle,
  getPhaseLabel,
  formatCountdown,
  sessionTypeLabel,
} from "./format";
import {
  getEffectiveRemainingMs,
  buildPausePayload,
  buildResumePayload,
} from "./timer-state";

export default function MenuBarTimer() {
  const { data: timer, isLoading, revalidate } = useTimer();
  const [now, setNow] = useState(Date.now());

  // Tick every second for smooth countdown display
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = timer ? getEffectiveRemainingMs(timer, now) : 0;
  const title = timer ? getMenuBarTitle(timer, remaining) : "sesh";
  const isIdle = !timer || timer.phase === "idle";
  const isRunning = timer?.phase === "running";
  const isPaused = timer?.phase === "paused";

  async function handlePauseResume() {
    if (!timer || isIdle) {
      await showHUD("No active timer to pause/resume");
      return;
    }
    try {
      if (isRunning) {
        await putTimer(buildPausePayload(timer));
        await showHUD("⏸ Timer paused");
      } else if (isPaused) {
        await putTimer(buildResumePayload(timer));
        await showHUD("▶️ Timer resumed");
      }
      revalidate();
    } catch {
      // Error already shown by API layer
    }
  }

  async function handleFinish() {
    if (!timer || isIdle) {
      await showHUD("No active session to finish");
      return;
    }
    try {
      await completeSession({
        startedAt: timer.startedAt ?? Date.now(),
        intention: timer.intention,
        category: timer.category,
      });
      await showHUD("✅ Session complete");
      revalidate();
    } catch {
      // Error already shown by API layer
    }
  }

  async function handleStartFocus() {
    try {
      await launchCommand({
        name: "start-focus",
        type: LaunchType.UserInitiated,
      });
    } catch {
      await showHUD("Could not open Start Focus");
    }
  }

  return (
    <MenuBarExtra
      icon={isIdle ? Icon.Clock : undefined}
      title={title}
      isLoading={isLoading}
    >
      {timer && !isIdle && (
        <MenuBarExtra.Section>
          <MenuBarExtra.Item
            icon={Icon.Dot}
            title={getPhaseLabel(timer)}
            subtitle={`${sessionTypeLabel(timer.sessionType)} — ${formatCountdown(remaining)}`}
          />
          {timer.intention && (
            <MenuBarExtra.Item
              icon={Icon.Pencil}
              title={`Intention: ${timer.intention}`}
            />
          )}
          {timer.category && (
            <MenuBarExtra.Item
              icon={Icon.Tag}
              title={`Category: ${timer.category}`}
            />
          )}
        </MenuBarExtra.Section>
      )}

      <MenuBarExtra.Section>
        {!isIdle && (
          <>
            <MenuBarExtra.Item
              icon={isRunning ? Icon.Pause : Icon.Play}
              title={isRunning ? "Pause" : "Resume"}
              onAction={handlePauseResume}
            />
            <MenuBarExtra.Item
              icon={Icon.Checkmark}
              title="Finish Session"
              onAction={handleFinish}
            />
          </>
        )}
        <MenuBarExtra.Item
          icon={Icon.Plus}
          title="Start Focus Session"
          onAction={handleStartFocus}
        />
      </MenuBarExtra.Section>

      <MenuBarExtra.Section>
        <MenuBarExtra.Item
          icon={Icon.List}
          title="View History"
          onAction={async () => {
            try {
              await launchCommand({
                name: "view-history",
                type: LaunchType.UserInitiated,
              });
            } catch {
              // ignore
            }
          }}
        />
        <MenuBarExtra.Item
          icon={Icon.BarChart}
          title="View Analytics"
          onAction={async () => {
            try {
              await launchCommand({
                name: "view-analytics",
                type: LaunchType.UserInitiated,
              });
            } catch {
              // ignore
            }
          }}
        />
      </MenuBarExtra.Section>
    </MenuBarExtra>
  );
}

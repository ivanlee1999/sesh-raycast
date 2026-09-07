import { showHUD } from "@raycast/api";
import { getTimer, putTimer } from "./api";
import {
  buildPausePayload,
  buildResumePayload,
  getEffectiveOverflowMs,
  getSignedRemainingMs,
} from "./timer-state";
import { formatCountdown } from "./format";

export default async function PauseResume() {
  let timer;
  try {
    timer = await getTimer();
  } catch {
    await showHUD("❌ Cannot reach sesh server");
    return;
  }

  if (timer.phase === "idle") {
    await showHUD("No active timer — start a session first");
    return;
  }

  try {
    if (timer.phase === "running") {
      const overtime = getEffectiveOverflowMs(timer);
      await putTimer(buildPausePayload(timer));
      await showHUD(
        overtime > 0
          ? `⏸ Paused — ${formatCountdown(overtime)} over`
          : `⏸ Paused — ${formatCountdown(getSignedRemainingMs(timer))} remaining`,
      );
      return;
    }

    await putTimer(buildResumePayload(timer));
    const remaining = Number(timer.remainingMs) || 0;
    await showHUD(
      remaining < 0
        ? `▶️ Resumed — ${formatCountdown(-remaining)} over`
        : `▶️ Resumed — ${formatCountdown(remaining)} remaining`,
    );
  } catch {
    await showHUD("❌ Failed to update timer");
  }
}

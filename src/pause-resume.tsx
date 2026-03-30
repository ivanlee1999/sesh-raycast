import { showHUD } from "@raycast/api";
import { getTimer, putTimer } from "./api";
import {
  buildPausePayload,
  buildResumePayload,
  getEffectiveRemainingMs,
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
      const payload = buildPausePayload(timer);
      await putTimer(payload);
      const remaining = getEffectiveRemainingMs(timer);
      await showHUD(`⏸ Paused — ${formatCountdown(remaining)} remaining`);
    } else if (timer.phase === "paused") {
      const payload = buildResumePayload(timer);
      await putTimer(payload);
      await showHUD(
        `▶️ Resumed — ${formatCountdown(timer.remainingMs)} remaining`,
      );
    }
  } catch {
    await showHUD("❌ Failed to update timer");
  }
}

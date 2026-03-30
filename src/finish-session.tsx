import { showHUD } from "@raycast/api";
import { getTimer, completeSession } from "./api";
import { formatMinutes } from "./format";
import { getEffectiveRemainingMs } from "./timer-state";

export default async function FinishSession() {
  let timer;
  try {
    timer = await getTimer();
  } catch {
    await showHUD("❌ Cannot reach sesh server");
    return;
  }

  if (timer.phase === "idle") {
    await showHUD("No active session to finish");
    return;
  }

  try {
    const remaining = getEffectiveRemainingMs(timer);
    const actualMs = timer.targetMs - remaining;

    await completeSession({
      startedAt: timer.startedAt ?? new Date().toISOString(),
      intention: timer.intention,
      category: timer.category,
    });

    await showHUD(`✅ Session complete — ${formatMinutes(actualMs)} focused`);
  } catch {
    await showHUD("❌ Failed to finish session");
  }
}

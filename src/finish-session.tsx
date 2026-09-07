import { showHUD } from "@raycast/api";
import { completeSession, getTimer } from "./api";
import { formatMinutes } from "./format";

/**
 * End the running session and record it.
 *
 * The arithmetic belongs to the server: it compares and swaps on `startedAt`,
 * so a session the web app or the background completer already saved comes back
 * as `completed: false` instead of being written twice — and it logs the
 * minutes to any linked to-do on the way past.
 */
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

  if (!timer.startedAt) {
    await showHUD("This session has no start time — finish it in sesh");
    return;
  }

  try {
    const result = await completeSession({
      startedAt: timer.startedAt,
      intention: timer.intention,
    });
    if (!result?.completed) {
      await showHUD("Already saved — sesh had finished this one");
      return;
    }
    const focused = formatMinutes(result.session?.actualMs ?? 0);
    await showHUD(`✅ Session complete — ${focused} focused`);
  } catch {
    await showHUD("❌ Failed to finish session");
  }
}

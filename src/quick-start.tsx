import { showHUD } from "@raycast/api";
import {
  getDefaultDurationMinutes,
  getSettings,
  getTimer,
  putTimer,
  getCategories,
} from "./api";
import { buildStartPayload } from "./timer-state";
import { splitTaskRefs } from "./task-ref";
import { defaultCategoryName } from "./task-view";

/**
 * Start focusing with no questions asked.
 *
 * Whatever topic is already parked on the idle timer — set from the web app,
 * the phone, the Tasks command or Set Intention — is carried straight into the
 * session, including the to-dos it is linked to. Only a blank timer falls back
 * to a plain untitled session.
 */
export default async function QuickStart() {
  let timer;
  try {
    timer = await getTimer();
  } catch {
    await showHUD("❌ Cannot reach sesh server");
    return;
  }

  if (timer.phase !== "idle") {
    await showHUD("A session is already running — finish it first");
    return;
  }

  // The server's own focus length is the real default — it is what the web
  // app and the phone use. The Raycast preference is the fallback for when
  // settings cannot be read at all.
  const [settings, categories] = await Promise.all([
    getSettings().catch(() => null),
    getCategories().catch(() => []),
  ]);
  const durationMinutes =
    settings?.focusDuration ?? getDefaultDurationMinutes();
  const taskRefs = splitTaskRefs(timer.todoistTaskId);

  try {
    await putTimer(
      buildStartPayload({
        sessionType: "focus",
        durationMinutes,
        intention: timer.intention ?? "",
        category: timer.category || defaultCategoryName(categories),
        taskRefs,
      }),
    );
    const topic = timer.intention ? ` — ${timer.intention}` : "";
    await showHUD(`⏱ Focus started, ${durationMinutes} minutes${topic}`);
  } catch {
    await showHUD("❌ Failed to start focus session");
  }
}

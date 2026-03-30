import { showHUD } from "@raycast/api";
import { putTimer, getCategories, getDefaultDurationMinutes } from "./api";
import { buildStartPayload } from "./timer-state";

export default async function QuickStart() {
  const durationMinutes = getDefaultDurationMinutes();

  let category = "development";
  try {
    const categories = await getCategories();
    if (categories.length > 0) {
      const defaultCat = categories.find((c) => c.isDefault);
      category = defaultCat ? defaultCat.name : categories[0].name;
    }
  } catch {
    // Fall back to "development" if categories can't be fetched
  }

  try {
    const payload = buildStartPayload({
      sessionType: "focus",
      durationMinutes,
      category,
    });
    await putTimer(payload);
    await showHUD(`⏱ Focus started — ${durationMinutes} minutes`);
  } catch {
    // Error toast already shown by API layer
    await showHUD("❌ Failed to start focus session");
  }
}

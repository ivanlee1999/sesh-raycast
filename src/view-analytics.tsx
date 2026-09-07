import { Action, ActionPanel, Detail, Icon } from "@raycast/api";
import { useAnalytics } from "./api";
import { formatMinutes } from "./format";
import type { Analytics } from "./types";

/** A bar drawn to the busiest day, so the week reads at a glance. */
function bar(ms: number, peak: number, width = 18): string {
  if (peak <= 0) return "░".repeat(width);
  const filled = Math.round((ms / peak) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function buildMarkdown(data: Analytics): string {
  const days = data.days ?? [];
  const peak = days.reduce((max, day) => Math.max(max, day.ms), 0);
  const weekMs = days.reduce((sum, day) => sum + day.ms, 0);

  const lines = [
    "# 📊 Focus Analytics",
    "",
    "## Today",
    `- **Focus time:** ${formatMinutes(data.todayMs)}`,
    `- **Sessions:** ${data.todayCount}`,
    `- **Streak:** ${data.streak} day${data.streak === 1 ? "" : "s"} 🔥`,
    "",
  ];

  if (days.length > 0) {
    lines.push("## Last 7 Days", "", "| Day | | Focus |", "|---|---|---|");
    for (const day of days) {
      lines.push(
        `| ${day.label} | \`${bar(day.ms, peak)}\` | ${formatMinutes(day.ms)} |`,
      );
    }
    lines.push(
      "",
      `**Week total:** ${formatMinutes(weekMs)} · **Daily average:** ${formatMinutes(weekMs / days.length)}`,
    );
  }

  return lines.join("\n");
}

export default function ViewAnalytics() {
  const { data, isLoading, revalidate } = useAnalytics();

  const weekMs = (data?.days ?? []).reduce((sum, day) => sum + day.ms, 0);

  return (
    <Detail
      isLoading={isLoading}
      markdown={
        data ? buildMarkdown(data) : "# 📊 Focus Analytics\n\nLoading..."
      }
      metadata={
        data ? (
          <Detail.Metadata>
            <Detail.Metadata.Label
              title="Today's Focus"
              text={formatMinutes(data.todayMs)}
              icon={Icon.Clock}
            />
            <Detail.Metadata.Label
              title="Sessions Today"
              text={String(data.todayCount)}
              icon={Icon.List}
            />
            <Detail.Metadata.Label
              title="Streak"
              text={`${data.streak} day${data.streak === 1 ? "" : "s"}`}
              icon={Icon.Star}
            />
            <Detail.Metadata.Separator />
            <Detail.Metadata.Label
              title="Last 7 Days"
              text={formatMinutes(weekMs)}
              icon={Icon.BarChart}
            />
          </Detail.Metadata>
        ) : undefined
      }
      actions={
        <ActionPanel>
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

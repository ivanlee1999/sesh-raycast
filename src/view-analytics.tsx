import { Detail, Icon } from "@raycast/api";
import { useFetch } from "@raycast/utils";
import type { Analytics } from "./types";
import { analyticsUrl } from "./api";
import { formatMinutes } from "./format";

function buildMarkdown(data: Analytics): string {
  const lines: string[] = [];

  lines.push("# 📊 Focus Analytics");
  lines.push("");
  lines.push("## Today");
  lines.push(`- **Total Focus Time:** ${formatMinutes(data.todayMs)}`);
  lines.push(`- **Sessions:** ${data.todayCount}`);
  lines.push(
    `- **Streak:** ${data.streak} day${data.streak !== 1 ? "s" : ""} 🔥`,
  );
  lines.push("");

  // Last 7 Days
  if (data.days && data.days.length > 0) {
    lines.push("## Last 7 Days");
    lines.push("");
    lines.push("| Day | Focus Time |");
    lines.push("|-----|------------|");
    for (const day of data.days) {
      lines.push(`| ${day.label} | ${formatMinutes(day.ms)} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export default function ViewAnalytics() {
  const { data, isLoading } = useFetch<Analytics>(analyticsUrl(), {
    keepPreviousData: true,
  });

  const markdown = data
    ? buildMarkdown(data)
    : "# 📊 Focus Analytics\n\nLoading...";

  return (
    <Detail
      isLoading={isLoading}
      markdown={markdown}
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
              text={`${data.streak} days`}
              icon={Icon.Star}
            />
          </Detail.Metadata>
        ) : undefined
      }
    />
  );
}

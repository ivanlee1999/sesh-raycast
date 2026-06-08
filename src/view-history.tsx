import { Icon, List, Color } from "@raycast/api";
import type { Session } from "./types";
import { useSessions } from "./api";
import {
  formatMinutes,
  formatClockTime,
  formatDate,
  sessionTypeLabel,
} from "./format";

interface DateGroup {
  dateLabel: string;
  items: Session[];
}

function groupByDate(sessions: Session[]): DateGroup[] {
  const groups = new Map<string, Session[]>();
  for (const session of sessions) {
    const dateKey = new Date(session.startedAt).toLocaleDateString();
    const existing = groups.get(dateKey);
    if (existing) {
      existing.push(session);
    } else {
      groups.set(dateKey, [session]);
    }
  }

  return Array.from(groups.entries()).map(([, items]) => ({
    dateLabel: formatDate(items[0].startedAt),
    items,
  }));
}

const CATEGORY_COLORS: Record<string, Color> = {
  development: Color.Blue,
  design: Color.Purple,
  writing: Color.Orange,
  learning: Color.Green,
  planning: Color.Yellow,
  communication: Color.Red,
};

function getCategoryColor(category: string | null): Color {
  if (!category) return Color.SecondaryText;
  return CATEGORY_COLORS[category.toLowerCase()] ?? Color.PrimaryText;
}

export default function ViewHistory() {
  const { data: sessions, isLoading } = useSessions();

  const groups = groupByDate(sessions ?? []);

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search sessions...">
      {groups.length === 0 && !isLoading ? (
        <List.EmptyView
          icon={Icon.Clock}
          title="No Sessions Yet"
          description="Start a focus session to see your history here."
        />
      ) : (
        groups.map((group, gi) => (
          <List.Section key={gi} title={group.dateLabel}>
            {group.items.map((session) => (
              <List.Item
                key={session.id}
                icon={{
                  source: Icon.Circle,
                  tintColor: getCategoryColor(session.category),
                }}
                title={session.intention || "Untitled session"}
                subtitle={sessionTypeLabel(session.type)}
                accessories={[
                  ...(session.category
                    ? [
                        {
                          tag: {
                            value: session.category,
                            color: getCategoryColor(session.category),
                          },
                        },
                      ]
                    : []),
                  { text: formatMinutes(session.actualMs) },
                  {
                    text: formatClockTime(session.startedAt),
                    icon: Icon.Clock,
                  },
                ]}
              />
            ))}
          </List.Section>
        ))
      )}
    </List>
  );
}

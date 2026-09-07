import { Action, ActionPanel, Color, Icon, List } from "@raycast/api";
import { useCategories, useSessions } from "./api";
import {
  formatClockTime,
  formatDate,
  formatMinutes,
  formatRating,
  sessionTypeLabel,
} from "./format";
import { decodeTaskRefs } from "./task-ref";
import { categoryLabel } from "./task-view";
import { PROVIDER_LABEL, type Category, type Session } from "./types";

interface DateGroup {
  key: string;
  dateLabel: string;
  items: Session[];
  totalMs: number;
}

function groupByDate(sessions: Session[]): DateGroup[] {
  const groups = new Map<string, Session[]>();
  for (const session of sessions) {
    const key = new Date(session.startedAt).toLocaleDateString();
    const existing = groups.get(key);
    if (existing) existing.push(session);
    else groups.set(key, [session]);
  }

  return Array.from(groups.entries()).map(([key, items]) => ({
    key,
    dateLabel: formatDate(items[0].startedAt),
    items,
    // Only focus counts toward a day's total — a break is rest, not output.
    totalMs: items
      .filter((item) => item.type === "focus")
      .reduce((sum, item) => sum + (item.actualMs ?? 0), 0),
  }));
}

/**
 * A category's own colour, as set in sesh. The palette is the server's to
 * choose, so this falls back to a neutral tag rather than inventing one.
 */
function tagColor(
  categories: Category[] | undefined,
  name: string | null,
): Color.ColorLike {
  const found = categories?.find((category) => category.name === name);
  return found?.color ?? Color.SecondaryText;
}

export default function ViewHistory() {
  const { data: sessions, isLoading } = useSessions();
  const { data: categories } = useCategories();

  const groups = groupByDate(sessions ?? []);

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search sessions..."
      isShowingDetail={false}
    >
      {groups.length === 0 && !isLoading ? (
        <List.EmptyView
          icon={Icon.Clock}
          title="No Sessions Yet"
          description="Start a focus session to see your history here."
        />
      ) : (
        groups.map((group) => (
          <List.Section
            key={group.key}
            title={group.dateLabel}
            subtitle={formatMinutes(group.totalMs)}
          >
            {group.items.map((session) => {
              const links = decodeTaskRefs(session.todoistTaskId);
              return (
                <List.Item
                  key={session.id}
                  icon={{
                    source: session.type === "focus" ? Icon.Circle : Icon.Mug,
                    tintColor: tagColor(categories, session.category),
                  }}
                  title={session.intention || "Untitled session"}
                  subtitle={sessionTypeLabel(session.type)}
                  keywords={[session.category, session.type].filter(Boolean)}
                  accessories={[
                    ...(session.rating
                      ? [{ text: formatRating(session.rating) }]
                      : []),
                    ...(links.length > 0
                      ? [
                          {
                            icon: Icon.CheckCircle,
                            tooltip: links
                              .map((ref) => PROVIDER_LABEL[ref.provider])
                              .join(", "),
                          },
                        ]
                      : []),
                    ...(session.category
                      ? [
                          {
                            tag: {
                              value: categoryLabel(
                                categories,
                                session.category,
                              ),
                              color: tagColor(categories, session.category),
                            },
                          },
                        ]
                      : []),
                    {
                      text: formatMinutes(session.actualMs),
                      tooltip:
                        session.overflowMs > 0
                          ? `${formatMinutes(session.actualMs)} — ${formatMinutes(session.overflowMs)} past a ${formatMinutes(session.targetMs)} target`
                          : `Target ${formatMinutes(session.targetMs)}`,
                    },
                    {
                      text: formatClockTime(session.startedAt),
                      icon: Icon.Clock,
                    },
                  ]}
                  actions={
                    <ActionPanel>
                      <Action.CopyToClipboard
                        title="Copy Intention"
                        content={session.intention || "Untitled session"}
                      />
                      <Action.CopyToClipboard
                        title="Copy Summary"
                        content={`${session.intention || "Untitled session"} — ${formatMinutes(session.actualMs)} (${formatDate(session.startedAt)} ${formatClockTime(session.startedAt)})`}
                      />
                    </ActionPanel>
                  }
                />
              );
            })}
          </List.Section>
        ))
      )}
    </List>
  );
}

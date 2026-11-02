"use client";
import {
  ErrorState,
  LoadingState,
  EmptyState,
} from "@/components/ui/content-states";
import { CursorPagination } from "@/components/ui/pagination";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableRowHeader,
} from "@/components/ui/table";
import {
  useBotNotificationPreferences,
  noticeLabels,
} from "@/hooks/use-bot-notifications";
import { useWorkspace } from "@/hooks/workspace";
import { BotNotificationCard } from "./bot-notification-card";
import { Panel } from "./page-parts";
const stateLabels: Record<string, string> = {
  pending: "در صف",
  waiting_configuration: "در انتظار راه‌اندازی",
  sending: "ارسال آغاز شده",
  sent: "ارسال تأیید شد",
  unconfirmed: "نتیجه ارسال نامعلوم",
  cancelled: "لغو شد",
  obsolete: "موضوع برطرف شده",
};
function PersonalNotifications() {
  const c = useBotNotificationPreferences();
  return (
    <div className="mt-5 space-y-5">
      <Panel title="اعلان‌های شخصی بات">
        {c.resource.loading ? (
          <LoadingState label="در حال دریافت تنظیم اعلان" />
        ) : c.resource.error ? (
          <ErrorState
            message={c.resource.error.message}
            onRetry={c.resource.refresh}
          />
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {c.cards.map((card) => (
              <BotNotificationCard key={card.provider} card={card} c={c} />
            ))}
          </div>
        )}
      </Panel>
      <Panel title="سابقه اعلان‌های شما">
        {c.history.loading ? (
          <LoadingState variant="message" />
        ) : c.history.error ? (
          <ErrorState
            message={c.history.error.message}
            onRetry={c.history.refresh}
          />
        ) : !c.history.data?.items.length ? (
          <EmptyState compact title="اعلانی در صف نیست" />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>رویداد</TableHead>
                  <TableHead>پیام‌رسان</TableHead>
                  <TableHead>زمان برنامه‌ریزی؛ تهران</TableHead>
                  <TableHead>وضعیت</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {c.historyRows.map((item) => (
                  <TableRow key={item.id}>
                    <TableRowHeader>
                      {noticeLabels[item.event_type] || "اعلان"}
                    </TableRowHeader>
                    <TableCell>
                      {item.provider === "telegram" ? "تلگرام" : "بله"}
                    </TableCell>
                    <TableCell>{item.scheduledTime}</TableCell>
                    <TableCell>{stateLabels[item.state] || "نامشخص"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <CursorPagination {...c.history} />
          </>
        )}
      </Panel>
    </div>
  );
}
export function BotNotificationsPanel() {
  const w = useWorkspace();
  if (!w.company) return null;
  return <PersonalNotifications key={`${w.user?.id}:${w.company.id}`} />;
}

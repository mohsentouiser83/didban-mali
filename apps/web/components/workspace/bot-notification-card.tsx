"use client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { StatusMessage } from "@/components/ui/content-states";
import {
  noticeLabels,
  type NoticeEvent,
  type useBotNotificationPreferences,
} from "@/hooks/use-bot-notifications";
type Controller = ReturnType<typeof useBotNotificationPreferences>;
export function BotNotificationCard({
  card,
  c,
}: {
  card: Controller["cards"][number];
  c: Controller;
}) {
  const prefix = `notice-${card.provider}`;
  return (
    <section className="min-w-0 rounded-panel border border-border p-5">
      <h3 className="mb-4 font-medium">{card.providerLabel}</h3>
      <Form
        onSubmit={(event) => {
          event.preventDefault();
          c.save(card);
        }}
        fieldErrors={c.command.error?.fields}
      >
        <div className="flex items-center gap-3">
          <Switch
            label={`اعلان ${card.providerLabel}`}
            checked={card.value.enabled}
            disabled={!card.connected || c.command.busy}
            onCheckedChange={(enabled) => c.change(card, { enabled })}
          />
          <span>اعلان فعال</span>
        </div>
        {!card.connected && (
          <StatusMessage>
            ابتدا حساب {card.providerLabel} را متصل کنید.
          </StatusMessage>
        )}
        {card.connected && card.value.enabled && !card.binding_current && (
          <StatusMessage>
            اتصال تغییر کرده؛ تنظیم اعلان را دوباره ذخیره کنید.
          </StatusMessage>
        )}
        {card.connected && !card.configured && (
          <StatusMessage>
            ارسال در سرور فعال نیست؛ اعلان‌ها تا راه‌اندازی منتظر می‌مانند.
          </StatusMessage>
        )}
        <fieldset disabled={c.command.busy} className="space-y-2">
          <legend className="mb-2 font-medium">رویدادها</legend>
          {(Object.keys(noticeLabels) as NoticeEvent[]).map((event) => (
            <Checkbox
              key={event}
              id={`${prefix}-${event}`}
              label={noticeLabels[event]}
              checked={card.value.events.includes(event)}
              onCheckedChange={(checked) => c.toggle(card, event, checked)}
            />
          ))}
        </fieldset>
        {card.invalidEvents && (
          <FieldError>حداقل یک نوع اعلان انتخاب کنید.</FieldError>
        )}
        {card.value.events.includes("daily_summary") && (
          <Field
            id={`${prefix}-summary`}
            name="summary_time"
            label="زمان خلاصه روزانه؛ به وقت تهران"
          >
            <Input
              id={`${prefix}-summary`}
              dir="ltr"
              required
              pattern="(?:[01][0-9]|2[0-3]):[0-5][0-9]"
              placeholder="HH:MM"
              value={card.value.summary_time}
              disabled={c.command.busy}
              onChange={(event) =>
                c.change(card, { summary_time: event.target.value })
              }
            />
          </Field>
        )}
        <div className="flex items-center gap-3">
          <Switch
            label={`ساعات سکوت ${card.providerLabel}`}
            checked={card.value.quiet_enabled}
            disabled={c.command.busy}
            onCheckedChange={(quiet_enabled) =>
              c.change(card, { quiet_enabled })
            }
          />
          <span>ساعات سکوت</span>
        </div>
        {card.value.quiet_enabled && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id={`${prefix}-start`}
              name="quiet_start"
              label="شروع؛ به وقت تهران"
            >
              <Input
                id={`${prefix}-start`}
                required
                dir="ltr"
                pattern="(?:[01][0-9]|2[0-3]):[0-5][0-9]"
                placeholder="HH:MM"
                value={card.value.quiet_start}
                disabled={c.command.busy}
                onChange={(event) =>
                  c.change(card, { quiet_start: event.target.value })
                }
              />
            </Field>
            <Field
              id={`${prefix}-end`}
              name="quiet_end"
              label="پایان؛ به وقت تهران"
            >
              <Input
                id={`${prefix}-end`}
                required
                dir="ltr"
                pattern="(?:[01][0-9]|2[0-3]):[0-5][0-9]"
                placeholder="HH:MM"
                value={card.value.quiet_end}
                disabled={c.command.busy}
                onChange={(event) =>
                  c.change(card, { quiet_end: event.target.value })
                }
              />
            </Field>
          </div>
        )}
        <FormMessage error>{c.command.error?.message}</FormMessage>
        <Button
          type="submit"
          busy={c.command.busy}
          disabled={card.invalidEvents}
        >
          ذخیره اعلان {card.providerLabel}
        </Button>
      </Form>
    </section>
  );
}

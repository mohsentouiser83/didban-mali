'use client';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { Form } from '@/components/ui/form';
import { Field, FormMessage } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { useDimensionReporting } from '@/hooks/use-dimensions';
import { persian } from '@/lib/utils';
export function DimensionAllocationForm({ view }: {
    view: ReturnType<typeof useDimensionReporting>;
}) { return <Drawer title="بررسی تخصیص ردیف" open={!!view.selected} onOpenChange={open => { if (!open)
    view.close(); }}>
<Form fieldErrors={view.command.error?.fields} onSubmit={event => { event.preventDefault(); view.assign(); }}>{view.shares.map((share, index) => <div className="space-y-3 rounded-control border border-border p-4" key={index}>
<Field id={`share-dimension-${index}`} label={`بُعد ${persian(index + 1)}`}>
<Select id={`share-dimension-${index}`} value={share.dimension_id} options={view.options} onValueChange={dimension_id => view.changeShare(index, { dimension_id })}/>
</Field>
<Field id={`share-percent-${index}`} label="سهم (درصد)">
<Input id={`share-percent-${index}`} required inputMode="decimal" value={share.percent} onChange={event => view.changeShare(index, { percent: event.target.value })}/>
</Field>{view.shares.length > 1 && <Button variant="ghost" onClick={() => view.removeShare(index)}>حذف سهم</Button>}</div>)}<Button variant="secondary" onClick={view.addShare}>افزودن سهم مشترک</Button>
<Field id="allocation-reason" label="مبنای تخصیص">
<Textarea id="allocation-reason" required maxLength={500} value={view.reason} onChange={event => view.setReason(event.target.value)}/>
</Field>
<FormMessage error>{view.command.error?.message}</FormMessage>
<Button type="submit" busy={view.command.busy}>تأیید تخصیص</Button>
</Form>
</Drawer>; }

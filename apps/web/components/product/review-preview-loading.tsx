import { LoadingState } from "@/components/ui/financial";
import { Skeleton } from "@/components/ui/skeleton";

export function ReviewPreviewLoading() {
  return <LoadingState label="در حال دریافت جزئیات تراکنش" className="gap-7">
    <div aria-hidden="true" className="grid grid-cols-2 gap-5">
      {[0, 1, 2, 3].map(index => <div key={index} className="grid gap-3"><Skeleton className="h-3 w-20" /><Skeleton className="h-7 w-28 max-w-full" /></div>)}
    </div>
    <Skeleton className="h-5 w-40" />
    <div aria-hidden="true" className="grid gap-6 sm:grid-cols-2">
      {[0, 1].map(side => <div key={side} className="grid content-start gap-5"><Skeleton className="h-6 w-24" />{[0, 1, 2, 3].map(row => <div key={row} className="grid gap-3"><Skeleton className="h-3 w-16" /><Skeleton className="h-6 w-3/4" /></div>)}</div>)}
    </div>
  </LoadingState>;
}

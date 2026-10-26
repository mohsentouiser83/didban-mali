import { LoadingState, Skeleton } from "@/components/ui/states";
import { StatCards, StatCard } from "@/components/ui/financial/stat-cards";

export function ResultLoadingView({ titles }: { titles: string[] }) {
  return (
    <LoadingState label="در حال دریافت نتایج مالی">
      <div className="space-y-6">
        <div className="mb-7 space-y-2">
          <Skeleton className="h-10 w-44" />
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="space-y-5 rounded-summary border border-border bg-surface p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-7 w-28" />
          </div>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-52 max-w-full" />
        </div>
        <StatCards>
          {titles.map((title) => (
            <StatCard key={title} title={title} value="" unit="" loading>
              <div className="space-y-3 border-t border-border pt-4">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-9 w-2/3" />
              </div>
            </StatCard>
          ))}
        </StatCards>
      </div>
    </LoadingState>
  );
}

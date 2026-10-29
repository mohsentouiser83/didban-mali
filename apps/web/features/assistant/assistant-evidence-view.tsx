import { AppIcon } from "@/components/ui/app-icon";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LoadingState, ErrorState } from "@/components/ui/states";

export function AssistantEvidenceView({
  loading,
  error,
  description,
  sheet,
  row,
  facts,
  position,
  total,
  first,
  last,
  onClose,
  onPrevious,
  onNext,
  onRetry,
}: {
  loading: boolean;
  error: string | null;
  description: string | null;
  sheet: string | null;
  row: string;
  facts: string[];
  position: string;
  total: string;
  first: boolean;
  last: boolean;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onRetry: () => void;
}) {
  return (
    <Dialog
      icon="MessageCircle"
      open
      title="شواهد پاسخ"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {loading ? (
        <LoadingState layout="compact" label="در حال دریافت شاهد" />
      ) : error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : description ? (
        <div className="space-y-4">
          <p className="leading-8">{description}</p>
          {sheet ? <p className="text-xs text-muted">برگه: {sheet}</p> : null}
          <p className="text-xs text-muted">ردیف: {row}</p>
          {facts.length ? (
            <ul className="space-y-2">
              {facts.map((fact, index) => (
                <li key={index} className="break-all tabular-nums">
                  <bdi>{fact}</bdi>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <nav
        aria-label="مرور شواهد پاسخ"
        className="mt-5 flex items-center justify-between gap-2"
      >
        <Button variant="secondary" disabled={first} onClick={onPrevious}>
          <AppIcon name="ChevronRight" />
          قبلی
        </Button>
        <span className="text-xs text-muted">
          {position} از {total}
        </span>
        <Button variant="secondary" disabled={last} onClick={onNext}>
          <AppIcon name="ChevronLeft" />
          بعدی
        </Button>
      </nav>
    </Dialog>
  );
}

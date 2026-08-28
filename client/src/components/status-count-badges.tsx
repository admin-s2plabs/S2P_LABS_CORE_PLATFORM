import { badgeVariants } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type StatusCountBadgeItem = {
  value: string;
  label: string;
  count: number;
};

type StatusCountBadgesProps = {
  totalCount: number;
  totalLabel?: string;
  items: StatusCountBadgeItem[];
  selected: string;
  onSelect: (value: string) => void;
  loading?: boolean;
  className?: string;
  allValue?: string;
};

export function StatusCountBadges({
  totalCount,
  totalLabel = "Total",
  items,
  selected,
  onSelect,
  loading,
  className,
  allValue = "all",
}: StatusCountBadgesProps) {
  if (loading) {
    return (
      <div className={cn("flex flex-wrap items-center gap-2", className)}>
        <Skeleton className="h-7 w-[7.5rem] rounded-md" />
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-7 w-[5.5rem] rounded-md" />
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn("flex flex-wrap items-center gap-2", className)}
      role="tablist"
      aria-label="Filter by status"
    >
      <button
        type="button"
        onClick={() => onSelect(allValue)}
        className={cn(
          badgeVariants({ variant: selected === allValue ? "default" : "outline" }),
          "cursor-pointer select-none gap-1 font-normal",
        )}
        data-testid="status-count-badge-total"
      >
        {totalLabel}{" "}
        <span className="tabular-nums opacity-90">({totalCount})</span>
      </button>
      {items.map((item) => {
        const active = selected === item.value;
        const testId = `status-count-badge-${item.value.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onSelect(item.value)}
            className={cn(
              badgeVariants({ variant: active ? "default" : "outline" }),
              "cursor-pointer select-none gap-1 font-normal max-w-[min(100%,14rem)]",
            )}
            data-testid={testId}
            title={`${item.label} (${item.count})`}
          >
            <span className="truncate">{item.label}</span>{" "}
            <span className="tabular-nums opacity-90 shrink-0">
              ({item.count})
            </span>
          </button>
        );
      })}
    </div>
  );
}

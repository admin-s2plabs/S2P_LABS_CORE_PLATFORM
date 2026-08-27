import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/common-functions";

export function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  const display = value === undefined || value === null || value === "" ? "—" : value;
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-xs font-medium text-foreground break-words">{display}</span>
    </div>
  );
}

export function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border bg-background/70 p-3", className)}>
      <div className="mb-2.5 text-[11px] font-semibold tracking-wide text-foreground/80 uppercase">
        {title}
      </div>
      {children}
    </div>
  );
}

export function FieldGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-3">{children}</div>;
}

export function StatusPill({
  status,
  tone = "default",
}: {
  status?: string;
  tone?: "default" | "success" | "warning" | "danger" | "info";
}) {
  if (!status) return null;
  const tones: Record<string, string> = {
    default: "bg-muted text-muted-foreground",
    success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    danger: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
    info: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  };
  return (
    <Badge variant="secondary" className={cn("h-5 px-1.5 text-[10px] font-semibold", tones[tone])}>
      {status}
    </Badge>
  );
}

export function fmt(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return String(value);
}

export function fmtDate(value: unknown): string | undefined {
  if (!value) return undefined;
  try {
    return formatDate(new Date(value as string));
  } catch {
    return fmt(value);
  }
}

export function fmtMoney(value: unknown, currency?: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const num = Number(value);
  if (!Number.isFinite(num)) return fmt(value);
  try {
    return new Intl.NumberFormat(undefined, {
      style: currency ? "currency" : "decimal",
      currency: currency || undefined,
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    return `${num.toLocaleString()}${currency ? ` ${currency}` : ""}`;
  }
}

export function ApprovalTimeline({
  history,
}: {
  history?: Array<{
    name?: string;
    email?: string;
    designation?: string;
    status?: string;
    date?: string;
    comments?: string;
    action_by?: string;
    action_date?: string;
    remarks?: string;
  }>;
}) {
  if (!history?.length) return null;
  return (
    <div className="space-y-2">
      {history.map((step, idx) => {
        const status = String(step.status || "").toLowerCase();
        const tone =
          status.includes("approv")
            ? "success"
            : status.includes("reject")
              ? "danger"
              : status.includes("more")
                ? "warning"
                : "info";
        return (
          <div key={idx} className="rounded-md border bg-muted/30 px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium">
                {step.name || step.action_by || "Approver"}
              </span>
              <StatusPill status={step.status || "Pending"} tone={tone as any} />
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground">
              {[step.designation, step.email, fmtDate(step.date || step.action_date)]
                .filter(Boolean)
                .join(" · ")}
            </div>
            {(step.comments || step.remarks) && (
              <p className="mt-1 text-xs text-foreground/80">{step.comments || step.remarks}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function LineItemsTable({
  lines,
  columns,
}: {
  lines: any[];
  columns: Array<{ key: string; label: string; render?: (row: any) => React.ReactNode }>;
}) {
  if (!lines?.length) {
    return <p className="text-xs text-muted-foreground">No line items.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-xs">
        <thead className="bg-muted/50">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className="px-2 py-1.5 text-left font-medium text-muted-foreground">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((row, idx) => (
            <tr key={idx} className="border-t">
              {columns.map((col) => (
                <td key={col.key} className="px-2 py-1.5 align-top">
                  {col.render ? col.render(row) : fmt(row[col.key]) || "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AiSummaryBlock({
  loading,
  error,
  children,
}: {
  loading?: boolean;
  error?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <Section title="AI Summary" className="border-violet-200/80 bg-violet-50/40 dark:border-violet-900/50 dark:bg-violet-950/20">
      {loading && <p className="text-xs text-muted-foreground">Analyzing automatically…</p>}
      {!loading && error && <p className="text-xs text-rose-600">{error}</p>}
      {!loading && !error && children}
      {!loading && !error && !children && (
        <p className="text-xs text-muted-foreground">No AI insights for this item.</p>
      )}
    </Section>
  );
}

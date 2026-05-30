import { cn } from "@/lib/utils";
import type { FileStatus } from "@/lib/types";

const styles: Record<FileStatus, string> = {
  Pending: "bg-muted text-muted-foreground border-border",
  Clean: "bg-success/15 text-success border-success/30 shadow-[0_0_12px_-2px_hsl(var(--success)/0.4)]",
  Suspicious: "bg-warning/15 text-warning border-warning/40 shadow-[0_0_12px_-2px_hsl(var(--warning)/0.4)]",
  Corrupted: "bg-destructive/15 text-destructive border-destructive/40 shadow-[0_0_12px_-2px_hsl(var(--destructive)/0.5)]",
  Repaired: "bg-info/15 text-info border-info/40 shadow-[0_0_12px_-2px_hsl(var(--info)/0.5)]",
};

export function StatusBadge({ status, className }: { status: FileStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        styles[status],
        className,
      )}
    >
      {status}
    </span>
  );
}

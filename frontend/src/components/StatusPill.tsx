import { Declaration, DeclarationStatus } from "@/types/declaration";
import { cn } from "@/lib/utils";

interface StatusPillProps {
  status: DeclarationStatus;
  className?: string;
}

export function StatusPill({ status, className }: StatusPillProps) {
  const statusClasses = {
    Draft: "status-draft",
    Ready: "status-ready",
    Exported: "status-exported",
  };

  return (
    <span className={cn("status-pill", statusClasses[status], className)}>
      {status}
    </span>
  );
}

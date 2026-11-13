import { SANDBOX_CHIP_LABEL, SANDBOX_CHIP_TITLE } from "@/lib/sandboxLabel";

/** The one "Sandbox chips · no cash value" chip shown on every jackpot surface. */
export function SandboxChip({ className, label }: { className?: string; label?: string }) {
  return (
    <span className={`sandbox-chip sandbox-chip-j5${className ? ` ${className}` : ""}`} title={SANDBOX_CHIP_TITLE} data-testid="sandbox-chip">
      {label ?? SANDBOX_CHIP_LABEL}
    </span>
  );
}

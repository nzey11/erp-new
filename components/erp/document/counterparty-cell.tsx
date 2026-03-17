"use client";

import type { ReactNode } from "react";

interface CounterpartyCellProps {
  counterparty: { id: string; name: string } | null | undefined;
  fallback?: ReactNode;
}

/**
 * Renders a counterparty name with a "—" fallback when null.
 * Intentionally simple — no link, no over-abstraction.
 * If linking is required later, extend via optional `href` prop.
 */
export function CounterpartyCell({
  counterparty,
  fallback = "—",
}: CounterpartyCellProps) {
  if (!counterparty) {
    return <span className="text-sm text-muted-foreground">{fallback}</span>;
  }
  return (
    <span className="text-sm text-muted-foreground">{counterparty.name}</span>
  );
}

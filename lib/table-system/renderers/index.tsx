/**
 * Shared Cell Renderers
 *
 * Reusable cell renderers for table presets.
 * Each renderer is a React component that receives value and props.
 */

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/shared/utils";
import type { CellRendererId } from "@/lib/table-system/types";

// === RENDERER PROPS ===

/**
 * Props passed to all cell renderers.
 */
export interface CellRendererProps<TValue = unknown, TRow = unknown> {
  /** Cell value */
  value: TValue;

  /** Full row data */
  row: TRow;

  /** Renderer-specific props from preset */
  props: Record<string, unknown>;
}

// === DATE RENDERER ===

/**
 * Date cell renderer.
 */
export function DateCell({ value }: CellRendererProps<string | null>) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return <span>{new Date(value).toLocaleDateString()}</span>;
}

// === MONEY RENDERER ===

/**
 * Money/currency cell renderer.
 *
 * Props:
 * - currency: Currency code (default: "RUB")
 * - locale: Locale for formatting (default: "ru-RU")
 * - colorBySign: If true, positive values are green, negative are red
 * - showSign: If true, always show +/- sign
 */
export function MoneyCell({ value, props }: CellRendererProps<number | null>) {
  if (value == null) return <span className="text-muted-foreground">—</span>;

  const currency = (props.currency as string) ?? "RUB";
  const locale = (props.locale as string) ?? "ru-RU";
  const colorBySign = (props.colorBySign as boolean) ?? false;
  const showSign = (props.showSign as boolean) ?? false;

  const formatted = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
    signDisplay: showSign ? "always" : undefined,
  }).format(value);

  // Apply color based on sign if enabled
  const colorClass = colorBySign
    ? value >= 0
      ? "text-green-600"
      : "text-red-600"
    : "";

  return (
    <span className={cn("font-medium tabular-nums", colorClass)}>
      {formatted}
    </span>
  );
}

// === NUMBER RENDERER ===

/**
 * Number cell renderer.
 */
export function NumberCell({ value, props }: CellRendererProps<number | null>) {
  if (value == null) return <span className="text-muted-foreground">—</span>;

  const locale = (props.locale as string) ?? "ru-RU";
  const decimals = (props.decimals as number) ?? 0;

  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);

  return <span className="tabular-nums">{formatted}</span>;
}

// === BADGE RENDERER ===

/**
 * Badge cell renderer.
 * Displays value as a badge with configurable variant.
 */
export function BadgeCell({ value, props }: CellRendererProps<string | null>) {
  if (!value) return <span className="text-muted-foreground">—</span>;

  const variantMap = props.variantMap as Record<string, "default" | "secondary" | "destructive" | "outline"> | undefined;
  const labelMap = props.labelMap as Record<string, string> | undefined;

  const variant = variantMap?.[value] ?? "outline";
  const label = labelMap?.[value] ?? value;

  return <Badge variant={variant}>{label}</Badge>;
}

// === STATUS BADGE RENDERER ===

/**
 * Status badge cell renderer.
 * Similar to BadgeCell but with status-specific styling.
 */
export function StatusBadgeCell({ value, props }: CellRendererProps<string | null>) {
  if (!value) return <span className="text-muted-foreground">—</span>;

  const variantMap = props.variantMap as Record<string, "default" | "secondary" | "destructive" | "outline"> | undefined;
  const labelMap = props.labelMap as Record<string, string> | undefined;

  const variant = variantMap?.[value] ?? "secondary";
  const label = labelMap?.[value] ?? value;

  return <Badge variant={variant}>{label}</Badge>;
}

// === PARTY LINK RENDERER ===

/**
 * Party link cell renderer.
 * Displays party name as a link to party detail page.
 */
export function PartyLinkCell({ value, row }: CellRendererProps<string, { id: string }>) {
  if (!value) return <span className="text-muted-foreground">—</span>;

  return (
    <Link
      href={`/crm/parties/${row.id}`}
      className="text-primary hover:underline font-medium"
    >
      {value}
    </Link>
  );
}

// === PARTY LINKS RENDERER ===

/**
 * Link badges cell renderer.
 * Displays array of links as badges.
 *
 * Props:
 * - labelMap: Map of link types to display labels
 */
export function LinkBadgesCell({ value, props }: CellRendererProps<Array<"customer" | "counterparty">>) {
  if (!value || value.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  const labelMap = props.labelMap as Record<string, string> | undefined;

  return (
    <div className="flex gap-1 flex-wrap">
      {value.map((link, index) => {
        const label = labelMap?.[link] ?? link;
        return (
          <Badge key={index} variant="secondary">
            {label}
          </Badge>
        );
      })}
    </div>
  );
}

// === TEXT RENDERER ===

/**
 * Simple text cell renderer.
 */
export function TextCell({ value, props }: CellRendererProps<string | null>) {
  if (!value) {
    const fallback = props.fallback as string | undefined;
    return <span className="text-muted-foreground">{fallback ?? "—"}</span>;
  }

  const className = props.className as string | undefined;
  return <span className={className}>{value}</span>;
}

// === BOOLEAN RENDERER ===

/**
 * Boolean cell renderer.
 */
export function BooleanCell({ value, props }: CellRendererProps<boolean | null>) {
  if (value == null) return <span className="text-muted-foreground">—</span>;

  const trueLabel = (props.trueLabel as string) ?? "Yes";
  const falseLabel = (props.falseLabel as string) ?? "No";

  return (
    <Badge variant={value ? "default" : "secondary"}>
      {value ? trueLabel : falseLabel}
    </Badge>
  );
}

// === RENDERER REGISTRY ===

/**
 * Registry mapping renderer IDs to components.
 */
export const cellRendererRegistry: Record<CellRendererId, React.ComponentType<CellRendererProps>> = {
  money: MoneyCell as React.ComponentType<CellRendererProps>,
  number: NumberCell as React.ComponentType<CellRendererProps>,
  date: DateCell as React.ComponentType<CellRendererProps>,
  datetime: DateCell as React.ComponentType<CellRendererProps>,
  status: StatusBadgeCell as React.ComponentType<CellRendererProps>,
  statusBadge: StatusBadgeCell as React.ComponentType<CellRendererProps>,
  partyLink: PartyLinkCell as React.ComponentType<CellRendererProps>,
  linkBadges: LinkBadgesCell as React.ComponentType<CellRendererProps>,
  documentNumber: TextCell as React.ComponentType<CellRendererProps>,
  productName: TextCell as React.ComponentType<CellRendererProps>,
  badge: BadgeCell as React.ComponentType<CellRendererProps>,
  image: TextCell as React.ComponentType<CellRendererProps>,
  boolean: BooleanCell as React.ComponentType<CellRendererProps>,
  text: TextCell as React.ComponentType<CellRendererProps>,
};

/**
 * Get a cell renderer by ID.
 */
export function getCellRenderer(id: CellRendererId) {
  return cellRendererRegistry[id];
}

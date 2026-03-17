/**
 * Party Activity Timeline
 *
 * Vertical timeline displaying recent party activities.
 * Shows up to 20 most recent events.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ShoppingCart,
  CreditCard,
  MessageCircle,
  Activity,
  UserPlus,
  Merge,
} from "lucide-react";
import type { PartyProfileActivityDto } from "@/lib/domain/party";

interface PartyActivityTimelineProps {
  activities: PartyProfileActivityDto[];
}

const RECENT_LIMIT = 20;

export function PartyActivityTimeline({ activities }: PartyActivityTimelineProps) {
  const recentActivities = activities.slice(0, RECENT_LIMIT);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Активность
        </CardTitle>
      </CardHeader>
      <CardContent>
        {recentActivities.length > 0 ? (
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />

            <div className="space-y-4">
              {recentActivities.map((activity) => (
                <ActivityItem key={activity.id} activity={activity} />
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <Activity className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground">Нет записей об активности</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface ActivityItemProps {
  activity: PartyProfileActivityDto;
}

function ActivityItem({ activity }: ActivityItemProps) {
  const config = ACTIVITY_CONFIG[activity.type] || ACTIVITY_CONFIG.default;

  return (
    <div className="flex gap-3 relative">
      {/* Icon dot on timeline */}
      <div className="relative z-10 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
        <config.icon className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Content */}
      <div className="flex-1 pb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{config.label}</span>
          <span className="text-xs text-muted-foreground">
            {formatDate(activity.occurredAt)}
          </span>
        </div>
        <ActivitySummary type={activity.type} summary={activity.summary} />
      </div>
    </div>
  );
}

interface ActivitySummaryProps {
  type: string;
  summary: Record<string, unknown>;
}

function ActivitySummary({ type, summary }: ActivitySummaryProps) {
  switch (type) {
    case "order_placed": {
      const orderNumber = String(summary.orderNumber ?? "");
      const totalAmount = summary.totalAmount ? formatCurrency(Number(summary.totalAmount)) : null;
      return (
        <p className="text-sm text-muted-foreground mt-1">
          Заказ #{orderNumber}{totalAmount && ` на ${totalAmount}`}
        </p>
      );
    }
    case "payment_received": {
      const amount = summary.amount ? formatCurrency(Number(summary.amount)) : null;
      const method = summary.method ? String(summary.method) : null;
      return (
        <p className="text-sm text-muted-foreground mt-1">
          {amount}{method && ` (${method})`}
        </p>
      );
    }
    case "manager_interaction": {
      const subject = String(summary.subject ?? "");
      return (
        <p className="text-sm text-muted-foreground mt-1">
          {subject}
        </p>
      );
    }
    default:
      return null;
  }
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(isoString: string | Date): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return "Сегодня";
  } else if (diffDays === 1) {
    return "Вчера";
  } else if (diffDays < 7) {
    return `${diffDays} дн. назад`;
  } else {
    return date.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "short",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  }
}

const ACTIVITY_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string }> = {
  order_placed: {
    icon: ShoppingCart,
    label: "Заказ оформлен",
  },
  payment_received: {
    icon: CreditCard,
    label: "Оплата получена",
  },
  manager_interaction: {
    icon: MessageCircle,
    label: "Взаимодействие",
  },
  owner_assigned: {
    icon: UserPlus,
    label: "Назначен владелец",
  },
  merge_completed: {
    icon: Merge,
    label: "Объединение",
  },
  default: {
    icon: Activity,
    label: "Событие",
  },
};

/**
 * Merge Empty State
 *
 * Empty state for merge admin when no pending requests.
 */

import { Merge } from "lucide-react";

export function MergeEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 border rounded-md bg-muted/30">
      <Merge className="h-12 w-12 text-muted-foreground mb-4" />
      <h3 className="text-lg font-medium mb-2">Нет запросов на слияние</h3>
      <p className="text-muted-foreground text-center max-w-md">
        Запросы на слияние появятся автоматически при обнаружении дубликатов партий
      </p>
    </div>
  );
}

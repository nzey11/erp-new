/**
 * Party Empty State
 *
 * Empty state component for party list.
 * Differentiates between "no parties at all" and "no matches for filters".
 */

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Users } from "lucide-react";

interface PartyEmptyStateProps {
  hasFilters: boolean;
}

export function PartyEmptyState({ hasFilters }: PartyEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 border rounded-md bg-muted/30">
      <Users className="h-12 w-12 text-muted-foreground mb-4" />
      
      <h3 className="text-lg font-medium mb-2">
        {hasFilters ? "Партии не найдены" : "Пока нет партий"}
      </h3>
      
      {hasFilters ? (
        <>
          <p className="text-muted-foreground mb-4">
            Попробуйте изменить параметры поиска
          </p>
          <Button variant="outline" asChild>
            <Link href="/crm/parties">Сбросить фильтры</Link>
          </Button>
        </>
      ) : (
        <p className="text-muted-foreground">
          Партии появятся автоматически при создании заказов и контрагентов
        </p>
      )}
    </div>
  );
}

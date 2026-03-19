/**
 * Party Pager
 *
 * Pagination component for party list.
 * Preserves current filters when navigating between pages.
 */

import Link from "next/link";
import { Button } from "antd";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PartyListParams } from "../_lib";
import { buildPaginationQueryString } from "../_lib";

interface PartyPagerProps {
  total: number;
  page: number;
  pageSize: number;
  params: PartyListParams;
}

export function PartyPager({ total, page, pageSize, params }: PartyPagerProps) {
  const totalPages = Math.ceil(total / pageSize);
  
  // Don't show pager if only one page
  if (totalPages <= 1) {
    return null;
  }

  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  const prevPage = page - 1;
  const nextPage = page + 1;

  return (
    <div className="flex items-center justify-between py-4">
      <p className="text-sm text-muted-foreground">
        Показано {Math.min((page - 1) * pageSize + 1, total)}–{Math.min(page * pageSize, total)} из {total}
      </p>

      <div className="flex items-center gap-2">
        <Link
          href={`/crm/parties${buildPaginationQueryString(params, prevPage)}`}
          aria-disabled={!hasPrev}
          tabIndex={hasPrev ? undefined : -1}
        >
          <Button
            variant="outlined"
            size="small"
            disabled={!hasPrev}
            icon={<ChevronLeft className="h-4 w-4" />}
          >
            Назад
          </Button>
        </Link>

        <span className="text-sm">
          {page} / {totalPages}
        </span>

        <Link
          href={`/crm/parties${buildPaginationQueryString(params, nextPage)}`}
          aria-disabled={!hasNext}
          tabIndex={hasNext ? undefined : -1}
        >
          <Button
            variant="outlined"
            size="small"
            disabled={!hasNext}
            icon={<ChevronRight className="h-4 w-4" />}
          >
            Вперёд
          </Button>
        </Link>
      </div>
    </div>
  );
}

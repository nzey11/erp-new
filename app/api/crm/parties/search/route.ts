/**
 * Party Search API
 *
 * Search parties by name for merge operations.
 */

import { NextRequest, NextResponse } from "next/server";
import { listParties } from "@/lib/domain/party/queries";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q") ?? "";

  if (query.length < 2) {
    return NextResponse.json({ parties: [] });
  }

  const result = await listParties(
    { search: query, includeMerged: false },
    1,
    10
  );

  return NextResponse.json({ parties: result.items });
}

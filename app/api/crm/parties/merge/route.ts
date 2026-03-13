/**
 * Party Merge API
 *
 * Execute party merge operation.
 */

import { NextRequest, NextResponse } from "next/server";
import { executeMerge } from "@/lib/party";
import { requirePermission } from "@/lib/shared/authorization";

export async function POST(request: NextRequest) {
  try {
    await requirePermission("crm:merge");

    const body = await request.json();
    const { survivorId, victimId } = body;

    if (!survivorId || !victimId) {
      return NextResponse.json(
        { error: "survivorId and victimId are required" },
        { status: 400 }
      );
    }

    if (survivorId === victimId) {
      return NextResponse.json(
        { error: "Cannot merge a party with itself" },
        { status: 400 }
      );
    }

    await executeMerge(survivorId, victimId);

    return NextResponse.json({
      success: true,
      survivorId,
      victimId,
    });
  } catch (error) {
    console.error("Merge error:", error);

    if (error instanceof Error) {
      if (error.message.includes("not found")) {
        return NextResponse.json(
          { error: error.message },
          { status: 404 }
        );
      }
      if (error.message.includes("already merged")) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to merge parties" },
      { status: 500 }
    );
  }
}

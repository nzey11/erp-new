import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/shared/auth";

export async function GET() {
  const user = await getAuthSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ user });
}

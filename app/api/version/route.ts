import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

export const runtime = "nodejs";

interface ReleaseMetadata {
  releaseId: string;
  gitSha: string;
  gitRef: string;
  builtAt: string;
}

export async function GET() {
  try {
    const filePath = join(process.cwd(), "release.json");
    const raw = readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as ReleaseMetadata;
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { releaseId: "unknown", gitSha: "unknown", builtAt: "unknown" },
      { status: 200 }
    );
  }
}

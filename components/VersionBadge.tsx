"use client";

import { useEffect, useState } from "react";

interface ReleaseInfo {
  releaseId: string;
  gitSha: string;
}

export function VersionBadge() {
  const [info, setInfo] = useState<ReleaseInfo | null>(null);

  useEffect(() => {
    fetch("/api/version")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.releaseId && data.releaseId !== "unknown") {
          setInfo({ releaseId: data.releaseId, gitSha: data.gitSha ?? "" });
        }
      })
      .catch(() => {});
  }, []);

  if (!info) return null;

  // releaseId format: 20260313-195300 — show last 9 chars (date-time)
  const shortId = info.releaseId.slice(-13);
  const shortSha = info.gitSha?.slice(0, 7);

  return (
    <div className="px-3 py-1.5 border-t mt-1">
      <p className="text-[10px] text-muted-foreground/40 font-mono leading-tight select-none">
        rel {shortId}
        {shortSha && (
          <span className="text-muted-foreground/30"> · {shortSha}</span>
        )}
      </p>
    </div>
  );
}

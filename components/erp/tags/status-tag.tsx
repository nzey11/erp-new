"use client";

import { Tag } from "antd";

/**
 * Maps a status key to a human-readable label and antd Tag color.
 *
 * Example:
 *   const statusMap: StatusMap = {
 *     active:   { label: "Активен",   color: "success" },
 *     inactive: { label: "Неактивен", color: "default" },
 *   };
 */
export type StatusMap = Record<string, { label: string; color: string }>;

interface StatusTagProps {
  status: string;
  statusMap: StatusMap;
}

/**
 * Renders an antd <Tag> based on a status key looked up in statusMap.
 * Falls back to rendering the raw status string in a default-colored tag
 * when the key is not found in the map.
 */
export function StatusTag({ status, statusMap }: StatusTagProps) {
  const entry = statusMap[status];

  if (!entry) {
    return (
      <Tag variant="filled">{status}</Tag>
    );
  }

  return (
    <Tag color={entry.color} variant="filled">
      {entry.label}
    </Tag>
  );
}

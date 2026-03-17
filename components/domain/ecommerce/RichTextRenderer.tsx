"use client";

import { cn } from "@/lib/shared/utils";

interface RichTextRendererProps {
  content: string;
  className?: string;
}

export function RichTextRenderer({ content, className }: RichTextRendererProps) {
  return (
    <div
      className={cn(
        "prose prose-sm max-w-none",
        "[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-3 [&_h1]:mt-6 first:[&_h1]:mt-0",
        "[&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:mt-5",
        "[&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4",
        "[&_p]:mb-3 [&_p]:leading-relaxed",
        "[&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-6",
        "[&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-6",
        "[&_li]:mb-1",
        "[&_a]:text-primary [&_a]:underline [&_a]:hover:text-primary/80",
        "[&_blockquote]:border-l-4 [&_blockquote]:border-muted-foreground/30 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:my-4",
        "[&_code]:bg-muted [&_code]:px-1 [&_code]:rounded [&_code]:text-sm",
        "[&_img]:rounded-lg [&_img]:max-w-full [&_img]:my-4",
        "[&_hr]:border-border [&_hr]:my-6",
        "[&_strong]:font-semibold",
        className
      )}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}

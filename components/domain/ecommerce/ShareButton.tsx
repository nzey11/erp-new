"use client";

import { useState } from "react";
import { Link2, Send, MessageCircle, Check } from "lucide-react";
import { Dropdown, Button } from "antd";
import type { MenuProps } from "antd";
import { toast } from "sonner";

interface ShareButtonProps {
  title: string;
  url?: string;
}

export function ShareButton({ title, url }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const shareUrl = url || (typeof window !== "undefined" ? window.location.href : "");

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Ссылка скопирована");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Не удалось скопировать ссылку");
    }
  };

  const handleTelegram = () => {
    window.open(
      `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(title)}`,
      "_blank"
    );
  };

  const handleWhatsApp = () => {
    window.open(
      `https://wa.me/?text=${encodeURIComponent(`${title} ${shareUrl}`)}`,
      "_blank"
    );
  };

  const items: MenuProps["items"] = [
    {
      key: "copy",
      label: "Копировать ссылку",
      icon: <Link2 className="h-4 w-4" />,
      onClick: handleCopyLink,
    },
    {
      key: "telegram",
      label: "Telegram",
      icon: <Send className="h-4 w-4" />,
      onClick: handleTelegram,
    },
    {
      key: "whatsapp",
      label: "WhatsApp",
      icon: <MessageCircle className="h-4 w-4" />,
      onClick: handleWhatsApp,
    },
  ];

  return (
    <Dropdown menu={{ items }} trigger={["click"]}>
      <Button variant="outlined" shape="circle" icon={copied ? <Check className="h-4 w-4 text-green-600" /> : <Link2 className="h-4 w-4" />} />
    </Dropdown>
  );
}

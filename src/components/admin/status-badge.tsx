"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

const variants: Record<string, "default" | "secondary" | "success" | "warning" | "destructive"> = {
  QUEUED: "secondary",
  EXTRACTING: "warning",
  GENERATING: "warning",
  RENDERING: "warning",
  READY: "success",
  FAILED: "destructive",
  CANCELLED: "secondary",
};

export function StatusBadge({ status }: { status: string }) {
  const t = useTranslations("admin.status");
  return <Badge variant={variants[status] ?? "secondary"}>{t(status as Parameters<typeof t>[0])}</Badge>;
}

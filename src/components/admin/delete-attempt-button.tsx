"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export function DeleteAttemptButton({ attemptId }: { attemptId: string }) {
  const t = useTranslations("results");
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function remove() {
    if (!window.confirm(t("deleteAttemptConfirm"))) return;
    setPending(true);
    try {
      const response = await fetch(`/api/admin/attempts/${attemptId}`, { method: "DELETE" });
      if (response.ok) router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={remove} disabled={pending} aria-label={t("deleteAttempt")}>
      <Trash2 className="h-4 w-4 text-destructive" aria-hidden />
    </Button>
  );
}

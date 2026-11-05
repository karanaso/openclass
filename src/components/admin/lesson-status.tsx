"use client";

import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/admin/status-badge";
import { useRouter } from "@/i18n/navigation";

const terminal = new Set(["READY", "FAILED", "CANCELLED"]);

export function LessonStatus({
  lessonId,
  initialStatus,
  initialFailureReason,
}: {
  lessonId: string;
  initialStatus: string;
  initialFailureReason: string | null;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [failure, setFailure] = useState(initialFailureReason);
  const router = useRouter();

  useEffect(() => {
    setStatus(initialStatus);
    setFailure(initialFailureReason);
  }, [initialStatus, initialFailureReason]);

  useEffect(() => {
    if (terminal.has(initialStatus)) return;

    let source: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let stopped = false;

    const apply = (next: { status: string; failureReason: string | null }) => {
      setStatus(next.status);
      setFailure(next.failureReason);
      if (terminal.has(next.status)) {
        source?.close();
        if (poll) clearInterval(poll);
        router.refresh();
      }
    };

    const startPolling = () => {
      if (stopped || poll) return;
      poll = setInterval(async () => {
        try {
          const response = await fetch(`/api/admin/lessons/${lessonId}`, { cache: "no-store" });
          if (!response.ok) return;
          const data = await response.json();
          apply({ status: data.lesson.status, failureReason: data.lesson.failureReason });
        } catch {
          // keep polling
        }
      }, 3000);
    };

    try {
      source = new EventSource(`/api/admin/lessons/${lessonId}/events`);
      source.onmessage = (event) => {
        try {
          apply(JSON.parse(event.data));
        } catch {
          // ignore malformed event
        }
      };
      source.onerror = () => {
        source?.close();
        startPolling();
      };
    } catch {
      startPolling();
    }

    return () => {
      stopped = true;
      source?.close();
      if (poll) clearInterval(poll);
    };
  }, [lessonId, initialStatus, router]);

  return (
    <div className="flex flex-col items-end gap-1">
      <span data-testid="lesson-status" data-status={status}>
        <StatusBadge status={status} />
      </span>
      {failure ? <p className="max-w-xs text-right text-xs text-red-700">{failure}</p> : null}
    </div>
  );
}

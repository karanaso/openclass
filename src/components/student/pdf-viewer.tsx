"use client";

import { ExternalLink, Maximize2, Minimize2, RotateCcw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type ViewerState = "loading" | "ready" | "error" | "unauthorized";

export function PdfViewer({ token, url }: { token: string; url: string }) {
  const t = useTranslations("student");
  const locale = useLocale();
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<ViewerState>("loading");
  const [attempt, setAttempt] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState("loading");

    fetch(url, {
      headers: { Range: "bytes=0-0" },
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => {
        void response.body?.cancel().catch(() => undefined);
        if (!active) return;
        if (response.status === 401) {
          setState("unauthorized");
        } else {
          setState(response.ok ? "ready" : "error");
        }
      })
      .catch(() => {
        if (active && !controller.signal.aborted) setState("error");
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [url, attempt]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  async function toggleFullscreen() {
    const element = containerRef.current;
    if (!element) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      if (!document.fullscreenEnabled || !element.requestFullscreen) throw new Error("unsupported");
      await element.requestFullscreen();
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  const nameHref = `/${locale}/s/${encodeURIComponent(token)}`;

  return (
    <div
      ref={containerRef}
      data-testid="pdf-viewer"
      className={fullscreen ? "flex h-screen w-screen flex-col gap-2 bg-background p-2" : "space-y-3"}
    >
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label={t("pdfTitle")}>
        <Button variant="outline" size="sm" onClick={toggleFullscreen} data-testid="pdf-fullscreen">
          {fullscreen ? <Minimize2 className="h-4 w-4" aria-hidden /> : <Maximize2 className="h-4 w-4" aria-hidden />}
          {fullscreen ? t("pdfExitFullScreen") : t("pdfFullScreen")}
        </Button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="pdf-open"
          className="inline-flex h-8 items-center gap-2 rounded-md border border-input bg-card px-3 text-xs font-semibold hover:bg-secondary"
        >
          <ExternalLink className="h-4 w-4" aria-hidden />
          {t("pdfOpen")}
        </a>
      </div>

      {state === "ready" ? (
        <iframe
          data-testid="pdf-frame"
          title={t("pdfTitle")}
          src={url}
          className={`w-full rounded-2xl border bg-card ${
            fullscreen ? "min-h-0 flex-1" : "h-[70vh] min-h-[420px] max-h-[900px]"
          }`}
        />
      ) : null}

      {state === "loading" ? (
        <div className="rounded-2xl border border-dashed bg-card p-10 text-center text-muted-foreground" aria-busy="true">
          {t("pdfLoading")}
        </div>
      ) : null}

      {state === "unauthorized" ? (
        <div className="space-y-3 rounded-2xl border border-dashed bg-card p-10 text-center" data-testid="pdf-session-expired">
          <p className="text-muted-foreground">{t("pdfSessionExpired")}</p>
          <a
            href={nameHref}
            data-testid="pdf-reenter-name"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            {t("pdfReenterName")}
          </a>
        </div>
      ) : null}

      {state === "error" ? (
        <div className="space-y-3 rounded-2xl border border-dashed bg-card p-10 text-center" data-testid="pdf-error">
          <p className="text-muted-foreground">{t("pdfUnavailable")}</p>
          <Button variant="outline" size="sm" onClick={() => setAttempt((value) => value + 1)} data-testid="pdf-retry">
            <RotateCcw className="h-4 w-4" aria-hidden />
            {t("pdfRetry")}
          </Button>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">{t("pdfDownloadHelp")}</p>
    </div>
  );
}

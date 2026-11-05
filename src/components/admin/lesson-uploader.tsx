"use client";

import { CheckCircle2, FileUp, FolderOpen, Upload, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type UploadFileResult = {
  filename: string;
  status: "accepted" | "rejected" | "duplicate";
  lessonId?: string;
  reason?: string;
};

type ResultWithFile = UploadFileResult & { file?: File };

export function LessonUploader({ classId }: { classId: string }) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const router = useRouter();
  const filesRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const [results, setResults] = useState<ResultWithFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    folderRef.current?.setAttribute("webkitdirectory", "");
    folderRef.current?.setAttribute("directory", "");
  }, []);

  async function upload(files: File[], allowDuplicates = false) {
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      for (const file of files) form.append("files", file);
      if (allowDuplicates) form.append("allowDuplicates", "1");

      const response = await fetch(`/api/admin/classes/${classId}/lessons`, { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error?.message ?? t("uploadFailed"));
        return;
      }
      setResults((current) => [...data.results.map((result: UploadFileResult, index: number) => ({ ...result, file: files[index] })), ...current]);
      router.refresh();
    } catch {
      setError(t("uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  function onFiles(list: FileList | null) {
    if (!list) return;
    void upload(Array.from(list));
  }

  return (
    <div className="space-y-4">
      {error ? <Alert variant="error">{error}</Alert> : null}

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          onFiles(event.dataTransfer.files);
        }}
        className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          dragging ? "border-primary bg-primary/5" : "border-input"
        }`}
        data-testid="upload-dropzone"
      >
        <FileUp className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
        <p className="mt-3 text-sm font-medium">{t("dropFiles")}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("uploadHint")}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button type="button" variant="outline" onClick={() => filesRef.current?.click()} disabled={uploading}>
            <Upload className="h-4 w-4" aria-hidden />
            {t("chooseFiles")}
          </Button>
          <Button type="button" variant="outline" onClick={() => folderRef.current?.click()} disabled={uploading}>
            <FolderOpen className="h-4 w-4" aria-hidden />
            {t("chooseFolder")}
          </Button>
        </div>
        {uploading ? <p className="mt-3 text-sm text-primary">{t("uploading")}</p> : null}
        <input
          ref={filesRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          data-testid="lesson-file-input"
          onChange={(event) => {
            onFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <input
          ref={folderRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          data-testid="lesson-folder-input"
          onChange={(event) => {
            onFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {results.length > 0 ? (
        <div className="space-y-2" data-testid="upload-results">
          {results.map((result, index) => (
            <div key={`${result.filename}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
              <span className="flex items-center gap-2">
                {result.status === "accepted" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
                ) : (
                  <XCircle className="h-4 w-4 text-red-600" aria-hidden />
                )}
                {result.filename}
              </span>
              <span className="flex items-center gap-2">
                <Badge variant={result.status === "accepted" ? "success" : result.status === "duplicate" ? "warning" : "destructive"}>
                  {result.status === "accepted"
                    ? t("acceptedFiles")
                    : result.status === "duplicate"
                      ? t("duplicateFiles")
                      : t("rejectedFiles")}
                </Badge>
                {result.reason ? <span className="text-xs text-muted-foreground">{result.reason}</span> : null}
                {result.status === "duplicate" && result.file ? (
                  <Button size="sm" variant="outline" onClick={() => upload([result.file!], true)} disabled={uploading}>
                    {t("keepDuplicate")}
                  </Button>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {results.some((result) => result.status === "duplicate") ? (
        <Alert variant="warning">{t("duplicateWarning")}</Alert>
      ) : null}
      {uploading ? <span className="sr-only">{tc("loading")}</span> : null}
    </div>
  );
}

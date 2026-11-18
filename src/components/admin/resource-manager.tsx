"use client";

import { Pencil, Plus, Save, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { useRouter } from "@/i18n/navigation";
import { parseResourceUrl } from "@/lib/resources";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LessonResourceView } from "@/server/services/resources";

type EditDraft = { title: string; url: string; description: string };
type RowStatus = "idle" | "saving" | "saved" | "error";

function draftFor(resource: LessonResourceView): EditDraft {
  return {
    title: resource.title,
    url: resource.url,
    description: resource.description ?? "",
  };
}

export function ResourceManager({
  lessonId,
  initialResources,
}: {
  lessonId: string;
  initialResources: LessonResourceView[];
}) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const router = useRouter();
  const [resources, setResources] = useState(initialResources);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [createStatus, setCreateStatus] = useState<RowStatus>("idle");
  const [createError, setCreateError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, EditDraft>>(() =>
    Object.fromEntries(initialResources.map((resource) => [resource.id, draftFor(resource)])),
  );
  const [rowStatus, setRowStatus] = useState<Record<string, RowStatus>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const parsed = url.trim() ? parseResourceUrl(url) : null;
  const detectedKind = parsed?.ok ? parsed.value.kind : null;

  function updateDraft(id: string, field: keyof EditDraft, value: string) {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], [field]: value } }));
    setRowStatus((current) => (current[id] === "saved" ? { ...current, [id]: "idle" } : current));
    setRowErrors((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !url.trim()) {
      setCreateStatus("error");
      setCreateError(t("resourceFieldsRequired"));
      return;
    }
    if (parsed && !parsed.ok) {
      setCreateStatus("error");
      setCreateError(t("resourceUrlInvalid"));
      return;
    }

    setCreateStatus("saving");
    setCreateError(null);
    try {
      const response = await fetch(`/api/admin/lessons/${lessonId}/resources`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          url: url.trim(),
          description: description.trim() || null,
        }),
      });
      const data = (await response.json().catch(() => null)) as {
        resource?: LessonResourceView;
        error?: { code?: string };
      } | null;
      if (!response.ok || !data?.resource) {
        setCreateStatus("error");
        setCreateError(
          data?.error?.code === "duplicate_resource"
            ? t("resourceDuplicate")
            : data?.error?.code === "validation_error" || data?.error?.code === "invalid_url"
              ? t("resourceUrlInvalid")
              : t("resourceCreateFailed"),
        );
        return;
      }

      const resource = data.resource;
      setResources((current) => [...current, resource]);
      setDrafts((current) => ({ ...current, [resource.id]: draftFor(resource) }));
      setTitle("");
      setUrl("");
      setDescription("");
      setCreateStatus("saved");
      router.refresh();
    } catch {
      setCreateStatus("error");
      setCreateError(t("resourceCreateFailed"));
    }
  }

  async function save(id: string) {
    const draft = drafts[id];
    if (!draft || !draft.title.trim() || !draft.url.trim()) {
      setRowStatus((current) => ({ ...current, [id]: "error" }));
      setRowErrors((current) => ({ ...current, [id]: t("resourceFieldsRequired") }));
      return;
    }

    setRowStatus((current) => ({ ...current, [id]: "saving" }));
    setRowErrors((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });

    try {
      const response = await fetch(`/api/admin/lessons/${lessonId}/resources/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: draft.title.trim(),
          url: draft.url.trim(),
          description: draft.description.trim() || null,
        }),
      });
      const data = (await response.json().catch(() => null)) as { resource?: LessonResourceView } | null;
      if (!response.ok || !data?.resource) throw new Error("save failed");

      const resource = data.resource;
      setResources((current) => current.map((item) => (item.id === id ? resource : item)));
      setDrafts((current) => ({ ...current, [id]: draftFor(resource) }));
      setRowStatus((current) => ({ ...current, [id]: "saved" }));
      setEditingId(null);
      router.refresh();
    } catch {
      setRowStatus((current) => ({ ...current, [id]: "error" }));
      setRowErrors((current) => ({ ...current, [id]: t("resourceSaveFailed") }));
    }
  }

  async function setStatus(id: string, status: "APPROVED" | "DISMISSED") {
    setRowStatus((current) => ({ ...current, [id]: "saving" }));
    setRowErrors((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });

    try {
      const response = await fetch(`/api/admin/lessons/${lessonId}/resources/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = (await response.json().catch(() => null)) as { resource?: LessonResourceView } | null;
      if (!response.ok || !data?.resource) throw new Error("status failed");

      if (status === "DISMISSED") {
        setResources((current) => current.filter((item) => item.id !== id));
      } else {
        const resource = data.resource;
        setResources((current) => current.map((item) => (item.id === id ? resource : item)));
        setDrafts((current) => ({ ...current, [id]: draftFor(resource) }));
      }
      setRowStatus((current) => ({ ...current, [id]: "saved" }));
      router.refresh();
    } catch {
      setRowStatus((current) => ({ ...current, [id]: "error" }));
      setRowErrors((current) => ({ ...current, [id]: t("resourceStatusFailed") }));
    }
  }

  async function remove(id: string) {
    if (!window.confirm(t("resourceDeleteConfirm"))) return;
    setRowStatus((current) => ({ ...current, [id]: "saving" }));
    try {
      const response = await fetch(`/api/admin/lessons/${lessonId}/resources/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("delete failed");
      setResources((current) => current.filter((item) => item.id !== id));
      router.refresh();
    } catch {
      setRowStatus((current) => ({ ...current, [id]: "error" }));
      setRowErrors((current) => ({ ...current, [id]: t("resourceDeleteFailed") }));
    }
  }

  const suggestions = resources.filter((resource) => resource.status === "SUGGESTED");
  const approved = resources.filter((resource) => resource.status === "APPROVED");

  function renderRow(resource: LessonResourceView, index: number) {
    const status = rowStatus[resource.id] ?? "idle";
    const editing = editingId === resource.id;
    const draft = drafts[resource.id] ?? draftFor(resource);
    const sourceKey =
      resource.source === "MANUAL"
        ? "sourceManual"
        : resource.source === "TEXT"
          ? "sourceText"
          : resource.source === "ANNOTATION"
            ? "sourceAnnotation"
            : "sourceQr";

    return (
      <div
        key={resource.id}
        className="space-y-3 rounded-xl border p-4"
        data-testid={`resource-item-${index}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <p className="font-semibold">{resource.title}</p>
            <p className="break-all text-xs text-muted-foreground">{resource.url}</p>
            {resource.description ? (
              <p className="text-sm text-muted-foreground">{resource.description}</p>
            ) : null}
            <div className="flex flex-wrap gap-1.5 text-xs">
              <span className="rounded-full border px-2 py-0.5">
                {resource.kind === "YOUTUBE" ? t("resourceKindYoutube") : t("resourceKindLink")}
              </span>
              <span className="rounded-full border px-2 py-0.5">{t(sourceKey)}</span>
              {resource.sourcePage ? (
                <span className="rounded-full border px-2 py-0.5">
                  {t("resourceSourcePage", { page: resource.sourcePage })}
                </span>
              ) : null}
              {resource.status === "SUGGESTED" ? (
                <span className="rounded-full bg-secondary px-2 py-0.5 font-semibold">
                  {t("resourceSuggested")}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEditingId(editing ? null : resource.id)}
              data-testid={`resource-edit-${index}`}
            >
              <Pencil className="h-4 w-4" aria-hidden />
              {editing ? t("resourceCloseEdit") : t("resourceEdit")}
            </Button>
            {resource.status === "SUGGESTED" ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setStatus(resource.id, "APPROVED")}
                  disabled={status === "saving"}
                  data-testid={`resource-approve-${index}`}
                >
                  {t("resourceApprove")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setStatus(resource.id, "DISMISSED")}
                  disabled={status === "saving"}
                  data-testid={`resource-dismiss-${index}`}
                >
                  {t("resourceDismiss")}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => remove(resource.id)}
                disabled={status === "saving"}
                data-testid={`resource-delete-${index}`}
              >
                {t("resourceDelete")}
              </Button>
            )}
          </div>
        </div>

        {editing ? (
          <div className="grid gap-3 rounded-lg bg-secondary/30 p-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor={`resource-title-${index}`}>{t("resourceTitleLabel")}</Label>
              <Input
                id={`resource-title-${index}`}
                value={draft.title}
                onChange={(event) => updateDraft(resource.id, "title", event.target.value)}
                data-testid={`resource-edit-title-${index}`}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`resource-url-${index}`}>{t("resourceUrlLabel")}</Label>
              <Input
                id={`resource-url-${index}`}
                value={draft.url}
                onChange={(event) => updateDraft(resource.id, "url", event.target.value)}
                data-testid={`resource-edit-url-${index}`}
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor={`resource-description-${index}`}>{t("resourceDescriptionLabel")}</Label>
              <Textarea
                id={`resource-description-${index}`}
                value={draft.description}
                onChange={(event) => updateDraft(resource.id, "description", event.target.value)}
                data-testid={`resource-edit-description-${index}`}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 md:col-span-2">
              <Button
                type="button"
                onClick={() => save(resource.id)}
                disabled={status === "saving"}
                data-testid={`resource-save-${index}`}
              >
                <Save className="h-4 w-4" aria-hidden />
                {status === "saving" ? t("resourceSaving") : t("resourceSave")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setEditingId(null);
                  setDrafts((current) => ({ ...current, [resource.id]: draftFor(resource) }));
                }}
              >
                <X className="h-4 w-4" aria-hidden />
                {t("resourceCancel")}
              </Button>
            </div>
          </div>
        ) : null}

        {status === "saved" ? <p className="text-sm text-primary">{t("resourceSaved")}</p> : null}
        {rowErrors[resource.id] ? <Alert variant="error">{rowErrors[resource.id]}</Alert> : null}
      </div>
    );
  }

  return (
    <Card data-testid="resource-manager">
      <CardHeader>
        <CardTitle className="text-base">{t("resourcesTitle")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("resourcesHint")}</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <form className="space-y-3 rounded-xl border p-4" onSubmit={create}>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="new-resource-title">{t("resourceTitleLabel")}</Label>
              <Input
                id="new-resource-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t("resourceTitlePlaceholder")}
                data-testid="new-resource-title"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-resource-url">{t("resourceUrlLabel")}</Label>
              <Input
                id="new-resource-url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com/article"
                data-testid="new-resource-url"
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="new-resource-description">
                {t("resourceDescriptionLabel")}{" "}
                <span className="text-muted-foreground">({tc("optional")})</span>
              </Label>
              <Textarea
                id="new-resource-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                data-testid="new-resource-description"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={createStatus === "saving"} data-testid="new-resource-save">
              <Plus className="h-4 w-4" aria-hidden />
              {createStatus === "saving" ? t("resourceSaving") : t("resourceAdd")}
            </Button>
            {detectedKind ? (
              <span className="text-sm text-muted-foreground" data-testid="new-resource-hint">
                {t("resourceDetectedKind", {
                  kind: detectedKind === "YOUTUBE" ? t("resourceKindYoutube") : t("resourceKindLink"),
                })}
              </span>
            ) : null}
            {createStatus === "saved" ? (
              <span className="text-sm text-primary">{t("resourceAdded")}</span>
            ) : null}
          </div>
          {createError ? <Alert variant="error">{createError}</Alert> : null}
        </form>

        {resources.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("resourcesEmpty")}</p>
        ) : null}

        {suggestions.length > 0 ? (
          <div className="space-y-3">
            <h4 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
              {t("resourceSuggestionsTitle", { count: suggestions.length })}
            </h4>
            {suggestions.map((resource) => renderRow(resource, resources.indexOf(resource)))}
          </div>
        ) : null}

        {approved.length > 0 ? (
          <div className="space-y-3">
            <h4 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
              {t("resourceApprovedTitle")}
            </h4>
            {approved.map((resource) => renderRow(resource, resources.indexOf(resource)))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

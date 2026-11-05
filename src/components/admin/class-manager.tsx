"use client";

import { ArrowDown, ArrowUp, GripVertical, Pencil, Plus, Trash2, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import type { Locale } from "@/lib/locale";
import { formatDate } from "@/lib/format";
import type { ClassSummary } from "@/types/admin";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = { initialClasses: ClassSummary[] };

export function ClassManager({ initialClasses }: Props) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const locale = useLocale() as Locale;
  const router = useRouter();

  const [classes, setClasses] = useState(initialClasses);
  const [newClass, setNewClass] = useState({ name: "", description: "", color: "#2563eb" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "", color: "#2563eb" });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/classes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(newClass),
      });
      if (!response.ok) throw new Error("create failed");
      const data = (await response.json()) as { class: Omit<ClassSummary, "lessonCount"> };
      setClasses((current) => [
        ...current,
        { ...data.class, lessonCount: 0, createdAt: String(data.class.createdAt) },
      ]);
      setNewClass({ name: "", description: "", color: "#2563eb" });
      router.refresh();
    } catch {
      setError(tc("error"));
    } finally {
      setPending(false);
    }
  }

  async function saveEdit(id: string) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/classes/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (!response.ok) throw new Error("save failed");
      const data = (await response.json()) as { class: Omit<ClassSummary, "lessonCount"> };
      setClasses((current) =>
        current.map((item) =>
          item.id === id ? { ...item, ...data.class, lessonCount: item.lessonCount, createdAt: String(data.class.createdAt) } : item,
        ),
      );
      setEditingId(null);
      router.refresh();
    } catch {
      setError(tc("error"));
    } finally {
      setPending(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm(t("deleteClassConfirm"))) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/classes/${id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      if (!response.ok) throw new Error("delete failed");
      setClasses((current) => current.filter((item) => item.id !== id));
      router.refresh();
    } catch {
      setError(tc("error"));
    } finally {
      setPending(false);
    }
  }

  async function persistOrder(next: ClassSummary[]) {
    setClasses(next);
    setError(null);
    try {
      const response = await fetch("/api/admin/classes/order", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: next.map((item) => item.id) }),
      });
      if (!response.ok) throw new Error("reorder failed");
      router.refresh();
    } catch {
      setError(tc("error"));
      router.refresh();
    }
  }

  function move(id: string, delta: number) {
    const index = classes.findIndex((item) => item.id === id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= classes.length) return;
    const next = [...classes];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    void persistOrder(next);
  }

  function dropOn(targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    const from = classes.findIndex((item) => item.id === draggedId);
    const to = classes.findIndex((item) => item.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...classes];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setDraggedId(null);
    void persistOrder(next);
  }

  return (
    <div className="space-y-8">
      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" aria-hidden />
            {t("newClass")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-[1fr_1fr_120px_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="new-class-name">{t("className")}</Label>
              <Input
                id="new-class-name"
                data-testid="new-class-name"
                value={newClass.name}
                onChange={(event) => setNewClass({ ...newClass, name: event.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-class-description">
                {t("classDescription")} <span className="text-muted-foreground">({tc("optional")})</span>
              </Label>
              <Textarea
                id="new-class-description"
                data-testid="new-class-description"
                className="min-h-10"
                value={newClass.description}
                onChange={(event) => setNewClass({ ...newClass, description: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-class-color">{t("classColor")}</Label>
              <Input
                id="new-class-color"
                data-testid="new-class-color"
                type="color"
                className="h-10 p-1"
                value={newClass.color}
                onChange={(event) => setNewClass({ ...newClass, color: event.target.value })}
              />
            </div>
            <Button type="submit" data-testid="create-class" disabled={pending}>
              {t("createClass")}
            </Button>
          </form>
        </CardContent>
      </Card>

      {classes.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-10 text-center text-muted-foreground">
          {t("emptyClasses")}
        </div>
      ) : (
        <div className="grid gap-4" data-testid="class-list">
          {classes.map((classroom, index) => (
            <Card
              key={classroom.id}
              data-testid={`class-card-${classroom.id}`}
              data-class-id={classroom.id}
              data-class-name={classroom.name}
              draggable
              onDragStart={() => setDraggedId(classroom.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => dropOn(classroom.id)}
              onDragEnd={() => setDraggedId(null)}
              className={draggedId === classroom.id ? "opacity-60" : ""}
            >
              <CardHeader className="flex-row items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <span className="mt-1 grid h-10 w-10 shrink-0 cursor-grab place-items-center rounded-xl text-white" style={{ backgroundColor: classroom.color }}>
                    <GripVertical className="h-5 w-5" aria-hidden />
                  </span>
                  <div>
                    {editingId === classroom.id ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Input
                          aria-label={t("className")}
                          value={editForm.name}
                          onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
                        />
                        <Input
                          type="color"
                          aria-label={t("classColor")}
                          className="h-10 p-1"
                          value={editForm.color}
                          onChange={(event) => setEditForm({ ...editForm, color: event.target.value })}
                        />
                        <Textarea
                          aria-label={t("classDescription")}
                          className="sm:col-span-2"
                          value={editForm.description}
                          onChange={(event) => setEditForm({ ...editForm, description: event.target.value })}
                        />
                        <div className="flex gap-2 sm:col-span-2">
                          <Button size="sm" onClick={() => saveEdit(classroom.id)} disabled={pending}>
                            {tc("save")}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                            {tc("cancel")}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <CardTitle>{classroom.name}</CardTitle>
                        {classroom.description ? (
                          <p className="mt-1 text-sm text-muted-foreground">{classroom.description}</p>
                        ) : null}
                        <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                          <Users className="h-3.5 w-3.5" aria-hidden />
                          {classroom.lessonCount} — {formatDate(classroom.createdAt, locale)}
                        </p>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("moveUp")}
                    disabled={index === 0}
                    onClick={() => move(classroom.id, -1)}
                  >
                    <ArrowUp className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("moveDown")}
                    disabled={index === classes.length - 1}
                    onClick={() => move(classroom.id, 1)}
                  >
                    <ArrowDown className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("editClass")}
                    data-testid={`edit-class-${classroom.id}`}
                    onClick={() => {
                      setEditingId(classroom.id);
                      setEditForm({
                        name: classroom.name,
                        description: classroom.description ?? "",
                        color: classroom.color,
                      });
                    }}
                  >
                    <Pencil className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("deleteClass")}
                    data-testid={`delete-class-${classroom.id}`}
                    onClick={() => remove(classroom.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" aria-hidden />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Link href={`/admin/classes/${classroom.id}`}>
                  <Button variant="outline" size="sm">
                    {t("openClass")}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t("dragToReorder")}</p>
    </div>
  );
}

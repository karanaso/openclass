"use client";

import { Loader2, Plus, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LocaleText = { prompt: string; answer: string };
type LocaleKey = "el" | "en";

export type EditableCard = {
  id: string;
  position: number;
  sourcePage: number;
  translations: { el: LocaleText; en: LocaleText };
};

type CardTranslations = EditableCard["translations"];
type SaveStatus = "idle" | "saving" | "saved" | "error";
type NewCardDraft = { sourcePage: string; translations: CardTranslations };

function cloneCardTranslations(translations: CardTranslations): CardTranslations {
  return {
    el: { ...translations.el },
    en: { ...translations.en },
  };
}

function cloneTranslations(cards: EditableCard[]): Record<string, CardTranslations> {
  return Object.fromEntries(cards.map((card) => [card.id, cloneCardTranslations(card.translations)]));
}

function emptyNewCard(): NewCardDraft {
  return {
    sourcePage: "1",
    translations: {
      el: { prompt: "", answer: "" },
      en: { prompt: "", answer: "" },
    },
  };
}

export function CardEditor({
  id,
  lessonId,
  cards,
  editable,
  onCreated,
}: {
  id?: string;
  lessonId: string;
  cards: EditableCard[];
  editable: boolean;
  onCreated?: (card: EditableCard) => void;
}) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const [items, setItems] = useState<EditableCard[]>(cards);
  const [drafts, setDrafts] = useState<Record<string, CardTranslations>>(() => cloneTranslations(cards));
  const [saved, setSaved] = useState<Record<string, CardTranslations>>(() => cloneTranslations(cards));
  const [statuses, setStatuses] = useState<Record<string, SaveStatus>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [openCards, setOpenCards] = useState<Set<string>>(
    () => new Set(cards.slice(0, 1).map((card) => card.id)),
  );
  const [newCard, setNewCard] = useState<NewCardDraft>(emptyNewCard);
  const [createStatus, setCreateStatus] = useState<SaveStatus>("idle");
  const [createError, setCreateError] = useState<string | null>(null);

  function updateField(cardId: string, locale: LocaleKey, field: keyof LocaleText, value: string) {
    setDrafts((current) => ({
      ...current,
      [cardId]: {
        ...current[cardId],
        [locale]: { ...current[cardId][locale], [field]: value },
      },
    }));
    setStatuses((current) => (current[cardId] === "saved" ? { ...current, [cardId]: "idle" } : current));
    setErrors((current) => {
      if (!current[cardId]) return current;
      const next = { ...current };
      delete next[cardId];
      return next;
    });
  }

  async function save(cardId: string) {
    const draft = drafts[cardId];
    const complete = (["el", "en"] as const).every(
      (locale) => draft[locale].prompt.trim().length > 0 && draft[locale].answer.trim().length > 0,
    );
    if (!complete) {
      setErrors((current) => ({ ...current, [cardId]: t("cardFieldsRequired") }));
      setStatuses((current) => ({ ...current, [cardId]: "error" }));
      return;
    }

    setStatuses((current) => ({ ...current, [cardId]: "saving" }));
    setErrors((current) => {
      const next = { ...current };
      delete next[cardId];
      return next;
    });

    try {
      const response = await fetch(`/api/admin/lessons/${lessonId}/cards/${cardId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ translations: draft }),
      });
      const data = (await response.json().catch(() => null)) as { card?: EditableCard } | null;
      if (!response.ok || !data?.card) throw new Error("save failed");

      const translations = data.card.translations;
      setSaved((current) => ({ ...current, [cardId]: cloneCardTranslations(translations) }));
      setDrafts((current) => ({ ...current, [cardId]: cloneCardTranslations(translations) }));
      setStatuses((current) => ({ ...current, [cardId]: "saved" }));
    } catch {
      setStatuses((current) => ({ ...current, [cardId]: "error" }));
      setErrors((current) => ({ ...current, [cardId]: t("cardSaveFailed") }));
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editable) return;

    const sourcePage = Number(newCard.sourcePage);
    const translations: CardTranslations = {
      el: { prompt: newCard.translations.el.prompt.trim(), answer: newCard.translations.el.answer.trim() },
      en: { prompt: newCard.translations.en.prompt.trim(), answer: newCard.translations.en.answer.trim() },
    };
    const complete = (["el", "en"] as const).every(
      (locale) => translations[locale].prompt.length > 0 && translations[locale].answer.length > 0,
    );
    if (!complete) {
      setCreateStatus("error");
      setCreateError(t("cardFieldsRequired"));
      return;
    }
    if (!Number.isInteger(sourcePage) || sourcePage < 1) {
      setCreateStatus("error");
      setCreateError(t("sourcePageInvalid"));
      return;
    }

    setCreateStatus("saving");
    setCreateError(null);

    try {
      const response = await fetch(`/api/admin/lessons/${lessonId}/cards`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourcePage, translations }),
      });
      const data = (await response.json().catch(() => null)) as { card?: EditableCard } | null;
      if (!response.ok || !data?.card) throw new Error("create failed");

      const card = data.card;
      setItems((current) => [...current, card]);
      setDrafts((current) => ({ ...current, [card.id]: cloneCardTranslations(card.translations) }));
      setSaved((current) => ({ ...current, [card.id]: cloneCardTranslations(card.translations) }));
      setStatuses((current) => ({ ...current, [card.id]: "saved" }));
      setOpenCards((current) => {
        const next = new Set(current);
        next.add(card.id);
        return next;
      });
      setNewCard(emptyNewCard());
      setCreateStatus("saved");
      onCreated?.(card);
    } catch {
      setCreateStatus("error");
      setCreateError(t("cardCreateFailed"));
    }
  }

  const isDirty = (cardId: string) => JSON.stringify(drafts[cardId]) !== JSON.stringify(saved[cardId]);
  const creating = editable && createStatus !== "saving";

  return (
    <Card id={id} data-testid="card-editor">
      <CardHeader>
        <CardTitle className="text-base">{t("editCards")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("editCardsHint")}</p>
        {!editable ? <Alert variant="info">{t("editCardsNotReady")}</Alert> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {items.length === 0 ? <p className="text-sm text-muted-foreground">{t("editCardsUnavailable")}</p> : null}

        {items.map((card, index) => {
          const draft = drafts[card.id];
          const status = statuses[card.id] ?? "idle";
          const disabled = !editable || status === "saving";

          return (
            <details
              key={card.id}
              open={openCards.has(card.id)}
              onToggle={(event) => {
                const isOpen = event.currentTarget.open;
                setOpenCards((current) => {
                  if (current.has(card.id) === isOpen) return current;
                  const next = new Set(current);
                  if (isOpen) next.add(card.id);
                  else next.delete(card.id);
                  return next;
                });
              }}
              data-testid={`card-editor-item-${index}`}
              className="rounded-xl border p-4"
            >
              <summary className="cursor-pointer text-sm font-semibold marker:text-muted-foreground">
                {t("cardLabel", { position: card.position })} · {t("cardSourcePage", { page: card.sourcePage })}
              </summary>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {(["el", "en"] as const).map((locale) => {
                  const promptId = `card-${index}-${locale}-prompt`;
                  const answerId = `card-${index}-${locale}-answer`;
                  return (
                    <fieldset key={locale} className="space-y-3">
                      <legend className="text-sm font-semibold">{tc(locale === "el" ? "greek" : "english")}</legend>
                      <div className="space-y-1.5">
                        <Label htmlFor={promptId}>{t("cardPrompt")}</Label>
                        <Textarea
                          id={promptId}
                          data-testid={promptId}
                          value={draft[locale].prompt}
                          disabled={disabled}
                          maxLength={2000}
                          onChange={(event) => updateField(card.id, locale, "prompt", event.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={answerId}>{t("cardAnswer")}</Label>
                        <Textarea
                          id={answerId}
                          data-testid={answerId}
                          value={draft[locale].answer}
                          disabled={disabled}
                          maxLength={2000}
                          onChange={(event) => updateField(card.id, locale, "answer", event.target.value)}
                        />
                      </div>
                    </fieldset>
                  );
                })}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button
                  size="sm"
                  data-testid={`card-save-${index}`}
                  disabled={disabled || !isDirty(card.id)}
                  onClick={() => void save(card.id)}
                >
                  {status === "saving" ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Save className="h-4 w-4" aria-hidden />
                  )}
                  {t("saveCard")}
                </Button>
                {status === "saved" ? (
                  <span className="text-sm text-emerald-700" role="status">
                    {t("cardSaved")}
                  </span>
                ) : null}
                {status === "error" ? (
                  <span className="text-sm text-red-700" role="alert">
                    {errors[card.id]}
                  </span>
                ) : null}
              </div>
            </details>
          );
        })}

        <form onSubmit={create} data-testid="add-card-form" className="space-y-4 rounded-xl border p-4">
          <div>
            <h3 className="text-sm font-semibold">{t("addCard")}</h3>
            <p className="text-sm text-muted-foreground">{t("addCardHint")}</p>
          </div>
          <div className="max-w-xs space-y-1.5">
            <Label htmlFor="new-card-source-page">{t("sourcePage")}</Label>
            <Input
              id="new-card-source-page"
              data-testid="new-card-source-page"
              type="number"
              min={1}
              value={newCard.sourcePage}
              disabled={!creating}
              onChange={(event) => {
                setNewCard((current) => ({ ...current, sourcePage: event.target.value }));
                setCreateStatus((current) => (current === "saved" ? "idle" : current));
                setCreateError(null);
              }}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {(["el", "en"] as const).map((locale) => {
              const promptId = `new-card-${locale}-prompt`;
              const answerId = `new-card-${locale}-answer`;
              return (
                <fieldset key={locale} className="space-y-3">
                  <legend className="text-sm font-semibold">{tc(locale === "el" ? "greek" : "english")}</legend>
                  <div className="space-y-1.5">
                    <Label htmlFor={promptId}>{t("cardPrompt")}</Label>
                    <Textarea
                      id={promptId}
                      data-testid={promptId}
                      value={newCard.translations[locale].prompt}
                      disabled={!creating}
                      maxLength={2000}
                      onChange={(event) => {
                        setNewCard((current) => ({
                          ...current,
                          translations: {
                            ...current.translations,
                            [locale]: { ...current.translations[locale], prompt: event.target.value },
                          },
                        }));
                        setCreateStatus((current) => (current === "saved" ? "idle" : current));
                        setCreateError(null);
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={answerId}>{t("cardAnswer")}</Label>
                    <Textarea
                      id={answerId}
                      data-testid={answerId}
                      value={newCard.translations[locale].answer}
                      disabled={!creating}
                      maxLength={2000}
                      onChange={(event) => {
                        setNewCard((current) => ({
                          ...current,
                          translations: {
                            ...current.translations,
                            [locale]: { ...current.translations[locale], answer: event.target.value },
                          },
                        }));
                        setCreateStatus((current) => (current === "saved" ? "idle" : current));
                        setCreateError(null);
                      }}
                    />
                  </div>
                </fieldset>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="sm" data-testid="new-card-save" disabled={!creating}>
              {createStatus === "saving" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Plus className="h-4 w-4" aria-hidden />
              )}
              {t("saveNewCard")}
            </Button>
            {createStatus === "saved" ? (
              <span className="text-sm text-emerald-700" role="status">
                {t("cardCreated")}
              </span>
            ) : null}
            {createStatus === "error" ? (
              <span className="text-sm text-red-700" role="alert">
                {createError}
              </span>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

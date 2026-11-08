"use client";

import { Loader2, Plus, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import type { QuestionMode, QuestionType } from "@prisma/client";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EditableQuestion, QuestionTranslationInput } from "@/server/services/questions";

type LocaleKey = "el" | "en";
type SaveStatus = "idle" | "saving" | "saved" | "error";

type NewQuestionDraft = {
  type: QuestionType;
  sourcePage: string;
  correctOptionId: string;
  translations: Record<LocaleKey, QuestionTranslationInput>;
};

type QuestionDraftShape = {
  type: QuestionType;
  sourcePage: number | string;
  correctOptionId: string;
  translations: Record<LocaleKey, QuestionTranslationInput>;
};

const MODES = ["QUESTIONNAIRE", "GAME"] as const;
const MODE_KEYS: Record<QuestionMode, string> = {
  QUESTIONNAIRE: "questionnaire",
  GAME: "game",
};

function optionIds(type: QuestionType): string[] {
  return type === "TRUE_FALSE" ? ["a", "b"] : ["a", "b", "c", "d"];
}

function cloneQuestion(question: EditableQuestion): EditableQuestion {
  return {
    ...question,
    translations: {
      el: {
        ...question.translations.el,
        options: question.translations.el.options.map((option) => ({ ...option })),
      },
      en: {
        ...question.translations.en,
        options: question.translations.en.options.map((option) => ({ ...option })),
      },
    },
  };
}

function cloneQuestions(questions: EditableQuestion[]): Record<string, EditableQuestion> {
  return Object.fromEntries(questions.map((question) => [question.id, cloneQuestion(question)]));
}

function emptyNewQuestion(): NewQuestionDraft {
  const ids = optionIds("TRUE_FALSE");
  return {
    type: "TRUE_FALSE",
    sourcePage: "1",
    correctOptionId: ids[0],
    translations: {
      el: {
        prompt: "",
        options: ids.map((id) => ({ id, text: "" })),
        explanation: "",
      },
      en: {
        prompt: "",
        options: ids.map((id) => ({ id, text: "" })),
        explanation: "",
      },
    },
  };
}

function withType(draft: NewQuestionDraft, type: QuestionType): NewQuestionDraft {
  const ids = optionIds(type);
  const rebuild = (translation: QuestionTranslationInput): QuestionTranslationInput => ({
    ...translation,
    options: ids.map((id, index) => ({ id, text: translation.options[index]?.text ?? "" })),
  });
  return {
    ...draft,
    type,
    correctOptionId: ids.includes(draft.correctOptionId) ? draft.correctOptionId : ids[0],
    translations: {
      el: rebuild(draft.translations.el),
      en: rebuild(draft.translations.en),
    },
  };
}

function buildContent(draft: QuestionDraftShape) {
  const expected = draft.type === "TRUE_FALSE" ? 2 : 4;
  const translations = {
    el: {
      prompt: draft.translations.el.prompt.trim(),
      options: draft.translations.el.options.map((option) => ({ id: option.id, text: option.text.trim() })),
      explanation: draft.translations.el.explanation.trim(),
    },
    en: {
      prompt: draft.translations.en.prompt.trim(),
      options: draft.translations.en.options.map((option) => ({ id: option.id, text: option.text.trim() })),
      explanation: draft.translations.en.explanation.trim(),
    },
  };

  const complete = (["el", "en"] as const).every(
    (locale) =>
      translations[locale].prompt.length > 0 &&
      translations[locale].explanation.length > 0 &&
      translations[locale].options.every((option) => option.text.length > 0),
  );
  if (!complete) return { error: "fields" as const };
  if (translations.el.options.length !== expected || translations.en.options.length !== expected) {
    return { error: "options" as const };
  }

  const sourcePage = Number(draft.sourcePage);
  if (!Number.isInteger(sourcePage) || sourcePage < 1) return { error: "sourcePage" as const };

  return {
    content: {
      correctOptionId: draft.correctOptionId,
      sourcePage,
      translations,
    },
  };
}

function TranslationFields({
  locale,
  prefix,
  translation,
  disabled,
  onPromptChange,
  onExplanationChange,
  onOptionChange,
}: {
  locale: LocaleKey;
  prefix: string;
  translation: QuestionTranslationInput;
  disabled: boolean;
  onPromptChange: (value: string) => void;
  onExplanationChange: (value: string) => void;
  onOptionChange: (optionId: string, value: string) => void;
}) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold">{tc(locale === "el" ? "greek" : "english")}</legend>
      <div className="space-y-1.5">
        <Label htmlFor={`${prefix}-${locale}-prompt`}>{t("cardPrompt")}</Label>
        <Textarea
          id={`${prefix}-${locale}-prompt`}
          data-testid={`${prefix}-${locale}-prompt`}
          value={translation.prompt}
          disabled={disabled}
          maxLength={6000}
          onChange={(event) => onPromptChange(event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label>{t("options")}</Label>
        <div className="space-y-2">
          {translation.options.map((option) => (
            <div key={option.id} className="flex items-center gap-2">
              <span className="w-8 shrink-0 text-xs font-semibold text-muted-foreground">{option.id}</span>
              <Input
                aria-label={t("optionLabel", { id: option.id })}
                data-testid={`${prefix}-${locale}-option-${option.id}`}
                value={option.text}
                disabled={disabled}
                maxLength={3000}
                onChange={(event) => onOptionChange(option.id, event.target.value)}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${prefix}-${locale}-explanation`}>{t("explanation")}</Label>
        <Textarea
          id={`${prefix}-${locale}-explanation`}
          data-testid={`${prefix}-${locale}-explanation`}
          value={translation.explanation}
          disabled={disabled}
          maxLength={6000}
          onChange={(event) => onExplanationChange(event.target.value)}
        />
      </div>
    </fieldset>
  );
}

export function QuestionEditor({
  id,
  lessonId,
  questions,
  editable,
  onCreated,
}: {
  id?: string;
  lessonId: string;
  questions: EditableQuestion[];
  editable: boolean;
  onCreated?: (question: EditableQuestion) => void;
}) {
  const t = useTranslations("admin");
  const [items, setItems] = useState<EditableQuestion[]>(questions);
  const [drafts, setDrafts] = useState<Record<string, EditableQuestion>>(() => cloneQuestions(questions));
  const [saved, setSaved] = useState<Record<string, EditableQuestion>>(() => cloneQuestions(questions));
  const [statuses, setStatuses] = useState<Record<string, SaveStatus>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [openQuestions, setOpenQuestions] = useState<Set<string>>(
    () => new Set(questions.slice(0, 1).map((question) => question.id)),
  );
  const [newDrafts, setNewDrafts] = useState<Record<QuestionMode, NewQuestionDraft>>(() => ({
    QUESTIONNAIRE: emptyNewQuestion(),
    GAME: emptyNewQuestion(),
  }));
  const [newStatuses, setNewStatuses] = useState<Record<QuestionMode, SaveStatus>>({
    QUESTIONNAIRE: "idle",
    GAME: "idle",
  });
  const [newErrors, setNewErrors] = useState<Record<QuestionMode, string | null>>({
    QUESTIONNAIRE: null,
    GAME: null,
  });

  function typeLabel(type: QuestionType) {
    return type === "TRUE_FALSE" ? t("questionTypeTrueFalse") : t("questionTypeMultipleChoice");
  }

  function modeLabel(mode: QuestionMode) {
    return mode === "QUESTIONNAIRE" ? t("questionnaireSection") : t("gameSection");
  }

  function updateDraft(questionId: string, update: (question: EditableQuestion) => EditableQuestion) {
    setDrafts((current) => ({ ...current, [questionId]: update(current[questionId]) }));
    setStatuses((current) => (current[questionId] === "saved" ? { ...current, [questionId]: "idle" } : current));
    setErrors((current) => {
      if (!current[questionId]) return current;
      const next = { ...current };
      delete next[questionId];
      return next;
    });
  }

  function updateTranslationField(
    questionId: string,
    locale: LocaleKey,
    field: "prompt" | "explanation",
    value: string,
  ) {
    updateDraft(questionId, (question) => ({
      ...question,
      translations: {
        ...question.translations,
        [locale]: { ...question.translations[locale], [field]: value },
      },
    }));
  }

  function updateOption(questionId: string, locale: LocaleKey, optionId: string, value: string) {
    updateDraft(questionId, (question) => ({
      ...question,
      translations: {
        ...question.translations,
        [locale]: {
          ...question.translations[locale],
          options: question.translations[locale].options.map((option) =>
            option.id === optionId ? { ...option, text: value } : option,
          ),
        },
      },
    }));
  }

  function updateSourcePage(questionId: string, value: string) {
    updateDraft(questionId, (question) => ({ ...question, sourcePage: Number(value) }));
  }

  function updateCorrectOption(questionId: string, value: string) {
    updateDraft(questionId, (question) => ({ ...question, correctOptionId: value }));
  }

  async function save(questionId: string) {
    const draft = drafts[questionId];
    const result = buildContent(draft);
    if ("error" in result) {
      setStatuses((current) => ({ ...current, [questionId]: "error" }));
      setErrors((current) => ({
        ...current,
        [questionId]:
          result.error === "fields"
            ? t("questionFieldsRequired")
            : result.error === "options"
              ? t("questionOptionCount")
              : t("sourcePageInvalid"),
      }));
      return;
    }

    setStatuses((current) => ({ ...current, [questionId]: "saving" }));
    setErrors((current) => {
      const next = { ...current };
      delete next[questionId];
      return next;
    });

    try {
      const response = await fetch(`/api/admin/lessons/${lessonId}/questions/${questionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(result.content),
      });
      const data = (await response.json().catch(() => null)) as { question?: EditableQuestion } | null;
      if (!response.ok || !data?.question) throw new Error("save failed");

      const question = data.question;
      setItems((current) => current.map((item) => (item.id === questionId ? question : item)));
      setDrafts((current) => ({ ...current, [questionId]: cloneQuestion(question) }));
      setSaved((current) => ({ ...current, [questionId]: cloneQuestion(question) }));
      setStatuses((current) => ({ ...current, [questionId]: "saved" }));
    } catch {
      setStatuses((current) => ({ ...current, [questionId]: "error" }));
      setErrors((current) => ({ ...current, [questionId]: t("questionSaveFailed") }));
    }
  }

  function updateNew(mode: QuestionMode, update: (draft: NewQuestionDraft) => NewQuestionDraft) {
    setNewDrafts((current) => ({ ...current, [mode]: update(current[mode]) }));
    setNewStatuses((current) => (current[mode] === "saved" ? { ...current, [mode]: "idle" } : current));
    setNewErrors((current) => ({ ...current, [mode]: null }));
  }

  async function create(event: FormEvent<HTMLFormElement>, mode: QuestionMode) {
    event.preventDefault();
    if (!editable) return;

    const draft = newDrafts[mode];
    const result = buildContent(draft);
    if ("error" in result) {
      setNewStatuses((current) => ({ ...current, [mode]: "error" }));
      setNewErrors((current) => ({
        ...current,
        [mode]:
          result.error === "fields"
            ? t("questionFieldsRequired")
            : result.error === "options"
              ? t("questionOptionCount")
              : t("sourcePageInvalid"),
      }));
      return;
    }

    setNewStatuses((current) => ({ ...current, [mode]: "saving" }));
    setNewErrors((current) => ({ ...current, [mode]: null }));

    try {
      const response = await fetch(`/api/admin/lessons/${lessonId}/questions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...result.content, mode, type: draft.type }),
      });
      const data = (await response.json().catch(() => null)) as { question?: EditableQuestion } | null;
      if (!response.ok || !data?.question) throw new Error("create failed");

      const question = data.question;
      setItems((current) => [...current, question]);
      setDrafts((current) => ({ ...current, [question.id]: cloneQuestion(question) }));
      setSaved((current) => ({ ...current, [question.id]: cloneQuestion(question) }));
      setStatuses((current) => ({ ...current, [question.id]: "saved" }));
      setOpenQuestions((current) => {
        const next = new Set(current);
        next.add(question.id);
        return next;
      });
      setNewDrafts((current) => ({ ...current, [mode]: emptyNewQuestion() }));
      setNewStatuses((current) => ({ ...current, [mode]: "saved" }));
      onCreated?.(question);
    } catch {
      setNewStatuses((current) => ({ ...current, [mode]: "error" }));
      setNewErrors((current) => ({ ...current, [mode]: t("questionCreateFailed") }));
    }
  }

  const isDirty = (questionId: string) =>
    JSON.stringify(drafts[questionId]) !== JSON.stringify(saved[questionId]);

  return (
    <Card id={id} data-testid="question-editor">
      <CardHeader>
        <CardTitle className="text-base">{t("editQuestions")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("editQuestionsHint")}</p>
        {!editable ? <Alert variant="info">{t("editQuestionsNotReady")}</Alert> : null}
      </CardHeader>
      <CardContent className="space-y-8">
        {MODES.map((mode) => {
          const modeQuestions = items
            .filter((question) => question.mode === mode)
            .sort((first, second) => first.position - second.position);
          const modeKey = MODE_KEYS[mode];
          const newDraft = newDrafts[mode];
          const createStatus = newStatuses[mode];
          const creating = editable && createStatus !== "saving";

          return (
            <section key={mode} className="space-y-4" data-testid={`question-section-${modeKey}`}>
              <h3 className="text-base font-semibold">{modeLabel(mode)}</h3>
              {modeQuestions.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noQuestionsInMode")}</p>
              ) : null}

              {modeQuestions.map((question, index) => {
                const draft = drafts[question.id];
                const status = statuses[question.id] ?? "idle";
                const disabled = !editable || status === "saving";
                const currentTypeLabel = typeLabel(draft.type);
                const prefix = `question-${modeKey}-${index}`;

                return (
                  <details
                    key={question.id}
                    open={openQuestions.has(question.id)}
                    onToggle={(event) => {
                      const isOpen = event.currentTarget.open;
                      setOpenQuestions((current) => {
                        if (current.has(question.id) === isOpen) return current;
                        const next = new Set(current);
                        if (isOpen) next.add(question.id);
                        else next.delete(question.id);
                        return next;
                      });
                    }}
                    data-testid={`question-editor-item-${modeKey}-${index}`}
                    className="rounded-xl border p-4"
                  >
                    <summary className="cursor-pointer text-sm font-semibold marker:text-muted-foreground">
                      {t("questionLabel", { position: draft.position })} · {currentTypeLabel} · {t("sourcePage")}:{" "}
                      {draft.sourcePage}
                    </summary>
                    <div className="mt-4 space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{currentTypeLabel}</Badge>
                        <Badge variant="outline">{modeLabel(mode)}</Badge>
                      </div>

                      <div className="max-w-xs space-y-1.5">
                        <Label htmlFor={`${prefix}-source-page`}>{t("sourcePage")}</Label>
                        <Input
                          id={`${prefix}-source-page`}
                          data-testid={`${prefix}-source-page`}
                          type="number"
                          min={1}
                          value={draft.sourcePage}
                          disabled={disabled}
                          onChange={(event) => updateSourcePage(question.id, event.target.value)}
                        />
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        {(["el", "en"] as const).map((locale) => (
                          <TranslationFields
                            key={locale}
                            locale={locale}
                            prefix={prefix}
                            translation={draft.translations[locale]}
                            disabled={disabled}
                            onPromptChange={(value) => updateTranslationField(question.id, locale, "prompt", value)}
                            onExplanationChange={(value) =>
                              updateTranslationField(question.id, locale, "explanation", value)
                            }
                            onOptionChange={(optionId, value) => updateOption(question.id, locale, optionId, value)}
                          />
                        ))}
                      </div>

                      <div className="max-w-sm space-y-1.5">
                        <Label htmlFor={`${prefix}-correct`}>{t("correctOption")}</Label>
                        <select
                          id={`${prefix}-correct`}
                          data-testid={`${prefix}-correct`}
                          value={draft.correctOptionId}
                          disabled={disabled}
                          onChange={(event) => updateCorrectOption(question.id, event.target.value)}
                          className="flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {draft.translations.el.options.map((option) => (
                            <option key={option.id} value={option.id}>
                              {t("optionLabel", { id: option.id })}
                              {option.text ? ` — ${option.text}` : ""}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <Button
                          size="sm"
                          data-testid={`${prefix}-save`}
                          disabled={disabled || !isDirty(question.id)}
                          onClick={() => void save(question.id)}
                        >
                          {status === "saving" ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                          ) : (
                            <Save className="h-4 w-4" aria-hidden />
                          )}
                          {t("saveQuestion")}
                        </Button>
                        {status === "saved" ? (
                          <span className="text-sm text-emerald-700" role="status">
                            {t("questionSaved")}
                          </span>
                        ) : null}
                        {status === "error" ? (
                          <span className="text-sm text-red-700" role="alert">
                            {errors[question.id]}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </details>
                );
              })}

              <form
                onSubmit={(event) => void create(event, mode)}
                data-testid={`add-question-form-${modeKey}`}
                className="space-y-4 rounded-xl border p-4"
              >
                <div>
                  <h4 className="text-sm font-semibold">{t("addQuestion")}</h4>
                  <p className="text-sm text-muted-foreground">{t("addQuestionHint")}</p>
                </div>

                <div className="flex flex-wrap gap-4">
                  <div className="w-56 space-y-1.5">
                    <Label htmlFor={`new-question-${modeKey}-type`}>{t("questionType")}</Label>
                    <select
                      id={`new-question-${modeKey}-type`}
                      data-testid={`new-question-${modeKey}-type`}
                      value={newDraft.type}
                      disabled={!creating}
                      onChange={(event) =>
                        updateNew(mode, (current) => withType(current, event.target.value as QuestionType))
                      }
                      className="flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="TRUE_FALSE">{t("questionTypeTrueFalse")}</option>
                      <option value="MULTIPLE_CHOICE">{t("questionTypeMultipleChoice")}</option>
                    </select>
                  </div>
                  <div className="w-40 space-y-1.5">
                    <Label htmlFor={`new-question-${modeKey}-source-page`}>{t("sourcePage")}</Label>
                    <Input
                      id={`new-question-${modeKey}-source-page`}
                      data-testid={`new-question-${modeKey}-source-page`}
                      type="number"
                      min={1}
                      value={newDraft.sourcePage}
                      disabled={!creating}
                      onChange={(event) =>
                        updateNew(mode, (current) => ({ ...current, sourcePage: event.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {(["el", "en"] as const).map((locale) => (
                    <TranslationFields
                      key={locale}
                      locale={locale}
                      prefix={`new-question-${modeKey}`}
                      translation={newDraft.translations[locale]}
                      disabled={!creating}
                      onPromptChange={(value) =>
                        updateNew(mode, (current) => ({
                          ...current,
                          translations: {
                            ...current.translations,
                            [locale]: { ...current.translations[locale], prompt: value },
                          },
                        }))
                      }
                      onExplanationChange={(value) =>
                        updateNew(mode, (current) => ({
                          ...current,
                          translations: {
                            ...current.translations,
                            [locale]: { ...current.translations[locale], explanation: value },
                          },
                        }))
                      }
                      onOptionChange={(optionId, value) =>
                        updateNew(mode, (current) => ({
                          ...current,
                          translations: {
                            ...current.translations,
                            [locale]: {
                              ...current.translations[locale],
                              options: current.translations[locale].options.map((option) =>
                                option.id === optionId ? { ...option, text: value } : option,
                              ),
                            },
                          },
                        }))
                      }
                    />
                  ))}
                </div>

                <div className="max-w-sm space-y-1.5">
                  <Label htmlFor={`new-question-${modeKey}-correct`}>{t("correctOption")}</Label>
                  <select
                    id={`new-question-${modeKey}-correct`}
                    data-testid={`new-question-${modeKey}-correct`}
                    value={newDraft.correctOptionId}
                    disabled={!creating}
                    onChange={(event) => updateNew(mode, (current) => ({ ...current, correctOptionId: event.target.value }))}
                    className="flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {newDraft.translations.el.options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {t("optionLabel", { id: option.id })}
                        {option.text ? ` — ${option.text}` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button type="submit" size="sm" data-testid={`new-question-${modeKey}-save`} disabled={!creating}>
                    {createStatus === "saving" ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Plus className="h-4 w-4" aria-hidden />
                    )}
                    {t("addQuestion")}
                  </Button>
                  {createStatus === "saved" ? (
                    <span className="text-sm text-emerald-700" role="status">
                      {t("questionCreated")}
                    </span>
                  ) : null}
                  {createStatus === "error" ? (
                    <span className="text-sm text-red-700" role="alert">
                      {newErrors[mode]}
                    </span>
                  ) : null}
                </div>
              </form>
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}

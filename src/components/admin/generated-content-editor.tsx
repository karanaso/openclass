"use client";

import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { CardEditor, type EditableCard } from "@/components/admin/card-editor";
import { QuestionEditor } from "@/components/admin/question-editor";
import { Button } from "@/components/ui/button";
import type { EditableQuestion } from "@/server/services/questions";

export type GeneratedContentEditor = "cards" | "questions";

type GeneratedContentEditorContextValue = {
  activeEditor: GeneratedContentEditor | null;
  toggleEditor: (editor: GeneratedContentEditor) => void;
  cardCount: number;
  questionCount: number;
  createdCards: EditableCard[];
  createdQuestions: EditableQuestion[];
  registerCardCreated: (card: EditableCard) => void;
  registerQuestionCreated: (question: EditableQuestion) => void;
};

const GeneratedContentEditorContext = createContext<GeneratedContentEditorContextValue | null>(null);

export function useGeneratedContentEditor() {
  const context = useContext(GeneratedContentEditorContext);
  if (!context) {
    throw new Error("useGeneratedContentEditor must be used within GeneratedContentEditorProvider");
  }
  return context;
}

export function GeneratedContentEditorProvider({
  initialCardCount,
  initialQuestionCount,
  children,
}: {
  initialCardCount: number;
  initialQuestionCount: number;
  children: ReactNode;
}) {
  const [activeEditor, setActiveEditor] = useState<GeneratedContentEditor | null>(null);
  const [createdCards, setCreatedCards] = useState<EditableCard[]>([]);
  const [createdQuestions, setCreatedQuestions] = useState<EditableQuestion[]>([]);

  const value = useMemo<GeneratedContentEditorContextValue>(
    () => ({
      activeEditor,
      toggleEditor: (editor) => setActiveEditor((current) => (current === editor ? null : editor)),
      cardCount: initialCardCount + createdCards.length,
      questionCount: initialQuestionCount + createdQuestions.length,
      createdCards,
      createdQuestions,
      registerCardCreated: (card) => setCreatedCards((current) => [...current, card]),
      registerQuestionCreated: (question) => setCreatedQuestions((current) => [...current, question]),
    }),
    [activeEditor, initialCardCount, initialQuestionCount, createdCards, createdQuestions],
  );

  return (
    <GeneratedContentEditorContext.Provider value={value}>{children}</GeneratedContentEditorContext.Provider>
  );
}

export function GeneratedContentActions() {
  const t = useTranslations("admin");
  const { activeEditor, toggleEditor } = useGeneratedContentEditor();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        aria-expanded={activeEditor === "cards"}
        aria-controls="card-editor-panel"
        data-testid="edit-cards-button"
        onClick={() => toggleEditor("cards")}
      >
        <Pencil className="h-4 w-4" aria-hidden />
        {t("editCards")}
      </Button>
      <Button
        variant="outline"
        size="sm"
        aria-expanded={activeEditor === "questions"}
        aria-controls="question-editor-panel"
        data-testid="edit-questions-button"
        onClick={() => toggleEditor("questions")}
      >
        <Pencil className="h-4 w-4" aria-hidden />
        {t("editQuestions")}
      </Button>
    </div>
  );
}

export function GeneratedContentCounts() {
  const t = useTranslations("admin");
  const { cardCount, questionCount } = useGeneratedContentEditor();

  return (
    <>
      <p>
        {t("cardsCount")}: <strong data-testid="generated-cards-count">{cardCount}</strong>
      </p>
      <p>
        {t("questionsCount")}: <strong data-testid="generated-questions-count">{questionCount}</strong>
      </p>
    </>
  );
}

export function GeneratedContentEditors({
  lessonId,
  cards,
  questions,
  editable,
}: {
  lessonId: string;
  cards: EditableCard[];
  questions: EditableQuestion[];
  editable: boolean;
}) {
  const { activeEditor, createdCards, createdQuestions, registerCardCreated, registerQuestionCreated } =
    useGeneratedContentEditor();

  if (activeEditor === "cards") {
    return (
      <CardEditor
        id="card-editor-panel"
        lessonId={lessonId}
        cards={[...cards, ...createdCards]}
        editable={editable}
        onCreated={registerCardCreated}
      />
    );
  }

  if (activeEditor === "questions") {
    return (
      <QuestionEditor
        id="question-editor-panel"
        lessonId={lessonId}
        questions={[...questions, ...createdQuestions]}
        editable={editable}
        onCreated={registerQuestionCreated}
      />
    );
  }

  return null;
}

export type ClassSummary = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  position: number;
  lessonCount: number;
  createdAt: string;
};

export type LessonSummary = {
  id: string;
  title: string;
  originalFilename: string;
  status: string;
  failureReason: string | null;
  pageCount: number | null;
  createdAt: string;
  readyAt: string | null;
  attemptCount: number;
  tokens: number;
  cost: number;
};

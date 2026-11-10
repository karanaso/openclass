export type VideoLocale = "el" | "en";

export type VideoStorySceneInput = {
  sceneKey: string;
  sourcePages: number[];
  narration: string;
  visualDirection?: string;
};

export type VideoSubmitInput = {
  lessonId: string;
  locale: VideoLocale;
  contentVersion: number;
  idempotencyKey: string;
  title: string;
  story: {
    title: string;
    logline: string;
    scenes: VideoStorySceneInput[];
  };
};

export type VideoProviderStatus = "queued" | "processing" | "completed" | "failed";

export type VideoProviderOutputs = {
  videoUrl: string;
  captionsUrl?: string;
  posterUrl?: string;
};

export type VideoProviderJob = {
  id: string;
  status: VideoProviderStatus;
  progress?: number;
  error?: string;
  outputs?: VideoProviderOutputs;
  durationSeconds?: number;
};

export type VideoProviderDownload = {
  body: Uint8Array;
  contentType: string | null;
};

export interface VideoProvider {
  readonly name: string;
  submit(input: VideoSubmitInput): Promise<{ id: string; status: string }>;
  getJob(id: string): Promise<VideoProviderJob>;
  download(url: string): Promise<VideoProviderDownload>;
}

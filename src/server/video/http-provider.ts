import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import type {
  VideoProvider,
  VideoProviderDownload,
  VideoProviderJob,
  VideoProviderStatus,
  VideoSubmitInput,
} from "./provider";

type HttpVideoOptions = {
  baseUrl: string;
  apiKey?: string;
  model?: string;
  requestTimeoutMs?: number;
};

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function resolveUrl(baseUrl: string, value: string): string {
  return new URL(value, `${baseUrl}/`).toString();
}

function isProviderStatus(value: unknown): value is VideoProviderStatus {
  return value === "queued" || value === "processing" || value === "completed" || value === "failed";
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") return "request timed out";
    return error.message.slice(0, 300);
  }
  return "unknown network error";
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new AppError("video_provider_invalid_response", "Video provider returned a non-JSON response", 502);
  }
}

export class HttpVideoProvider implements VideoProvider {
  readonly name = "api";
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly model?: string;
  private readonly timeoutMs: number;

  constructor(options?: HttpVideoOptions) {
    const env = getEnv();
    const baseUrl = options?.baseUrl ?? env.VIDEO_AI_BASE_URL;
    if (!baseUrl) {
      throw new AppError("video_provider_not_configured", "VIDEO_AI_BASE_URL is not configured", 500);
    }
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.apiKey = options?.apiKey ?? env.VIDEO_AI_API_KEY;
    this.model = options?.model ?? env.VIDEO_AI_MODEL;
    this.timeoutMs = options?.requestTimeoutMs ?? env.VIDEO_AI_REQUEST_TIMEOUT_MS;
  }

  private headers(contentType = false): Record<string, string> {
    return {
      ...(contentType ? { "content-type": "application/json" } : {}),
      ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
    };
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (error) {
      const detail = errorMessage(error);
      const timedOut = detail === "request timed out";
      throw new AppError(
        timedOut ? "video_provider_timeout" : "video_provider_unavailable",
        `Video provider ${timedOut ? "request timed out" : "is unavailable"}: ${detail}`,
        timedOut ? 504 : 502,
      );
    }
  }

  async submit(input: VideoSubmitInput): Promise<{ id: string; status: string }> {
    const body: Record<string, unknown> = {
      idempotencyKey: input.idempotencyKey,
      lessonId: input.lessonId,
      locale: input.locale,
      title: input.title,
      story: input.story,
    };
    if (this.model) body.model = this.model;

    const response = await this.request(`${this.baseUrl}/videos`, {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      if (response.status === 409) {
        const existing = await readJson(response);
        const id = typeof existing.id === "string" ? existing.id : undefined;
        if (id) return { id, status: typeof existing.status === "string" ? existing.status : "queued" };
      }
      const detail = (await response.text()).slice(0, 400);
      throw new AppError(
        "video_provider_rejected",
        `Video provider rejected the request (${response.status}): ${detail || "no detail"}`,
        response.status === 429 ? 429 : 502,
      );
    }

    const data = await readJson(response);
    if (typeof data.id !== "string" || !data.id) {
      throw new AppError("video_provider_invalid_response", "Video provider did not return a job id", 502);
    }
    return { id: data.id, status: typeof data.status === "string" ? data.status : "queued" };
  }

  async getJob(id: string): Promise<VideoProviderJob> {
    const response = await this.request(`${this.baseUrl}/videos/${encodeURIComponent(id)}`, {
      method: "GET",
      headers: this.headers(),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 400);
      throw new AppError(
        "video_provider_status_failed",
        `Video provider status request failed (${response.status}): ${detail || "no detail"}`,
        response.status === 404 ? 404 : 502,
      );
    }

    const data = await readJson(response);
    const status = data.status;
    if (!isProviderStatus(status)) {
      throw new AppError("video_provider_invalid_response", "Video provider returned an unknown job status", 502);
    }

    const outputs =
      data.outputs && typeof data.outputs === "object"
        ? (data.outputs as Record<string, unknown>)
        : undefined;
    return {
      id: typeof data.id === "string" ? data.id : id,
      status,
      progress: typeof data.progress === "number" ? data.progress : undefined,
      error: typeof data.error === "string" ? data.error : undefined,
      durationSeconds:
        typeof data.durationSeconds === "number"
          ? data.durationSeconds
          : typeof data.duration_seconds === "number"
            ? data.duration_seconds
            : undefined,
      outputs: outputs
        ? {
            videoUrl:
              typeof outputs.videoUrl === "string"
                ? outputs.videoUrl
                : typeof outputs.video_url === "string"
                  ? outputs.video_url
                  : "",
            captionsUrl:
              typeof outputs.captionsUrl === "string"
                ? outputs.captionsUrl
                : typeof outputs.captions_url === "string"
                  ? outputs.captions_url
                  : undefined,
            posterUrl:
              typeof outputs.posterUrl === "string"
                ? outputs.posterUrl
                : typeof outputs.poster_url === "string"
                  ? outputs.poster_url
                  : undefined,
          }
        : undefined,
    };
  }

  async download(url: string): Promise<VideoProviderDownload> {
    const response = await this.request(resolveUrl(this.baseUrl, url), {
      method: "GET",
      headers: this.headers(),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 200);
      throw new AppError(
        "video_download_failed",
        `Could not download provider output (${response.status}): ${detail || "no detail"}`,
        response.status === 404 ? 404 : 502,
      );
    }
    return {
      body: new Uint8Array(await response.arrayBuffer()),
      contentType: response.headers.get("content-type"),
    };
  }
}

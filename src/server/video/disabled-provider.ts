import { AppError } from "@/lib/errors";
import type {
  VideoProvider,
  VideoProviderDownload,
  VideoProviderJob,
  VideoSubmitInput,
} from "./provider";

export class DisabledVideoProvider implements VideoProvider {
  readonly name = "disabled";

  async submit(_input: VideoSubmitInput): Promise<{ id: string; status: string }> {
    throw new AppError(
      "video_provider_disabled",
      "Video generation is disabled. Configure VIDEO_PROVIDER=api and VIDEO_AI_BASE_URL.",
      503,
    );
  }

  async getJob(_id: string): Promise<VideoProviderJob> {
    throw new AppError("video_provider_disabled", "Video generation is disabled", 503);
  }

  async download(_url: string): Promise<VideoProviderDownload> {
    throw new AppError("video_provider_disabled", "Video generation is disabled", 503);
  }
}

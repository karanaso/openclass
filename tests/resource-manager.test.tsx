// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResourceManager } from "@/components/admin/resource-manager";
import type { LessonResourceView } from "@/server/services/resources";

const refresh = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key.split(".").pop() ?? key,
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const approved: LessonResourceView = {
  id: "approved-1",
  kind: "LINK",
  status: "APPROVED",
  source: "MANUAL",
  sourcePage: null,
  title: "Approved guide",
  description: "Read this",
  url: "https://example.com/guide",
  youtubeId: null,
  position: 1,
  createdAt: new Date().toISOString(),
};

const suggested: LessonResourceView = {
  id: "suggested-1",
  kind: "YOUTUBE",
  status: "SUGGESTED",
  source: "QR",
  sourcePage: 2,
  title: "Found video",
  description: null,
  url: "https://youtu.be/dQw4w9WgXcQ",
  youtubeId: "dQw4w9WgXcQ",
  position: 2,
  createdAt: new Date().toISOString(),
};

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function renderManager(resources: LessonResourceView[] = [approved, suggested]) {
  render(<ResourceManager lessonId="lesson-1" initialResources={resources} />);
}

beforeEach(() => {
  refresh.mockReset();
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal("confirm", vi.fn(() => true));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("resource manager", () => {
  it("creates a resource and shows a detected YouTube hint", async () => {
    const created: LessonResourceView = {
      ...approved,
      id: "created-1",
      kind: "YOUTUBE",
      title: "New video",
      url: "https://youtu.be/dQw4w9WgXcQ",
      youtubeId: "dQw4w9WgXcQ",
      position: 3,
    };
    vi.mocked(fetch).mockResolvedValueOnce(response({ resource: created }, 201));

    renderManager();

    fireEvent.change(screen.getByTestId("new-resource-title"), { target: { value: "New video" } });
    fireEvent.change(screen.getByTestId("new-resource-url"), {
      target: { value: "https://youtu.be/dQw4w9WgXcQ" },
    });
    expect(screen.getByTestId("new-resource-hint")).toHaveTextContent("resourceDetectedKind");

    fireEvent.click(screen.getByTestId("new-resource-save"));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/admin/lessons/lesson-1/resources");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      title: "New video",
      url: "https://youtu.be/dQw4w9WgXcQ",
      description: null,
    });
    expect(await screen.findByText("resourceAdded")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("edits a resource inline", async () => {
    const updated = { ...approved, title: "Updated guide", url: "https://example.com/updated" };
    vi.mocked(fetch).mockResolvedValueOnce(response({ resource: updated }));

    renderManager();

    fireEvent.click(screen.getByTestId("resource-edit-0"));
    fireEvent.change(screen.getByTestId("resource-edit-title-0"), {
      target: { value: "Updated guide" },
    });
    fireEvent.change(screen.getByTestId("resource-edit-url-0"), {
      target: { value: "https://example.com/updated" },
    });
    fireEvent.click(screen.getByTestId("resource-save-0"));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/admin/lessons/lesson-1/resources/approved-1");
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      title: "Updated guide",
      url: "https://example.com/updated",
    });
    expect(await screen.findByText("resourceSaved")).toBeInTheDocument();
  });

  it("approves a suggestion", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ resource: { ...suggested, status: "APPROVED" } }));

    renderManager();

    fireEvent.click(screen.getByTestId("resource-approve-1"));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/admin/lessons/lesson-1/resources/suggested-1");
    expect(JSON.parse(String(init?.body))).toEqual({ status: "APPROVED" });
    expect(refresh).toHaveBeenCalled();
  });

  it("dismisses a suggestion and removes it from the list", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ resource: { ...suggested, status: "DISMISSED" } }));

    renderManager();

    fireEvent.click(screen.getByTestId("resource-dismiss-1"));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toEqual({
      status: "DISMISSED",
    });
    await waitFor(() => expect(screen.queryByTestId("resource-item-1")).not.toBeInTheDocument());
  });

  it("deletes an approved resource after confirmation", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ ok: true }));

    renderManager();

    fireEvent.click(screen.getByTestId("resource-delete-0"));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(confirm).toHaveBeenCalledWith("resourceDeleteConfirm");
    expect(vi.mocked(fetch).mock.calls[0][1]?.method).toBe("DELETE");
    await waitFor(() => expect(screen.queryByText("Approved guide")).not.toBeInTheDocument());
  });

  it("renders an error when creation fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ error: { code: "internal_error" } }, 500));

    renderManager();

    fireEvent.change(screen.getByTestId("new-resource-title"), { target: { value: "Broken" } });
    fireEvent.change(screen.getByTestId("new-resource-url"), {
      target: { value: "https://example.com/broken" },
    });
    fireEvent.click(screen.getByTestId("new-resource-save"));

    expect(await screen.findByText("resourceCreateFailed")).toBeInTheDocument();
  });
});

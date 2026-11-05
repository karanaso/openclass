import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";

export function safeStorageKey(key: string): string {
  if (!key || key.includes("\0")) {
    throw new AppError("invalid_storage_key", "Invalid storage key", 400);
  }
  const normalized = key.replace(/\\/g, "/");
  if (path.isAbsolute(normalized) || normalized.split("/").some((part) => part === "..")) {
    throw new AppError("invalid_storage_key", "Path traversal rejected", 400);
  }
  return normalized.replace(/^\/+/, "");
}

export function randomStorageKey(prefix: string, extension = "pdf"): string {
  const cleanExtension = extension.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  const cleanPrefix = prefix.replace(/\/+$/, "");
  return `${cleanPrefix}/${randomUUID()}${cleanExtension ? `.${cleanExtension}` : ""}`;
}

export class LocalStorage {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    const safe = safeStorageKey(key);
    const absolute = path.resolve(this.root, safe);
    const root = path.resolve(this.root);
    if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
      throw new AppError("invalid_storage_key", "Path traversal rejected", 400);
    }
    return absolute;
  }

  getRoot(): string {
    return path.resolve(this.root);
  }

  getAbsolutePath(key: string): string {
    return this.resolve(key);
  }

  async put(key: string, data: Uint8Array | string): Promise<string> {
    const destination = this.resolve(key);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, data);
    return safeStorageKey(key);
  }

  async putFile(key: string, sourcePath: string): Promise<string> {
    const destination = this.resolve(key);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(sourcePath, destination);
    return safeStorageKey(key);
  }

  getStream(key: string) {
    return createReadStream(this.resolve(key));
  }

  async stat(key: string) {
    const stats = await fs.stat(this.resolve(key));
    return { size: stats.size, mtime: stats.mtime, isFile: stats.isFile() };
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  async deletePrefix(prefix: string): Promise<void> {
    const target = this.resolve(prefix);
    if (target === this.resolve(".")) {
      throw new AppError("invalid_storage_key", "Refusing to delete storage root", 400);
    }
    await fs.rm(target, { recursive: true, force: true });
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolve(key), { force: true });
  }
}

let singleton: LocalStorage | null = null;

export function getStorage(): LocalStorage {
  if (!singleton) {
    singleton = new LocalStorage(getEnv().STORAGE_ROOT);
  }
  return singleton;
}

export function resetStorage(): void {
  singleton = null;
}

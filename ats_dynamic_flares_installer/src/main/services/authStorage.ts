import { app, safeStorage } from "electron";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

type StoredAuthPayload = {
  deviceId: string;
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: string | null;
};

type AuthFileEnvelope = {
  encrypted: boolean;
  payload: string;
};

const DEFAULT_AUTH_PAYLOAD: StoredAuthPayload = {
  deviceId: randomUUID(),
  accessToken: null,
  refreshToken: null,
  accessTokenExpiresAt: null
};

export class AuthStorage {
  private readonly authPath = join(app.getPath("userData"), "auth.json");

  async load(): Promise<StoredAuthPayload> {
    try {
      const raw = await readFile(this.authPath, "utf8");
      const envelope = JSON.parse(raw) as AuthFileEnvelope;
      const decoded = envelope.encrypted
        ? safeStorage.decryptString(Buffer.from(envelope.payload, "base64"))
        : envelope.payload;
      const parsed = JSON.parse(decoded) as Partial<StoredAuthPayload>;

      return {
        deviceId: parsed.deviceId ?? randomUUID(),
        accessToken: parsed.accessToken ?? null,
        refreshToken: parsed.refreshToken ?? null,
        accessTokenExpiresAt: parsed.accessTokenExpiresAt ?? null
      };
    } catch {
      return { ...DEFAULT_AUTH_PAYLOAD };
    }
  }

  async save(payload: StoredAuthPayload): Promise<StoredAuthPayload> {
    const normalized: StoredAuthPayload = {
      deviceId: payload.deviceId,
      accessToken: payload.accessToken ?? null,
      refreshToken: payload.refreshToken ?? null,
      accessTokenExpiresAt: payload.accessTokenExpiresAt ?? null
    };

    const encodedPayload = JSON.stringify(normalized);
    const envelope: AuthFileEnvelope = safeStorage.isEncryptionAvailable()
      ? {
          encrypted: true,
          payload: safeStorage.encryptString(encodedPayload).toString("base64")
        }
      : {
          encrypted: false,
          payload: encodedPayload
        };

    await mkdir(dirname(this.authPath), { recursive: true });
    await writeFile(this.authPath, JSON.stringify(envelope, null, 2), "utf8");
    return normalized;
  }

  async patch(partial: Partial<StoredAuthPayload>): Promise<StoredAuthPayload> {
    const current = await this.load();
    return this.save({ ...current, ...partial });
  }

  async ensureDeviceId(): Promise<string> {
    const current = await this.load();

    if (current.deviceId) {
      return current.deviceId;
    }

    const nextDeviceId = randomUUID();
    await this.save({
      ...current,
      deviceId: nextDeviceId
    });

    return nextDeviceId;
  }

  async clearSession(): Promise<void> {
    const current = await this.load();
    await this.save({
      deviceId: current.deviceId,
      accessToken: null,
      refreshToken: null,
      accessTokenExpiresAt: null
    });
  }

  async deleteAll(): Promise<void> {
    try {
      await unlink(this.authPath);
    } catch {
      // Missing auth file is acceptable.
    }
  }
}

import { app } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AppSettings } from "../../shared/types";

const DEFAULT_SETTINGS: AppSettings = {
  selectedModFolder: null,
  brightness: 1.5,
  flareSize: 6,
  lastKnownInstalled: false,
  installedModVersion: null
};

export class SettingsStorage {
  private readonly settingsPath = join(app.getPath("userData"), "settings.json");

  async load(): Promise<AppSettings> {
    try {
      const raw = await readFile(this.settingsPath, "utf8");
      const parsed = JSON.parse(raw) as Partial<AppSettings>;

      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        brightness: this.normalizeNumber(parsed.brightness, DEFAULT_SETTINGS.brightness, 0, 5),
        flareSize: this.normalizeNumber(parsed.flareSize, DEFAULT_SETTINGS.flareSize, 1, 6)
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  async save(nextSettings: AppSettings): Promise<AppSettings> {
    const normalized: AppSettings = {
      selectedModFolder: nextSettings.selectedModFolder,
      brightness: this.normalizeNumber(nextSettings.brightness, DEFAULT_SETTINGS.brightness, 0, 5),
      flareSize: this.normalizeNumber(nextSettings.flareSize, DEFAULT_SETTINGS.flareSize, 1, 6),
      lastKnownInstalled: Boolean(nextSettings.lastKnownInstalled),
      installedModVersion: nextSettings.installedModVersion ?? null
    };

    await mkdir(dirname(this.settingsPath), { recursive: true });
    await writeFile(this.settingsPath, JSON.stringify(normalized, null, 2), "utf8");
    return normalized;
  }

  async patch(partial: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.load();
    return this.save({ ...current, ...partial });
  }

  private normalizeNumber(value: number | undefined, fallback: number, min: number, max: number): number {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return fallback;
    }

    return Math.min(max, Math.max(min, Math.round(value * 10) / 10));
  }
}

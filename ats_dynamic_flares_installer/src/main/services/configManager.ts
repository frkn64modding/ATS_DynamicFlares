import { copyFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { VisualSettings } from "../../shared/types";

const CONFIG_KEYS = {
  brightness: "g_bloom",
  flareSize: "g_bloom_standard_deviation",
  override: "g_bloom_override"
} as const;

export class ConfigManager {
  getConfigPath(gameDirectory: string): string {
    return join(gameDirectory, "config.cfg");
  }

  getBackupPath(gameDirectory: string): string {
    return join(gameDirectory, "config_dynamic_flares_backup.cfg");
  }

  async hasConfig(gameDirectory: string): Promise<boolean> {
    try {
      await readFile(this.getConfigPath(gameDirectory), "utf8");
      return true;
    } catch {
      return false;
    }
  }

  async ensureBackupExists(gameDirectory: string): Promise<void> {
    const configPath = this.getConfigPath(gameDirectory);
    const backupPath = this.getBackupPath(gameDirectory);

    try {
      await readFile(backupPath, "utf8");
    } catch {
      await copyFile(configPath, backupPath);
    }
  }

  async readCurrentValues(gameDirectory: string): Promise<Record<string, string> | null> {
    try {
      const content = await readFile(this.getConfigPath(gameDirectory), "utf8");
      return this.extractValues(content);
    } catch {
      return null;
    }
  }

  async applyInstallSettings(gameDirectory: string, settings: VisualSettings): Promise<void> {
    await this.ensureBackupExists(gameDirectory);
    await this.updateConfig(gameDirectory, {
      [CONFIG_KEYS.flareSize]: this.formatValue(settings.flareSize),
      [CONFIG_KEYS.override]: "1",
      [CONFIG_KEYS.brightness]: this.formatValue(settings.brightness)
    });
  }

  async applyUninstallSettings(gameDirectory: string): Promise<void> {
    await this.ensureBackupExists(gameDirectory);
    await this.updateConfig(gameDirectory, {
      [CONFIG_KEYS.flareSize]: "0",
      [CONFIG_KEYS.override]: "0",
      [CONFIG_KEYS.brightness]: "0.5"
    });
  }

  private async updateConfig(gameDirectory: string, entries: Record<string, string>): Promise<void> {
    const configPath = this.getConfigPath(gameDirectory);
    const content = await readFile(configPath, "utf8");
    const lines = content.split(/\r?\n/);

    for (const [key, value] of Object.entries(entries)) {
      const matcher = new RegExp(`^\\s*uset\\s+${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+"[^"]*"\\s*$`, "i");
      const newLine = `uset ${key} "${value}"`;
      const index = lines.findIndex((line) => matcher.test(line));

      if (index >= 0) {
        lines[index] = newLine;
      } else {
        lines.push(newLine);
      }
    }

    await writeFile(configPath, `${lines.join("\r\n").trimEnd()}\r\n`, "utf8");
  }

  private extractValues(content: string): Record<string, string> {
    const values: Record<string, string> = {};

    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*uset\s+([A-Za-z0-9_]+)\s+"([^"]*)"\s*$/);
      if (match) {
        values[match[1]] = match[2];
      }
    }

    return values;
  }

  private formatValue(value: number): string {
    const normalized = Math.round(value * 10) / 10;
    return Number.isInteger(normalized) ? normalized.toString() : normalized.toFixed(1);
  }
}

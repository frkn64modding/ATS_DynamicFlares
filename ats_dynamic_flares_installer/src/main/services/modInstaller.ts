import { app } from "electron";
import { copyFile, mkdir, rm } from "node:fs/promises";
import { access, constants } from "node:fs";
import { join, resolve } from "node:path";
import type { VisualSettings } from "../../shared/types";
import { ConfigManager } from "./configManager";
import { SettingsStorage } from "./settingsStorage";

const EMBEDDED_MOD_ARCHIVE_FILENAME = "ats_dynamic_flares.scs";
const INSTALLED_MOD_ARCHIVE_FILENAME = "ats_dynamic_flares.scs";

export class ModInstaller {
  constructor(
    private readonly configManager: ConfigManager,
    private readonly settingsStorage: SettingsStorage
  ) {}

  async install(modFolder: string, gameDirectory: string, settings: VisualSettings, modVersion: string): Promise<void> {
    const sourcePath = await this.resolveEmbeddedModPath();
    const destinationPath = join(modFolder, INSTALLED_MOD_ARCHIVE_FILENAME);

    await mkdir(modFolder, { recursive: true });
    await copyFile(sourcePath, destinationPath);
    await this.configManager.applyInstallSettings(gameDirectory, settings);
    await this.settingsStorage.patch({
      selectedModFolder: modFolder,
      brightness: settings.brightness,
      flareSize: settings.flareSize,
      lastKnownInstalled: true,
      installedModVersion: modVersion
    });
  }

  async uninstall(modFolder: string, gameDirectory: string): Promise<void> {
    await this.removeInstalledMod(modFolder);
    await this.configManager.applyUninstallSettings(gameDirectory);
    await this.settingsStorage.patch({ lastKnownInstalled: false, installedModVersion: null });
  }

  async uninstallForEntitlementLoss(modFolder: string, gameDirectory: string | null): Promise<void> {
    await this.removeInstalledMod(modFolder);

    if (gameDirectory && (await this.configManager.hasConfig(gameDirectory))) {
      await this.configManager.applyUninstallSettings(gameDirectory);
    }

    await this.settingsStorage.patch({ lastKnownInstalled: false, installedModVersion: null });
  }

  async isInstalled(modFolder: string | null): Promise<boolean> {
    if (!modFolder) {
      return false;
    }

    return this.pathExists(join(modFolder, INSTALLED_MOD_ARCHIVE_FILENAME));
  }

  private async removeInstalledMod(modFolder: string): Promise<void> {
    const destinationPath = join(modFolder, INSTALLED_MOD_ARCHIVE_FILENAME);

    try {
      await rm(destinationPath, { force: true });
    } catch {
      // Missing mod file should not block cleanup.
    }
  }

  private async resolveEmbeddedModPath(): Promise<string> {
    const candidates = [
      join(app.getAppPath(), "mod", EMBEDDED_MOD_ARCHIVE_FILENAME),
      join(process.cwd(), "mod", EMBEDDED_MOD_ARCHIVE_FILENAME),
      join(resolve(app.getAppPath(), ".."), "mod", EMBEDDED_MOD_ARCHIVE_FILENAME)
    ];

    for (const candidate of candidates) {
      if (await this.pathExists(candidate)) {
        return candidate;
      }
    }

    throw new Error("Embedded mod file is missing.");
  }

  private async pathExists(targetPath: string): Promise<boolean> {
    return new Promise((resolveExists) => {
      access(targetPath, constants.F_OK, (error) => resolveExists(!error));
    });
  }
}

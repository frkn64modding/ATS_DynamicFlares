import { app } from "electron";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join, resolve } from "node:path";

export type GamePaths = {
  documentsDirectory: string;
  gameDirectory: string;
  defaultModDirectory: string;
  configPath: string;
};

export class PathDetectionService {
  getDefaultPaths(): GamePaths {
    const documentsDirectory = app.getPath("documents");
    const gameDirectory = join(documentsDirectory, "American Truck Simulator");

    return {
      documentsDirectory,
      gameDirectory,
      defaultModDirectory: join(gameDirectory, "mod"),
      configPath: join(gameDirectory, "config.cfg")
    };
  }

  async pathExists(targetPath: string | null | undefined): Promise<boolean> {
    if (!targetPath) {
      return false;
    }

    try {
      await access(targetPath, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async resolvePreferredModFolder(savedPath: string | null): Promise<string | null> {
    if (savedPath) {
      return resolve(savedPath);
    }

    const { defaultModDirectory } = this.getDefaultPaths();
    if (await this.pathExists(defaultModDirectory)) {
      return defaultModDirectory;
    }

    return defaultModDirectory;
  }

  resolveGameDirectory(modFolder: string): string {
    return dirname(resolve(modFolder));
  }
}

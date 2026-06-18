import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { join, resolve } from "node:path";
import { ConfigManager } from "./services/configManager";
import { LicenseService } from "./services/licenseService";
import { ModInstaller } from "./services/modInstaller";
import { PathDetectionService } from "./services/pathDetectionService";
import { SettingsStorage } from "./services/settingsStorage";
import type { AppState, InstallationAction, VisualSettings } from "../shared/types";

const settingsStorage = new SettingsStorage();
const pathDetectionService = new PathDetectionService();
const configManager = new ConfigManager();
const licenseService = new LicenseService();
const modInstaller = new ModInstaller(configManager, settingsStorage);

const RECOMMENDED_SETTINGS: VisualSettings = {
  brightness: 1.5,
  flareSize: 6
};
const MOD_ARCHIVE_FILENAME = "ats_dynamic_flares.scs";
const ATS_LAUNCH_URL = "steam://rungameid/270880";
const SUBSCRIPTION_PAGE_URL =
  "https://modsy.io/american-truck-simulator/mods/dynamic-flares";

let mainWindow: BrowserWindow | null = null;

function resolveWindowIconPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "icon.png");
  }

  return join(app.getAppPath(), "build", "icon.png");
}

function shouldAutoUninstallForLicense(access: AppState["license"]["access"]): boolean {
  return access === "no_access" || access === "expired" || access === "revoked" || access === "banned";
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = right.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;

    if (leftValue > rightValue) {
      return 1;
    }

    if (leftValue < rightValue) {
      return -1;
    }
  }

  return 0;
}

function sanitizeSettings(input: VisualSettings): VisualSettings {
  const brightness = Number.isFinite(input.brightness) ? input.brightness : RECOMMENDED_SETTINGS.brightness;
  const flareSize = Number.isFinite(input.flareSize) ? input.flareSize : RECOMMENDED_SETTINGS.flareSize;

  return {
    brightness: Math.min(5, Math.max(0, Math.round(brightness * 10) / 10)),
    flareSize: Math.min(6, Math.max(1, Math.round(flareSize * 10) / 10))
  };
}

async function buildAppState(): Promise<AppState> {
  const storedSettings = await settingsStorage.load();
  const paths = pathDetectionService.getDefaultPaths();
  const bundledModVersion = app.getVersion();
  const modFolder = await pathDetectionService.resolvePreferredModFolder(storedSettings.selectedModFolder);
  const license = await licenseService.checkLicenseStatus();
  let installationState: AppState["installationState"] = (await modInstaller.isInstalled(modFolder))
    ? "installed"
    : "not-installed";

  if (modFolder && installationState === "installed" && shouldAutoUninstallForLicense(license.access)) {
    try {
      await modInstaller.uninstallForEntitlementLoss(
        modFolder,
        await configManager.hasConfig(paths.gameDirectory) ? paths.gameDirectory : null
      );
      installationState = (await modInstaller.isInstalled(modFolder)) ? "installed" : "not-installed";
    } catch {
      // Keep current status if automatic cleanup fails. The protected actions remain locked.
    }
  }

  const rawConfigValues = await configManager.readCurrentValues(paths.gameDirectory);
  const hasGameSettings = rawConfigValues !== null;
  let installationAction: InstallationAction = "install";

  if (installationState === "installed") {
    if (
      storedSettings.installedModVersion &&
      compareVersions(storedSettings.installedModVersion, bundledModVersion) < 0
    ) {
      installationAction = "update";
    } else {
      installationAction = "reinstall";
    }
  }

  let visualStatus: AppState["visualStatus"] = "unavailable";

  if (rawConfigValues) {
    const bloomOverride = rawConfigValues.g_bloom_override;
    const bloom = rawConfigValues.g_bloom;
    const flareSize = rawConfigValues.g_bloom_standard_deviation;

    if (bloomOverride === "1") {
      visualStatus =
        bloom === "1.5" && flareSize === "6"
          ? "optimized"
          : "custom";
    } else if (bloomOverride === "0") {
      visualStatus = "default";
    } else {
      visualStatus = "custom";
    }
  }

  return {
    modFolder,
    gameDirectory: hasGameSettings ? paths.gameDirectory : null,
    modFilePath: modFolder ? join(modFolder, MOD_ARCHIVE_FILENAME) : null,
    hasGameSettings,
    installationState,
    installationAction,
    bundledModVersion,
    visualStatus,
    settings: {
      ...storedSettings,
      selectedModFolder: modFolder
    },
    license
  };
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 960,
    minHeight: 700,
    icon: resolveWindowIconPath(),
    backgroundColor: "#0a111c",
    title: "Dynamic Flares ATS Installer",
    autoHideMenuBar: true,
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, "../preload/index.js")
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

async function ensureReady(): Promise<void> {
  await app.whenReady();

  ipcMain.handle("app:get-state", async () => buildAppState());
  ipcMain.handle("app:launch-ats", async () => {
    await shell.openExternal(ATS_LAUNCH_URL);
  });
  ipcMain.handle("app:open-external-link", async (_event, url: string) => {
    await shell.openExternal(url);
  });
  ipcMain.handle("app:open-subscription-page", async () => {
    await shell.openExternal(SUBSCRIPTION_PAGE_URL);
  });
  ipcMain.handle("app:auth:start", async () => licenseService.activateLicense());
  ipcMain.handle("app:auth:poll", async (_event, loginSessionId: string) => {
    const result = await licenseService.pollActivation(loginSessionId);

    if (result.status === "approved") {
      return {
        ...result,
        state: await buildAppState()
      };
    }

    return result;
  });
  ipcMain.handle("app:auth:logout", async () => {
    await licenseService.deactivateLicense();
    return buildAppState();
  });
  ipcMain.handle("app:select-mod-folder", async () => {
    const result = await dialog.showOpenDialog({
      title: "Select ATS mod folder",
      properties: ["openDirectory"]
    });

    if (!result.canceled && result.filePaths[0]) {
      await settingsStorage.patch({
        selectedModFolder: resolve(result.filePaths[0])
      });
    }

    return buildAppState();
  });

  ipcMain.handle("app:update-visual-settings", async (_event, settings: VisualSettings) => {
    const safeSettings = sanitizeSettings(settings);

    await settingsStorage.patch({
      brightness: safeSettings.brightness,
      flareSize: safeSettings.flareSize
    });

    return buildAppState();
  });

  ipcMain.handle("app:reset-recommended", async () => {
    await settingsStorage.patch({
      brightness: RECOMMENDED_SETTINGS.brightness,
      flareSize: RECOMMENDED_SETTINGS.flareSize
    });

    return buildAppState();
  });

  ipcMain.handle("app:install", async (_event, settings: VisualSettings) => {
    const state = await buildAppState();
    const safeSettings = sanitizeSettings(settings);
    const installSettings =
      state.installationAction === "install"
        ? safeSettings
        : { ...RECOMMENDED_SETTINGS };

    if (!state.modFolder) {
      throw new Error("Please select your ATS mod folder.");
    }

    if (!state.gameDirectory || !state.hasGameSettings) {
      throw new Error(
        "American Truck Simulator settings could not be found.\n\nPlease make sure the game has been launched at least once."
      );
    }

    if (!(await licenseService.isLicenseValid())) {
      const authStatus = await licenseService.checkLicenseStatus(true);
      throw new Error(authStatus.message);
    }

    try {
      await modInstaller.install(state.modFolder, state.gameDirectory, installSettings, state.bundledModVersion);
    } catch (error) {
      if (error instanceof Error && error.message.includes("Embedded mod file")) {
        throw error;
      }

      throw new Error("Unable to modify game settings.\n\nPlease ensure ATS is closed and try again.");
    }

    return {
      ok: true,
      message:
        "Dynamic Flares installed successfully.\n\nPlease launch ATS and enable the mod in the in-game Mod Manager.",
      state: await buildAppState()
    };
  });

  ipcMain.handle("app:uninstall", async () => {
    const state = await buildAppState();

    if (!state.modFolder) {
      throw new Error("Please select your ATS mod folder.");
    }

    if (!state.gameDirectory || !state.hasGameSettings) {
      throw new Error(
        "American Truck Simulator settings could not be found.\n\nPlease make sure the game has been launched at least once."
      );
    }

    try {
      await modInstaller.uninstall(state.modFolder, state.gameDirectory);
    } catch {
      throw new Error("Unable to modify game settings.\n\nPlease ensure ATS is closed and try again.");
    }

    return {
      ok: true,
      message: "Dynamic Flares has been uninstalled successfully.",
      state: await buildAppState()
    };
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}

void ensureReady();

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

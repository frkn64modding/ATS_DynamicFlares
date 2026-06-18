import { contextBridge, ipcRenderer } from "electron";
import type { DynamicFlaresApi, VisualSettings } from "../shared/types";

const api: DynamicFlaresApi = {
  getAppState: () => ipcRenderer.invoke("app:get-state"),
  installDynamicFlares: (settings: VisualSettings) => ipcRenderer.invoke("app:install", settings),
  uninstallDynamicFlares: () => ipcRenderer.invoke("app:uninstall"),
  selectModFolder: () => ipcRenderer.invoke("app:select-mod-folder"),
  resetToRecommended: () => ipcRenderer.invoke("app:reset-recommended"),
  updateVisualSettings: (settings: VisualSettings) => ipcRenderer.invoke("app:update-visual-settings", settings),
  startModsyLogin: () => ipcRenderer.invoke("app:auth:start"),
  pollModsyLogin: (loginSessionId: string) => ipcRenderer.invoke("app:auth:poll", loginSessionId),
  logoutModsy: () => ipcRenderer.invoke("app:auth:logout"),
  openSubscriptionPage: () => ipcRenderer.invoke("app:open-subscription-page"),
  openExternalLink: (url: string) => ipcRenderer.invoke("app:open-external-link", url),
  launchATS: () => ipcRenderer.invoke("app:launch-ats")
};

contextBridge.exposeInMainWorld("dynamicFlares", api);

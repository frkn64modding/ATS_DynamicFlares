export type VisualSettings = {
  brightness: number;
  flareSize: number;
};

export type InstallationState = "installed" | "not-installed" | "unknown";
export type InstallationAction = "install" | "update" | "reinstall";

export type VisualStatus = "optimized" | "default" | "unavailable" | "custom";

export type LicenseAccess =
  | "active"
  | "grace"
  | "expired"
  | "revoked"
  | "banned"
  | "no_access"
  | "signed_out"
  | "error";

export type LicenseSource = "patreon" | "lemon" | "manual" | "none" | (string & {});

export type LicenseStatus = {
  authenticated: boolean;
  valid: boolean;
  access: LicenseAccess;
  tier: string | null;
  source: LicenseSource | null;
  userName: string | null;
  email: string | null;
  checkedAt: string | null;
  validUntil: string | null;
  graceUntil: string | null;
  message: string;
};

export type AppSettings = {
  selectedModFolder: string | null;
  brightness: number;
  flareSize: number;
  lastKnownInstalled: boolean;
  installedModVersion: string | null;
};

export type AppState = {
  modFolder: string | null;
  gameDirectory: string | null;
  modFilePath: string | null;
  hasGameSettings: boolean;
  installationState: InstallationState;
  installationAction: InstallationAction;
  bundledModVersion: string;
  visualStatus: VisualStatus;
  settings: AppSettings;
  license: LicenseStatus;
};

export type OperationResult = {
  ok: boolean;
  message: string;
  state: AppState;
};

export type AuthChallenge = {
  loginSessionId: string;
  verificationUrl: string;
  verificationUriComplete: string;
  userCode: string;
  expiresIn: number;
  pollIntervalSeconds: number;
};

export type AuthPollResult = {
  status: "pending" | "approved" | "denied" | "expired";
  state?: AppState;
  message?: string;
};

export type DynamicFlaresApi = {
  getAppState: () => Promise<AppState>;
  installDynamicFlares: (settings: VisualSettings) => Promise<OperationResult>;
  uninstallDynamicFlares: () => Promise<OperationResult>;
  selectModFolder: () => Promise<AppState>;
  resetToRecommended: () => Promise<AppState>;
  updateVisualSettings: (settings: VisualSettings) => Promise<AppState>;
  startModsyLogin: () => Promise<AuthChallenge>;
  pollModsyLogin: (loginSessionId: string) => Promise<AuthPollResult>;
  logoutModsy: () => Promise<AppState>;
  openSubscriptionPage: () => Promise<void>;
  openExternalLink: (url: string) => Promise<void>;
  launchATS: () => Promise<void>;
};

declare global {
  interface Window {
    dynamicFlares: DynamicFlaresApi;
  }
}

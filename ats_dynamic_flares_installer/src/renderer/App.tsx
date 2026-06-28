import { useEffect, useState } from "react";
import type { AppState, AuthChallenge, LicenseStatus, VisualSettings } from "../shared/types";
import brandIcon from "../../build/icon.png";

const RECOMMENDED_SETTINGS: VisualSettings = {
  brightness: 1.5,
  flareSize: 6
};
const APP_STATE_REFRESH_MS = 5 * 60 * 1000;
const MODSY_DYNAMIC_FLARES_URL = "https://modsy.io/american-truck-simulator/mods/dynamic-flares";

type Banner = {
  tone: "success" | "error";
  message: string;
} | null;

type BusyAction = "install" | "uninstall" | "folder" | "apply" | "login" | "logout" | null;

type PendingLogin = AuthChallenge & {
  startedAt: number;
};

type CompletionDialog = {
  message: string;
} | null;

function sameSettings(left: VisualSettings, right: VisualSettings): boolean {
  return left.brightness === right.brightness && left.flareSize === right.flareSize;
}

function statusLabel(state: AppState | null): string {
  if (!state) {
    return "Checking installation";
  }

  if (state.installationAction === "update") {
    return "Update available";
  }

  return state.installationState === "installed" ? "Installed" : "Not installed";
}

function visualLabel(state: AppState | null): string {
  if (!state) {
    return "Scanning";
  }

  switch (state.visualStatus) {
    case "optimized":
      return "Recommended profile applied";
    case "custom":
      return "Custom flare profile ready";
    case "default":
      return "Default flare profile active";
    default:
      return "Game settings unavailable";
  }
}

function accountTone(license: LicenseStatus | null | undefined): string {
  if (!license) {
    return "neutral";
  }

  if (license.access === "active") {
    return "good";
  }

  if (license.access === "grace") {
    return "warn";
  }

  if (license.access === "signed_out") {
    return "neutral";
  }

  return "bad";
}

function accountLabel(license: LicenseStatus | null | undefined): string {
  if (!license) {
    return "Checking access";
  }

  switch (license.access) {
    case "active":
      return "Access verified";
    case "grace":
      return "Grace period";
    case "signed_out":
      return "Sign in required";
    case "no_access":
      return "Subscription required";
    case "expired":
      return "Subscription expired";
    case "revoked":
      return "Access revoked";
    case "banned":
      return "Account blocked";
    default:
      return "Unable to verify";
  }
}

function authTitle(license: LicenseStatus | null | undefined, pendingLogin: PendingLogin | null): string {
  if (pendingLogin) {
    return "Waiting for Approval";
  }

  if (!license || license.access === "signed_out" || license.access === "error") {
    return "Sign In with Modsy";
  }

  if (license.valid) {
    return "Subscription Access Ready";
  }

  return "Subscription Required";
}

function formatDate(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toLocaleString();
}

function formatVersion(value: string | null | undefined): string {
  if (!value) {
    return "Unknown";
  }

  const parts = value.split(".");

  while (parts.length > 2 && parts[parts.length - 1] === "0") {
    parts.pop();
  }

  if (parts.length === 1) {
    parts.push("0");
  }

  return `v${parts.join(".")}`;
}

function formatEntitlementSource(source: string | null | undefined): string | null {
  if (!source || source === "none") {
    return null;
  }

  switch (source.toLowerCase()) {
    case "patreon":
      return "Patreon";
    case "lemon":
      return "Lemon Squeezy";
    case "manual":
      return "Manual";
    default:
      return source
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
  }
}

export function App(): JSX.Element {
  const [state, setState] = useState<AppState | null>(null);
  const [settings, setSettings] = useState<VisualSettings>(RECOMMENDED_SETTINGS);
  const [banner, setBanner] = useState<Banner>(null);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [pendingLogin, setPendingLogin] = useState<PendingLogin | null>(null);
  const [completionDialog, setCompletionDialog] = useState<CompletionDialog>(null);

  useEffect(() => {
    const refresh = async (): Promise<void> => {
      const nextState = await window.dynamicFlares.getAppState();
      await syncState(nextState);
    };

    void refresh();

    const intervalId = window.setInterval(() => {
      void refresh();
    }, APP_STATE_REFRESH_MS);

    const onFocus = (): void => {
      void refresh();
    };

    window.addEventListener("focus", onFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    if (!completionDialog) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setCompletionDialog(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [completionDialog]);

  useEffect(() => {
    if (!pendingLogin) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async (): Promise<void> => {
      if (cancelled) {
        return;
      }

      if (Date.now() > pendingLogin.startedAt + pendingLogin.expiresIn * 1000) {
        setPendingLogin(null);
        setBanner({
          tone: "error",
          message: "Sign-in session expired. Please try again."
        });
        return;
      }

      try {
        const result = await window.dynamicFlares.pollModsyLogin(pendingLogin.loginSessionId);

        if (cancelled) {
          return;
        }

        if (result.status === "approved" && result.state) {
          await syncState(result.state);
          setPendingLogin(null);
          setBanner({
            tone: "success",
            message: "Modsy access verified successfully."
          });
          return;
        }

        if (result.status === "denied" || result.status === "expired") {
          setPendingLogin(null);
          setBanner({
            tone: "error",
            message: result.message ?? "Sign-in was not completed."
          });
          return;
        }
      } catch (error) {
        setPendingLogin(null);
        setBanner({
          tone: "error",
          message: error instanceof Error ? error.message : "Unable to complete Modsy sign-in."
        });
        return;
      }

      timer = setTimeout(() => {
        void poll();
      }, pendingLogin.pollIntervalSeconds * 1000);
    };

    timer = setTimeout(() => {
      void poll();
    }, pendingLogin.pollIntervalSeconds * 1000);

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [pendingLogin]);

  const insights = {
    location: state?.modFolder ?? "Not selected",
    installation: statusLabel(state),
    visuals: visualLabel(state)
  };
  const appliedSettings: VisualSettings = state
    ? {
        brightness: state.settings.brightness,
        flareSize: state.settings.flareSize
      }
    : RECOMMENDED_SETTINGS;
  const hasPendingSettings = !sameSettings(settings, appliedSettings);
  const canUseInstaller = Boolean(state?.license.valid);
  const controlsLocked = busyAction !== null || Boolean(pendingLogin);
  const advancedDisabled = !canUseInstaller || controlsLocked;
  const isInstalled = state?.installationState === "installed";
  const isUpdateAvailable = state?.installationAction === "update";
  const installedVersion = state?.settings.installedModVersion ?? null;
  const bundledVersion = state?.bundledModVersion ?? null;
  const needsSubscriptionHelp = Boolean(state?.license.authenticated && !state?.license.valid);
  const entitlementSource = formatEntitlementSource(state?.license.source);

  async function syncState(nextState: AppState): Promise<void> {
    setState(nextState);
    setSettings({
      brightness: nextState.settings.brightness,
      flareSize: nextState.settings.flareSize
    });
  }

  async function handleFolderChange(): Promise<void> {
    setBusyAction("folder");
    setBanner(null);

    try {
      const nextState = await window.dynamicFlares.selectModFolder();
      await syncState(nextState);
    } catch (error) {
      setBanner({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to select folder."
      });
    } finally {
      setBusyAction(null);
    }
  }

  function handleSettingsChange(nextSettings: VisualSettings): void {
    setSettings(nextSettings);
  }

  async function handleApplySettings(): Promise<void> {
    setBusyAction("apply");
    setBanner(null);

    try {
      const nextState = await window.dynamicFlares.updateVisualSettings(settings);
      await syncState(nextState);
    } catch (error) {
      setBanner({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to apply changes."
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleInstall(): Promise<void> {
    setBusyAction("install");
    setBanner(null);
    setCompletionDialog(null);

    try {
      const result = await window.dynamicFlares.installDynamicFlares(settings);
      await syncState(result.state);
      setCompletionDialog({ message: result.message });
    } catch (error) {
      setBanner({
        tone: "error",
        message: error instanceof Error ? error.message : "Installation failed."
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleUninstall(): Promise<void> {
    setBusyAction("uninstall");
    setBanner(null);
    setCompletionDialog(null);

    try {
      const result = await window.dynamicFlares.uninstallDynamicFlares();
      await syncState(result.state);
      setBanner({ tone: "success", message: result.message });
    } catch (error) {
      setBanner({
        tone: "error",
        message: error instanceof Error ? error.message : "Uninstall failed."
      });
    } finally {
      setBusyAction(null);
    }
  }

  function handleReset(): void {
    setSettings(RECOMMENDED_SETTINGS);
  }

  async function handleStartLogin(): Promise<void> {
    setBusyAction("login");
    setBanner(null);

    try {
      const challenge = await window.dynamicFlares.startModsyLogin();
      setPendingLogin({
        ...challenge,
        startedAt: Date.now()
      });
    } catch (error) {
      setBanner({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to start Modsy sign-in."
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleLogout(): Promise<void> {
    setBusyAction("logout");
    setBanner(null);
    setCompletionDialog(null);

    try {
      const nextState = await window.dynamicFlares.logoutModsy();
      setPendingLogin(null);
      await syncState(nextState);
      setBanner({
        tone: "success",
        message: "Signed out from Modsy."
      });
    } catch (error) {
      setBanner({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to sign out."
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleLaunchATS(): Promise<void> {
    try {
      await window.dynamicFlares.launchATS();
      setCompletionDialog(null);
    } catch (error) {
      setBanner({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to launch American Truck Simulator."
      });
    }
  }

  async function handleOpenExternalLink(url: string): Promise<void> {
    try {
      await window.dynamicFlares.openExternalLink(url);
    } catch (error) {
      setBanner({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to open external link."
      });
    }
  }

  return (
    <div className="shell">
      <div className="backdrop backdrop-primary" />
      <div className="backdrop backdrop-secondary" />

      <main className="app-frame">
        <section className="hero-card glass-card">
          <div className="hero-title-row">
            <img alt="" className="hero-brand-icon" src={brandIcon} />
            <div className="hero-title-copy">
              <h1>Dynamic Flares for ATS</h1>
              <span className="version-badge">{formatVersion(bundledVersion)}</span>
            </div>
          </div>
          <p className="subtitle">
            A modern lighting enhancement that combines realistic dynamic bloom with distance-aware flare rendering for a more natural nighttime driving experience.
          </p>
          <div className="hero-actions">
            <button
              className="button button-secondary"
              type="button"
              onClick={() => void handleOpenExternalLink(MODSY_DYNAMIC_FLARES_URL)}
            >
              View on Modsy
            </button>
          </div>
          <div className="hero-credit">by Frkn64 Modding</div>
        </section>

        <section className="content-grid">
          <div className="primary-column">
            <article className="glass-card status-card">
              <header className="section-header">
                <div>
                  <h2>Installation Overview</h2>
                  <p>Everything needed to get Dynamic Flares ready in a few clicks.</p>
                </div>
                <span className={`status-badge ${accountTone(state?.license)}`}>{accountLabel(state?.license)}</span>
              </header>

              <div className="status-list">
                <div className="status-item">
                  <span className="status-item-label">Mod folder</span>
                  <span className="status-item-value path-value">{insights.location}</span>
                </div>
                <div className="status-item">
                  <span className="status-item-label">Installation status</span>
                  <span className="status-item-value">{insights.installation}</span>
                </div>
                <div className="status-item">
                  <span className="status-item-label">Advanced settings status</span>
                  <span className="status-item-value">{insights.visuals}</span>
                </div>
                {isUpdateAvailable && installedVersion ? (
                  <div className="status-item">
                    <span className="status-item-label">Installed version</span>
                    <span className="status-item-value">{formatVersion(installedVersion)}</span>
                  </div>
                ) : null}
                {isUpdateAvailable && bundledVersion ? (
                  <div className="status-item">
                    <span className="status-item-label">Available version</span>
                    <span className="status-item-value">{formatVersion(bundledVersion)}</span>
                  </div>
                ) : null}
              </div>

              {!canUseInstaller ? (
                <div className="locked-note">
                  Sign in with Modsy and confirm an active subscription before installing Dynamic Flares.
                </div>
              ) : null}

              {canUseInstaller ? (
                <div className="warning-pill warning-pill-inline">
                  Please close American Truck Simulator before installing Dynamic Flares.
                </div>
              ) : null}

              <div className="action-row">
                {isInstalled ? (
                  <button
                    className="button button-accent"
                    disabled={controlsLocked || !canUseInstaller}
                    onClick={() => void handleInstall()}
                  >
                    {busyAction === "install"
                      ? isUpdateAvailable
                        ? "Updating..."
                        : "Re-installing..."
                      : isUpdateAvailable
                        ? "Update Dynamic Flares"
                        : "Re-install Dynamic Flares"}
                  </button>
                ) : (
                  <button
                    className="button button-accent"
                    disabled={controlsLocked || !canUseInstaller}
                    onClick={() => void handleInstall()}
                  >
                    {busyAction === "install" ? "Installing..." : "Install Dynamic Flares"}
                  </button>
                )}
                {isInstalled ? (
                  <button
                    className="button button-secondary"
                    disabled={controlsLocked}
                    onClick={() => void handleUninstall()}
                  >
                    {busyAction === "uninstall" ? "Removing..." : "Uninstall"}
                  </button>
                ) : null}
                <button
                  className="button button-ghost"
                  disabled={controlsLocked || !canUseInstaller}
                  onClick={() => void handleFolderChange()}
                >
                  {busyAction === "folder" ? "Opening..." : "Change Mod Folder"}
                </button>
              </div>
            </article>

            <article className="glass-card advanced-card">
              <button
                className="collapse-toggle"
                type="button"
                onClick={() => setAdvancedOpen((current) => !current)}
              >
                <span>Advanced Settings</span>
                <span className={`toggle-chevron ${advancedOpen ? "open" : ""}`}>▾</span>
              </button>

              {advancedOpen ? (
                <div className="advanced-panel">
                  {canUseInstaller ? (
                    <div className="warning-pill">
                      Please close American Truck Simulator before changing advanced settings.
                    </div>
                  ) : null}

                  <div className={`slider-block ${advancedDisabled ? "slider-block-disabled" : ""}`}>
                    <div className="slider-copy">
                      <div>
                        <h3>Flare Brightness</h3>
                        <p>Controls how bright and visible dynamic flares appear.</p>
                      </div>
                      <span className="value-pill">{settings.brightness.toFixed(1)}</span>
                    </div>
                    <input
                      aria-label="Flare Brightness"
                      className="range-input"
                      disabled={advancedDisabled}
                      max={5}
                      min={0}
                      step={0.1}
                      type="range"
                      value={settings.brightness}
                      onChange={(event) =>
                        handleSettingsChange({
                          ...settings,
                          brightness: Number(event.currentTarget.value)
                        })
                      }
                    />
                  </div>

                  <div className={`slider-block ${advancedDisabled ? "slider-block-disabled" : ""}`}>
                    <div className="slider-copy">
                      <div>
                        <h3>Flare Size</h3>
                        <p>Controls how large and soft dynamic flares appear.</p>
                      </div>
                      <span className="value-pill">{settings.flareSize.toFixed(1)}</span>
                    </div>
                    <input
                      aria-label="Flare Size"
                      className="range-input"
                      disabled={advancedDisabled}
                      max={6}
                      min={1}
                      step={0.1}
                      type="range"
                      value={settings.flareSize}
                      onChange={(event) =>
                        handleSettingsChange({
                          ...settings,
                          flareSize: Number(event.currentTarget.value)
                        })
                      }
                    />
                  </div>

                  <div className="advanced-actions">
                    {hasPendingSettings ? (
                      <button
                        className="button button-accent"
                        disabled={advancedDisabled}
                        type="button"
                        onClick={() => void handleApplySettings()}
                      >
                        {busyAction === "apply" ? "Applying..." : "Apply"}
                      </button>
                    ) : null}
                    <button className="button button-secondary" disabled={advancedDisabled} type="button" onClick={handleReset}>
                      Reset to Recommended
                    </button>
                    {hasPendingSettings ? <span className="pending-copy">Unsaved changes ready to apply.</span> : null}
                    <span className="recommended-copy">
                      Recommended profile: {RECOMMENDED_SETTINGS.brightness.toFixed(1)} brightness /{" "}
                      {RECOMMENDED_SETTINGS.flareSize.toFixed(1)} size
                    </span>
                  </div>
                </div>
              ) : null}
            </article>
          </div>

          <aside className="secondary-column">
            <article className="glass-card side-card account-card">
              <header className="section-header">
                <div>
                  <h2>{authTitle(state?.license, pendingLogin)}</h2>
                  {pendingLogin ? (
                    <p>Finish the Modsy sign-in in your browser to unlock the installer.</p>
                  ) : canUseInstaller ? (
                    <p>Signed in as {state?.license.userName ?? "Modsy user"}.</p>
                  ) : needsSubscriptionHelp ? null : (
                    <p>Sign in to your Modsy account to verify your subscription before installing Dynamic Flares.</p>
                  )}
                </div>
              </header>

              {pendingLogin ? (
                <div className="side-auth-panel">
                  <div className="spinner-shell" aria-hidden="true">
                    <span className="spinner-ring" />
                  </div>
                  <div className="auth-copy">
                    <p>Keep this window open while Modsy confirms your account.</p>
                    <p className="muted-inline">Approval usually completes a few seconds after browser confirmation.</p>
                  </div>
                </div>
              ) : canUseInstaller ? (
                <div className="side-auth-panel">
                  <div className="auth-copy">
                    <p>
                      Your subscription is verified and Dynamic Flares is ready for installation and updates.
                    </p>
                    {entitlementSource ? (
                      <p className="muted-inline">Access source: {entitlementSource}.</p>
                    ) : null}
                    {state?.license.access === "grace" && state.license.graceUntil ? (
                      <p className="muted-inline">Grace period ends {formatDate(state.license.graceUntil)}.</p>
                    ) : null}
                  </div>
                  <button
                    className="button button-ghost"
                    disabled={controlsLocked}
                    type="button"
                    onClick={() => void handleLogout()}
                  >
                    {busyAction === "logout" ? "Signing out..." : "Sign Out"}
                  </button>
                </div>
              ) : needsSubscriptionHelp ? (
                <div className="side-auth-panel side-auth-panel-stack">
                  <div className="auth-copy">
                    <p>
                      Signed in as <strong>{state?.license.userName ?? "Modsy user"}</strong>.
                    </p>
                    <p>We couldn&apos;t verify your subscription.</p>
                    <div className="help-panel">
                      <span className="help-panel-label">Next steps</span>
                      <div className="help-link-list">
                        <button
                          className="help-link"
                          type="button"
                          onClick={() => void handleOpenExternalLink(MODSY_DYNAMIC_FLARES_URL)}
                        >
                          <strong>Unlock this mod on Modsy</strong>
                          <span>Manage or start a valid subscription for Dynamic Flares.</span>
                        </button>
                      </div>
                      <div className="help-note">
                        If your subscription was renewed recently, sign out and sign in again to refresh access.
                      </div>
                    </div>
                  </div>
                  <div className="auth-button-group">
                    <button
                      className="button button-ghost"
                      disabled={controlsLocked}
                      type="button"
                      onClick={() => void handleLogout()}
                    >
                      {busyAction === "logout" ? "Signing out..." : "Sign Out"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="side-auth-panel side-auth-panel-stack">
                  <div className="auth-button-group">
                    <button
                      className="button button-accent"
                      disabled={controlsLocked}
                      type="button"
                      onClick={() => void handleStartLogin()}
                    >
                      {busyAction === "login" ? "Opening Modsy..." : "Sign In with Modsy"}
                    </button>
                  </div>
                </div>
              )}
            </article>

            <article className="glass-card side-card">
              <h2>Quick Notes</h2>
              {isInstalled ? (
                <div className="note-stack">
                  <div className="action-note">
                    To remove Dynamic Flares completely, use the <strong>Uninstall</strong> button here. Deleting{" "}
                    <code>ats_dynamic_flares.scs</code> from your mod folder will not fully uninstall the mod.
                  </div>
                  <div className="action-note">
                    Re-installing or updating the mod will reset your advanced settings to the recommended values.
                  </div>
                </div>
              ) : (
                <ul className="note-list">
                  <li>Sign in with Modsy once to verify access tied to your active subscription.</li>
                  <li>Choose your ATS mod folder only if automatic detection does not match your setup.</li>
                  <li>Install once, then enable Dynamic Flares from the in-game Mod Manager.</li>
                </ul>
              )}
            </article>
          </aside>
        </section>

        {banner ? (
          <section className={`banner ${banner.tone}`}>
            {banner.message.split("\n").map((line, index) => (
              <p key={`${banner.tone}-${index}`}>{line}</p>
            ))}
          </section>
        ) : null}
      </main>

      {completionDialog ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setCompletionDialog(null)}>
          <section
            aria-labelledby="install-success-title"
            aria-modal="true"
            className="modal-card glass-card"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-icon" aria-hidden="true">
              ✓
            </div>
            <h2 id="install-success-title">Installation Complete</h2>
            <div className="modal-copy">
              {completionDialog.message.split("\n").map((line, index) =>
                line ? <p key={`completion-${index}`}>{line}</p> : <div key={`completion-${index}`} className="modal-spacer" aria-hidden="true" />
              )}
            </div>
            <div className="modal-actions">
              <button className="button button-accent" type="button" onClick={() => void handleLaunchATS()}>
                Launch ATS
              </button>
              <button className="button button-ghost" type="button" onClick={() => setCompletionDialog(null)}>
                Close
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

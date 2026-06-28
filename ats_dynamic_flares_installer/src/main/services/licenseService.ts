import { app, shell } from "electron";
import os from "node:os";
import type { AuthChallenge, AuthPollResult, LicenseSource, LicenseStatus } from "../../shared/types";
import { AuthStorage } from "./authStorage";

const MODSY_BASE_URL = process.env.MODSY_API_BASE_URL ?? "https://modsy.io";
const PRODUCT_ID = "dynamic-flares-installer";
const ACCESS_TOKEN_SAFETY_WINDOW_MS = 30_000;
const STATUS_CACHE_WINDOW_MS = 30_000;

type ModsyUser = {
  id: string;
  name: string;
  email?: string | null;
};

type ModsyEntitlement = {
  product: string;
  access: "active" | "grace" | "expired" | "revoked" | "banned" | "no_access";
  source?: LicenseSource | null;
  plan_name?: string | null;
  valid_until?: string | null;
  grace_until?: string | null;
  checked_at?: string | null;
};

type StartLoginResponse = {
  login_session_id: string;
  verification_url: string;
  verification_uri_complete: string;
  user_code: string;
  expires_in: number;
  poll_interval_seconds: number;
};

type PollApprovedResponse = {
  status: "approved";
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: ModsyUser;
  entitlement: ModsyEntitlement;
};

type PollPendingResponse = {
  status: "pending" | "denied" | "expired";
};

type RefreshResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

type EntitlementResponse = {
  user: ModsyUser;
  entitlement: ModsyEntitlement;
};

type DesktopErrorEnvelope = {
  error?: {
    code?: string;
    message?: string;
  };
};

class ModsyApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ModsyApiError";
  }
}

export class LicenseService {
  private readonly authStorage = new AuthStorage();
  private cachedStatus: { status: LicenseStatus; createdAt: number } | null = null;

  async checkLicenseStatus(force = false): Promise<LicenseStatus> {
    if (!force && this.cachedStatus && Date.now() - this.cachedStatus.createdAt < STATUS_CACHE_WINDOW_MS) {
      return this.cachedStatus.status;
    }

    const storedAuth = await this.authStorage.load();

    if (!storedAuth.refreshToken) {
      const signedOutStatus = this.buildSignedOutStatus();
      this.cachedStatus = {
        status: signedOutStatus,
        createdAt: Date.now()
      };
      return signedOutStatus;
    }

    try {
      const accessToken = await this.ensureAccessToken();
      const entitlement = await this.fetchEntitlement(accessToken);
      const nextStatus = this.mapEntitlementToStatus(entitlement.user, entitlement.entitlement);

      this.cachedStatus = {
        status: nextStatus,
        createdAt: Date.now()
      };

      return nextStatus;
    } catch (error) {
      if (error instanceof ModsyApiError) {
        if (error.code === "TOKEN_EXPIRED" || error.code === "TOKEN_REVOKED" || error.status === 401) {
          await this.authStorage.clearSession();
          const signedOutStatus = this.buildSignedOutStatus("Your Modsy session has expired. Please sign in again.");
          this.cachedStatus = {
            status: signedOutStatus,
            createdAt: Date.now()
          };
          return signedOutStatus;
        }

        const failedStatus = this.buildErrorStatus(error.message);
        this.cachedStatus = {
          status: failedStatus,
          createdAt: Date.now()
        };
        return failedStatus;
      }

      const failedStatus = this.buildErrorStatus(
        "Unable to verify your subscription right now. Please check your connection and try again."
      );
      this.cachedStatus = {
        status: failedStatus,
        createdAt: Date.now()
      };
      return failedStatus;
    }
  }

  async isLicenseValid(): Promise<boolean> {
    const status = await this.checkLicenseStatus(true);
    return status.valid;
  }

  async activateLicense(): Promise<AuthChallenge> {
    const deviceId = await this.authStorage.ensureDeviceId();
    const response = await this.request<StartLoginResponse>("/api/desktop/auth/start", {
      method: "POST",
      body: JSON.stringify({
        app_id: PRODUCT_ID,
        app_version: app.getVersion(),
        device_name: `${os.hostname()} (${process.platform})`,
        device_id: deviceId
      })
    });

    await shell.openExternal(response.verification_uri_complete);

    return {
      loginSessionId: response.login_session_id,
      verificationUrl: response.verification_url,
      verificationUriComplete: response.verification_uri_complete,
      userCode: response.user_code,
      expiresIn: response.expires_in,
      pollIntervalSeconds: response.poll_interval_seconds
    };
  }

  async pollActivation(loginSessionId: string): Promise<AuthPollResult> {
    const response = await this.request<PollApprovedResponse | PollPendingResponse>("/api/desktop/auth/poll", {
      method: "POST",
      body: JSON.stringify({
        login_session_id: loginSessionId
      })
    });

    if (response.status !== "approved") {
      return {
        status: response.status,
        message:
          response.status === "denied"
            ? "Sign-in was denied."
            : response.status === "expired"
              ? "Sign-in session expired. Please try again."
              : undefined
      };
    }

    const expiresAt = new Date(Date.now() + response.expires_in * 1000).toISOString();
    await this.authStorage.patch({
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      accessTokenExpiresAt: expiresAt
    });

    const nextStatus = this.mapEntitlementToStatus(response.user, response.entitlement);
    this.cachedStatus = {
      status: nextStatus,
      createdAt: Date.now()
    };

    return {
      status: "approved"
    };
  }

  async deactivateLicense(): Promise<void> {
    const storedAuth = await this.authStorage.load();

    try {
      if (storedAuth.refreshToken) {
        await this.request("/api/desktop/auth/logout", {
          method: "POST",
          body: JSON.stringify({
            refresh_token: storedAuth.refreshToken,
            device_id: storedAuth.deviceId
          })
        });
      }
    } catch (error) {
      if (!(error instanceof ModsyApiError) || error.status !== 401) {
        throw error;
      }
    } finally {
      this.cachedStatus = null;
      await this.authStorage.clearSession();
    }
  }

  private async ensureAccessToken(): Promise<string> {
    const storedAuth = await this.authStorage.load();

    if (
      storedAuth.accessToken &&
      storedAuth.accessTokenExpiresAt &&
      new Date(storedAuth.accessTokenExpiresAt).getTime() - ACCESS_TOKEN_SAFETY_WINDOW_MS > Date.now()
    ) {
      return storedAuth.accessToken;
    }

    if (!storedAuth.refreshToken) {
      throw new ModsyApiError("Please sign in with Modsy to continue.", "TOKEN_EXPIRED", 401);
    }

    const refreshResponse = await this.request<RefreshResponse>("/api/desktop/auth/refresh", {
      method: "POST",
      body: JSON.stringify({
        refresh_token: storedAuth.refreshToken,
        device_id: storedAuth.deviceId
      })
    });

    const nextExpiresAt = new Date(Date.now() + refreshResponse.expires_in * 1000).toISOString();
    await this.authStorage.patch({
      accessToken: refreshResponse.access_token,
      refreshToken: refreshResponse.refresh_token,
      accessTokenExpiresAt: nextExpiresAt
    });

    return refreshResponse.access_token;
  }

  private async fetchEntitlement(accessToken: string): Promise<EntitlementResponse> {
    return this.request<EntitlementResponse>("/api/desktop/entitlement", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  private mapEntitlementToStatus(user: ModsyUser, entitlement: ModsyEntitlement): LicenseStatus {
    const valid = entitlement.access === "active" || entitlement.access === "grace";

    return {
      authenticated: true,
      valid,
      access: entitlement.access,
      tier: entitlement.plan_name ?? null,
      source: entitlement.source ?? null,
      userName: user.name,
      email: user.email ?? null,
      checkedAt: entitlement.checked_at ?? null,
      validUntil: entitlement.valid_until ?? null,
      graceUntil: entitlement.grace_until ?? null,
      message: this.messageForAccess(entitlement.access)
    };
  }

  private messageForAccess(access: ModsyEntitlement["access"]): string {
    switch (access) {
      case "active":
        return "Subscription verified through Modsy.";
      case "grace":
        return "Subscription is in grace period. Access is still available for now.";
      case "expired":
        return "Your subscription has expired. Please renew it in Modsy to continue.";
      case "revoked":
        return "Access has been revoked for this product.";
      case "banned":
        return "This account is currently blocked from using the tool.";
      default:
        return "A valid subscription is required to use this tool.";
    }
  }

  private buildSignedOutStatus(message = "Sign in with Modsy to verify your subscription and use the tool."): LicenseStatus {
    return {
      authenticated: false,
      valid: false,
      access: "signed_out",
      tier: null,
      source: null,
      userName: null,
      email: null,
      checkedAt: null,
      validUntil: null,
      graceUntil: null,
      message
    };
  }

  private buildErrorStatus(message: string): LicenseStatus {
    return {
      authenticated: false,
      valid: false,
      access: "error",
      tier: null,
      source: null,
      userName: null,
      email: null,
      checkedAt: null,
      validUntil: null,
      graceUntil: null,
      message
    };
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(`${MODSY_BASE_URL}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(init.headers ?? {})
      }
    });

    const text = await response.text();
    const contentType = response.headers.get("content-type") ?? "";
    let data: T | DesktopErrorEnvelope | null = null;

    if (text) {
      if (contentType.includes("application/json")) {
        data = JSON.parse(text) as T | DesktopErrorEnvelope;
      } else {
        const compactBody = text.replace(/\s+/g, " ").trim();
        const htmlLikeResponse = compactBody.startsWith("<!DOCTYPE") || compactBody.startsWith("<html");
        const message = htmlLikeResponse
          ? "Modsy returned an HTML page instead of the desktop auth API response. The desktop auth endpoints may not be deployed on the configured Modsy host yet."
          : "Modsy returned a non-JSON response. Please verify the configured desktop auth API host.";

        throw new ModsyApiError(message, "INVALID_RESPONSE", response.status);
      }
    }

    if (!response.ok) {
      const errorEnvelope = data as DesktopErrorEnvelope | null;
      throw new ModsyApiError(
        errorEnvelope?.error?.message ?? "The Modsy service returned an error.",
        errorEnvelope?.error?.code ?? "SERVER_ERROR",
        response.status
      );
    }

    return data as T;
  }
}

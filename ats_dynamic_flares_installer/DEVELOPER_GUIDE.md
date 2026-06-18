# Dynamic Flares Installer Developer Guide

This document explains what the application does, how it is structured, and which parts are responsible for installation, settings management, and Modsy subscription verification.

It is intended for a new developer joining the project.

## What This App Does

`Dynamic Flares ATS Installer` is a Windows desktop application for American Truck Simulator.

Its responsibilities are:

- verify the user has access through `Modsy`
- install the bundled `ats_dynamic_flares.scs` mod file into the ATS mod folder
- manage the visual flare values used by the mod
- uninstall the mod and restore default values
- automatically remove the mod if the user loses entitlement

The app is packaged as a single portable `.exe` using Electron.

## High-Level Architecture

The project uses:

- `Electron` for the desktop shell
- `React` for the renderer UI
- `TypeScript` across main, preload, renderer, and shared types
- `electron-vite` for dev/build
- `electron-builder` for packaging

The code is split into four main areas:

- `src/main`
  Handles filesystem access, path detection, Modsy auth, install/uninstall logic, and IPC handlers.

- `src/preload`
  Exposes a safe API from Electron main to the renderer.

- `src/renderer`
  Contains the React UI and user interaction logic.

- `src/shared`
  Contains shared TypeScript types used by both main and renderer.

## Folder Overview

Important project files and folders:

- [package.json](</c:/Users/Furkan/Desktop/dynamic flares/package.json>)
  Build scripts, Electron Builder config, packaging settings.

- [electron.vite.config.ts](</c:/Users/Furkan/Desktop/dynamic flares/electron.vite.config.ts>)
  Vite config for main, preload, and renderer builds.

- [src/main/index.ts](</c:/Users/Furkan/Desktop/dynamic flares/src/main/index.ts>)
  Main Electron process entrypoint and IPC wiring.

- [src/main/services](</c:/Users/Furkan/Desktop/dynamic flares/src/main/services>)
  Core services for auth, paths, config, install, and persistence.

- [src/preload/index.ts](</c:/Users/Furkan/Desktop/dynamic flares/src/preload/index.ts>)
  `contextBridge` API exposed to the renderer.

- [src/renderer/App.tsx](</c:/Users/Furkan/Desktop/dynamic flares/src/renderer/App.tsx>)
  Main UI.

- [src/renderer/styles.css](</c:/Users/Furkan/Desktop/dynamic flares/src/renderer/styles.css>)
  Application styling.

- [src/shared/types.ts](</c:/Users/Furkan/Desktop/dynamic flares/src/shared/types.ts>)
  Shared app contracts.

- `mod/ats_dynamic_flares.scs`
  The bundled mod payload packaged into the app.

## Main Process Responsibilities

The Electron main process is the trusted side of the app. It owns:

- filesystem access
- Modsy auth/session handling
- config file modifications
- installation and uninstall logic
- external browser opening
- packaging/runtime app state

### Main Entry

The main runtime orchestration lives in:

- [src/main/index.ts](</c:/Users/Furkan/Desktop/dynamic flares/src/main/index.ts>)

This file:

- creates the Electron window
- builds current app state
- registers IPC handlers
- enforces entitlement before protected actions
- triggers automatic uninstall on entitlement loss

## Service Layer

### `PathDetectionService`

File:
- [src/main/services/pathDetectionService.ts](</c:/Users/Furkan/Desktop/dynamic flares/src/main/services/pathDetectionService.ts>)

Purpose:

- finds the user’s `Documents\American Truck Simulator` directory
- derives the default `mod` folder
- checks whether folders/files exist
- resolves the preferred mod folder from saved settings or defaults

### `SettingsStorage`

File:
- [src/main/services/settingsStorage.ts](</c:/Users/Furkan/Desktop/dynamic flares/src/main/services/settingsStorage.ts>)

Purpose:

- persists app settings in Electron user data
- stores:
  - selected mod folder
  - flare slider values
  - last known install flag

Notes:

- current slider defaults are:
  - brightness: `1.5`
  - flare size: `6`
- saved values are sanitized before writing

### `AuthStorage`

File:
- [src/main/services/authStorage.ts](</c:/Users/Furkan/Desktop/dynamic flares/src/main/services/authStorage.ts>)

Purpose:

- stores Modsy auth session data locally
- keeps:
  - device ID
  - access token
  - refresh token
  - access token expiry

Notes:

- uses Electron `safeStorage` encryption when available
- if encryption is unavailable, the file falls back to plain JSON storage

### `LicenseService`

File:
- [src/main/services/licenseService.ts](</c:/Users/Furkan/Desktop/dynamic flares/src/main/services/licenseService.ts>)

Purpose:

- integrates with Modsy desktop auth endpoints
- starts browser login
- polls approval state
- refreshes access tokens
- fetches entitlement status
- signs the user out

Current behavior:

- opens Modsy in the user’s browser
- stores the returned app tokens locally
- treats `active` and `grace` as valid entitlement
- blocks install access for:
  - `no_access`
  - `expired`
  - `revoked`
  - `banned`
- provides human-readable messages for the UI

Important detail:

- the app never talks to Patreon directly
- Modsy is the only entitlement source

### `ConfigManager`

File:
- [src/main/services/configManager.ts](</c:/Users/Furkan/Desktop/dynamic flares/src/main/services/configManager.ts>)

Purpose:

- reads and updates ATS `config.cfg`
- creates a backup file if needed
- preserves unrelated config entries

Current managed values:

- `g_bloom`
- `g_bloom_override`
- `g_bloom_standard_deviation`

Backup file:

- `config_dynamic_flares_backup.cfg`

Important UI rule:

- these technical details are intentionally hidden from the normal user interface

### `ModInstaller`

File:
- [src/main/services/modInstaller.ts](</c:/Users/Furkan/Desktop/dynamic flares/src/main/services/modInstaller.ts>)

Purpose:

- copies the packaged `.scs` file into the target mod folder
- applies the chosen flare values on install
- removes the mod and restores default values on uninstall
- handles uninstall when entitlement is lost

Install payload:

- `ats_dynamic_flares.scs`

Install target:

- selected ATS mod folder

## App State Model

Shared types live in:

- [src/shared/types.ts](</c:/Users/Furkan/Desktop/dynamic flares/src/shared/types.ts>)

The main shape passed to the renderer is `AppState`.

It includes:

- current mod folder
- game directory
- whether game settings were found
- install status
- visual settings status
- persisted slider settings
- current Modsy entitlement status

The renderer should treat this as the source of truth for visible UI state.

## Renderer Responsibilities

The React app is in:

- [src/renderer/App.tsx](</c:/Users/Furkan/Desktop/dynamic flares/src/renderer/App.tsx>)

The renderer is responsible for:

- showing signed-out vs signed-in UI
- showing waiting-for-approval state during browser login
- showing subscription-required state and subscribe button
- displaying install/uninstall/re-install actions
- staging advanced slider changes before apply
- refreshing app state while the app is open

### Current UI Behavior

- if not signed in:
  - show `Sign In with Modsy`

- if signed in but not entitled:
  - show locked state
  - show `Subscribe` button only for `no_access` or `expired`

- if signed in and entitled:
  - allow install actions

- if mod is installed:
  - show `Re-install Dynamic Flares`
  - show `Uninstall`

- if mod is not installed:
  - show only `Install Dynamic Flares`

- advanced settings:
  - changes are staged locally
  - `Apply` appears only when values differ from saved values

### State Refresh

The renderer refreshes app state:

- on launch
- when the window regains focus
- every 5 minutes while the app stays open

This is important because entitlement loss can trigger automatic uninstall on the main-process side.

## Preload API

File:

- [src/preload/index.ts](</c:/Users/Furkan/Desktop/dynamic flares/src/preload/index.ts>)

Purpose:

- exposes a minimal, safe API from Electron main to the renderer
- prevents direct Node access in the UI

Examples of exposed operations:

- `getAppState`
- `installDynamicFlares`
- `uninstallDynamicFlares`
- `startModsyLogin`
- `pollModsyLogin`
- `logoutModsy`
- `openSubscriptionPage`

If you add a new privileged operation, it should usually be:

1. implemented in main process
2. exposed in preload
3. typed in `src/shared/types.ts`
4. consumed in the renderer

## Installation Flow

Current install flow:

1. Renderer calls `installDynamicFlares`.
2. Main process rebuilds app state.
3. Main process verifies:
   - mod folder exists or is chosen
   - ATS config exists
   - Modsy entitlement is valid
4. `ModInstaller.install()` copies `ats_dynamic_flares.scs`.
5. `ConfigManager.applyInstallSettings()` writes flare values.
6. Success message is returned to the renderer.

## Uninstall Flow

Current uninstall flow:

1. Renderer calls `uninstallDynamicFlares`.
2. Main process rebuilds app state.
3. Main process verifies the ATS config exists.
4. `ModInstaller.uninstall()` removes the mod file.
5. `ConfigManager.applyUninstallSettings()` restores default flare values.
6. Success message is returned to the renderer.

## Automatic Uninstall on Entitlement Loss

This is an important rule in the current app.

When the main process rebuilds app state, it checks Modsy entitlement.

If:

- the mod is installed
- and entitlement becomes one of:
  - `no_access`
  - `expired`
  - `revoked`
  - `banned`

then the app automatically:

- removes `ats_dynamic_flares.scs`
- attempts to restore default config values

This logic currently lives in:

- [src/main/index.ts](</c:/Users/Furkan/Desktop/dynamic flares/src/main/index.ts>)
- [src/main/services/modInstaller.ts](</c:/Users/Furkan/Desktop/dynamic flares/src/main/services/modInstaller.ts>)

## Recommended Flare Values

The current recommended values are:

- `g_bloom = 1.5`
- `g_bloom_standard_deviation = 6`

These values are referenced in multiple places:

- default saved settings
- renderer defaults
- install defaults
- reset action
- “optimized” status detection

If these values change in the future, update all relevant locations together.

## Advanced Setting Ranges

Current ranges:

- `Flare Brightness`
  - min: `0`
  - max: `5`

- `Flare Size`
  - min: `1`
  - max: `6`

These limits are enforced in:

- renderer slider props
- main process sanitization
- settings persistence

## Packaging and Build

Build config is in:

- [package.json](</c:/Users/Furkan/Desktop/dynamic flares/package.json>)

Key packaging notes:

- packaged as a portable Windows executable
- output file:
  - `release/ATSDynamicFlaresInstaller.exe`
- app resources are packed into `asar`
- only `en-US` Electron locale is kept to reduce size
- portable unpack directory name is fixed for more predictable launch behavior

### Commands

Install dependencies:

```powershell
npm install
```

Run dev mode:

```powershell
npm run dev
```

Typecheck:

```powershell
npm run typecheck
```

Build bundles:

```powershell
npm run build
```

Build portable EXE:

```powershell
npm run dist
```

## Where Local Data Is Stored

Electron stores app data under its user data directory.

This includes:

- settings JSON
- auth JSON

The exact absolute path depends on the current Windows user and Electron app identity.

## Extension Guidance

If you modify the app, use these rules:

### When adding UI-only behavior

Edit:

- [src/renderer/App.tsx](</c:/Users/Furkan/Desktop/dynamic flares/src/renderer/App.tsx>)
- [src/renderer/styles.css](</c:/Users/Furkan/Desktop/dynamic flares/src/renderer/styles.css>)

### When adding filesystem, auth, or game integration logic

Edit:

- `src/main/services/*`
- [src/main/index.ts](</c:/Users/Furkan/Desktop/dynamic flares/src/main/index.ts>)

### When adding new privileged renderer actions

Update all of:

- [src/shared/types.ts](</c:/Users/Furkan/Desktop/dynamic flares/src/shared/types.ts>)
- [src/preload/index.ts](</c:/Users/Furkan/Desktop/dynamic flares/src/preload/index.ts>)
- [src/main/index.ts](</c:/Users/Furkan/Desktop/dynamic flares/src/main/index.ts>)
- renderer call sites

### When changing flare defaults or ranges

Check all of:

- renderer defaults
- settings defaults
- main-process sanitizer
- status detection logic
- UI labels / recommended text

## Known Tradeoffs

### App size

This is an Electron app packaged as a single portable EXE.

That means:

- the app includes the Chromium/Electron runtime
- the final file will be much larger than a native utility
- startup is slower than an installed native app

Recent size reduction work already:

- trimmed Electron locales to `en-US`
- improved perceived startup by showing the window earlier

Further major improvements would require:

- using an installed target instead of portable
- or moving away from Electron entirely

### Auth dependency

The app depends on Modsy availability for authentication and entitlement checks.

If Modsy returns invalid responses or HTML error pages, login cannot complete.

## Suggested Reading Order for a New Developer

If you are new to the project, start here:

1. [README.md](</c:/Users/Furkan/Desktop/dynamic flares/README.md>)
2. [DEVELOPER_GUIDE.md](</c:/Users/Furkan/Desktop/dynamic flares/DEVELOPER_GUIDE.md>)
3. [src/shared/types.ts](</c:/Users/Furkan/Desktop/dynamic flares/src/shared/types.ts>)
4. [src/main/index.ts](</c:/Users/Furkan/Desktop/dynamic flares/src/main/index.ts>)
5. service files in `src/main/services`
6. [src/preload/index.ts](</c:/Users/Furkan/Desktop/dynamic flares/src/preload/index.ts>)
7. [src/renderer/App.tsx](</c:/Users/Furkan/Desktop/dynamic flares/src/renderer/App.tsx>)

That order gives the clearest picture of how the app fits together.

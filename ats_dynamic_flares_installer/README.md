# Dynamic Flares Installer

Premium Electron desktop installer and manager for the Dynamic Flares American Truck Simulator mod.

Developer documentation:

- [DEVELOPER_GUIDE.md](</c:/Users/Furkan/Desktop/dynamic flares/DEVELOPER_GUIDE.md>)
- [ARCHITECTURE.md](</c:/Users/Furkan/Desktop/dynamic flares/ARCHITECTURE.md>)

## Stack

- Electron
- React
- TypeScript
- electron-vite
- electron-builder

## Features

- Bundles `mod/ats_dynamic_flares.scs` inside the packaged app.
- Detects the ATS documents folder automatically.
- Supports manual mod folder selection with persistence between launches.
- Installs or removes the mod file.
- Applies and restores the hidden flare profile in `config.cfg` while preserving unrelated values.
- Creates `config_dynamic_flares_backup.cfg` before the first modification.
- Stores slider preferences and last known installation state locally.
- Uses Modsy-based desktop authentication and entitlement verification.

## Project Structure

- `src/main`: Electron main process and installer services
- `src/preload`: Secure renderer bridge
- `src/renderer`: React UI
- `src/shared`: Shared types
- `mod`: Embedded SCS payload included in packaging

## Development

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Start the desktop app in development mode:

   ```powershell
   npm run dev
   ```

3. Optional typecheck:

   ```powershell
   npm run typecheck
   ```

## Build Portable EXE

Run:

```powershell
npm run dist
```

Expected output:

- `release/ATSDynamicFlaresInstaller.exe`

This uses Electron's portable Windows target so the final distributable is a single executable file.

## Internal Modules

- `PathDetectionService`: ATS path discovery
- `ConfigManager`: backup creation and targeted config updates
- `ModInstaller`: embedded mod extraction and install flow
- `SettingsStorage`: local persistence in Electron user data
- `LicenseService`: future-ready placeholder interface

## Notes

- The normal UI intentionally hides technical file-editing details from the user.
- If ATS has never been launched, the app will prompt the user with the specified recovery message.

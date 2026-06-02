<p align="center">
  <img src="icons/ios/AppIcon.appiconset/icon-1024.png" alt="sub2api-mobile logo" width="96" />
</p>

<h1 align="center">sub2api-mobile</h1>

<p align="center">
  A polished mobile admin console for Sub2API, built with Expo, React Native, Expo Router, and TanStack Query.
</p>

<p align="center">
  <img src="docs/screenshots/showcase.png" alt="sub2api-mobile showcase" width="920" />
</p>

> Screenshots are captured from a real Android device and redacted before publishing.

## Overview

sub2api-mobile brings the Sub2API admin workflow onto a phone: operational dashboards, account health, usage windows, proxy quality, user/API key management, and server status in one native-feeling interface.

It is designed for operators who need to glance at live usage, spot unhealthy accounts, refresh or test accounts, and switch between admin servers without opening the web dashboard.

## Highlights

- **Live dashboard** with 24H / 7D / 30D / total ranges, token throughput, cost, latency, RPM/TPM, and account health summaries.
- **Account list aligned with the web admin view**, including group filters, status filters, request sorting, OAuth 5h / 7d windows, and API Key daily usage stats.
- **Manual account testing** that follows the web admin flow: load available models, pick a default model, call the streaming test endpoint, and show live pass/fail feedback.
- **Proxy pool management** with health filters, quality checks, latency/score views, region metadata, and manual detection support.
- **Admin resources** for users, API keys, groups, balances, server health, and multi-server configuration.
- **Mobile-first UI** with compact cards, large touch targets, bottom navigation, and redacted-safe public screenshots.

## Screenshots

<p align="center">
  <img src="docs/screenshots/overview.png" alt="Dashboard overview" width="260" />
  <img src="docs/screenshots/models.png" alt="Hot models" width="260" />
  <img src="docs/screenshots/accounts.png" alt="Account list" width="260" />
  <img src="docs/screenshots/proxies.png" alt="Proxy pool" width="260" />
</p>

## Tech Stack

- Expo SDK 54
- React Native 0.81
- React 19
- Expo Router
- TanStack Query
- Valtio
- TypeScript

## Prerequisites

- Node.js 20+
- npm 10+
- Android Studio / Android SDK for native Android builds
- Optional: EAS CLI for cloud builds and OTA updates

## Getting Started

Install dependencies:

```bash
npm ci
```

Run locally:

```bash
npm run start
```

Common targets:

```bash
npm run android
npm run ios
npm run web
```

## Build & Release

EAS scripts:

```bash
npm run eas:build:development
npm run eas:build:preview
npm run eas:build:production
```

OTA update scripts:

```bash
npm run eas:update:preview -- "your message"
npm run eas:update:production -- "your message"
```

Additional release notes: [docs/EXPO_RELEASE.md](docs/EXPO_RELEASE.md)

GitHub Actions Android build:

- Workflow: `.github/workflows/eas-build.yml`
- Trigger: **Actions -> EAS Build -> Run workflow**
- Inputs: `profile=preview`, `platform=android`
- Requirement: repository secret `EXPO_TOKEN`
- Download: after completion, open the run **Summary** and use the `ANDROID download` link.

## Project Structure

```txt
app/                 Expo Router routes/screens
src/components/      Reusable UI components
src/services/        Admin API request layer
src/store/           Global config/account state (Valtio)
src/lib/             Utilities, query client, fetch helpers
docs/                Operational docs and redacted screenshots
server/              Local Express proxy for admin APIs
```

## Security Notes

- Screenshots in `docs/screenshots` are redacted and should not contain live account identifiers, proxy endpoints, admin keys, or server secrets.
- Web builds are intentionally configured to avoid persistent storage of `adminApiKey`.
- Native platforms continue to use secure storage semantics.
- For responsible disclosure, see [SECURITY.md](SECURITY.md).

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).

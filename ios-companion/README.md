# Stephen’s To-Do — iOS Companion

This Expo-based native companion uses the existing dashboard as its live data source. It supports category and priority filters, task completion, priority changes, note editing, and new-task creation with touch-friendly controls.

## Validation

```bash
pnpm install
pnpm check
pnpm test
npx expo export --platform ios
```

## TestFlight

The completed TestFlight upload is **version 1.0.0, build 6** for bundle identifier `com.stephendeblanche.stephenstodo`.

## Security operations

On 17 August 2026, the project owner manually confirmed revocation of an Expo access token that had been exposed in chat. This action occurs in Expo account settings and cannot be technically verified from the project source; the replacement token was entered through secure project settings and validated before build use.

For future builds, authenticate through secure project settings, then run:

```bash
npx eas-cli@22.0.0 build --platform ios --profile production
npx eas-cli@22.0.0 submit --platform ios --profile production
```

The Apple signing assets and App Store Connect API key must remain in secure settings and never be committed to source control.

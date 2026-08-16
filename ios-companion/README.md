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

Once authenticated to an Expo account, run:

```bash
npx eas-cli@22.0.0 build:configure
npx testflight
```

The final Apple sign-in happens only in the authenticated build flow. The bundle identifier is `com.stephendeblanche.stephenstodo`.

# Implementation Plan: Secure and Optimize Android Project for Production

This plan addresses the security risks and configuration gaps identified in the project to ensure a smooth transition to production/release.

## User Review Required

> [!IMPORTANT]
> **Keystore Generation**: I cannot generate a production keystore (.jks) for you. After this plan is executed, you will need to run a `keytool` command (which I will provide) to create your unique release key.
>
> **Sensitive Properties**: We will move the Google Maps API key to `gradle.properties`. You should ensure that your CI/CD environment or any shared developer settings handle this property securely (e.g., via environment variables).

## Proposed Changes

### [Security] API Key Management
We will move the Google Maps API key out of the Manifest to prevent it from being committed to version control in a plain-text XML file.

#### [MODIFY] [gradle.properties](file:///Users/jonahmicahinguito/dev/rotaract-connect/android/gradle.properties)
- Add `MAPS_API_KEY=AIzaSyDVd2ymIl2wn_xXWcZ4FPbzq6YUkDqsERA` (Temporary move, user should rotate this key later).

#### [MODIFY] [build.gradle (app)](file:///Users/jonahmicahinguito/dev/rotaract-connect/android/app/build.gradle)
- Update `defaultConfig` to include `manifestPlaceholders = [mapsApiKey: findProperty('MAPS_API_KEY') ?: ""]`.

#### [MODIFY] [AndroidManifest.xml](file:///Users/jonahmicahinguito/dev/rotaract-connect/android/app/src/main/AndroidManifest.xml)
- Change the API key value to `${mapsApiKey}`.

---

### [Release Readiness] Signing Configuration
We will set up a professional signing configuration that allows for secure release builds.

#### [MODIFY] [build.gradle (app)](file:///Users/jonahmicahinguito/dev/rotaract-connect/android/app/build.gradle)
- Define a `release` signing configuration that reads credentials from project properties (which can be passed via environment variables in CI/CD).
- Update the `release` build type to use this new signing config instead of the `debug` one.

---

### [Optimization] Build Performance & Size
We will enable code and resource shrinking for release builds.

#### [MODIFY] [gradle.properties](file:///Users/jonahmicahinguito/dev/rotaract-connect/android/gradle.properties)
- Add `android.enableMinifyInReleaseBuilds=true`.
- Add `android.enableShrinkResourcesInReleaseBuilds=true`.

## Verification Plan

### Automated Tests
- Run `./gradlew :app:assembleRelease` (after keystore setup) to verify the build completes.
- Run `./gradlew :app:bundleRelease` to verify the Android App Bundle (AAB) is generated correctly.

### Manual Verification
- Inspect the generated `AndroidManifest.xml` in the APK/AAB to ensure the placeholder `${mapsApiKey}` is correctly replaced with the actual key.
- Verify that the release build starts and maps function correctly.

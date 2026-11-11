#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
export JAVA_HOME="${JAVA_HOME:-/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home}"
export ANDROID_HOME="${ANDROID_HOME:-/Users/akshwagle/Library/Android/sdk}"
export GRADLE_USER_HOME="${GRADLE_USER_HOME:-$repo_root/.local/gradle}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
if [[ ! -x "$JAVA_HOME/bin/java" ]] || ! "$JAVA_HOME/bin/java" -version 2>&1 | grep -q 'version "21\.'; then
  printf 'JAVA_HOME must point to JDK 21.\n' >&2; exit 1
fi
if [[ ! -f "$ANDROID_HOME/platforms/android-36/android.jar" ]]; then
  printf 'Install platforms;android-36 in Android Studio SDK Manager, then retry. No licences will be accepted by this script.\n' >&2; exit 1
fi
if [[ ! -d "$ANDROID_HOME/build-tools/35.0.0" ]]; then
  printf 'Install build-tools;35.0.0 in Android Studio SDK Manager, then retry.\n' >&2; exit 1
fi
existing_debug_key="${ANDROID_USER_HOME:-$HOME/.android}/debug.keystore"
if [[ ! -f "$existing_debug_key" ]]; then
  printf 'An existing Android debug keystore is required. This script will not create a signing keystore.\n' >&2; exit 1
fi
export ANDROID_USER_HOME="${ANDROID_USER_HOME:-$repo_root/.local/android-user}"
mkdir -p "$ANDROID_USER_HOME"
if [[ "$existing_debug_key" != "$ANDROID_USER_HOME/debug.keystore" && ! -e "$ANDROID_USER_HOME/debug.keystore" ]]; then
  ln -s "$existing_debug_key" "$ANDROID_USER_HOME/debug.keystore"
fi
cd "$repo_root/mobile"
npm run build
npx --no-install cap sync android
printf 'sdk.dir=%s\n' "$ANDROID_HOME" > android/local.properties
cd android
# Disable automatic SDK downloads; install missing packages through SDK Manager.
./gradlew --no-daemon --no-watch-fs -Pandroid.builder.sdkDownload=false assembleDebug
printf '\nDebug APK: %s/mobile/android/app/build/outputs/apk/debug/app-debug.apk\n' "$repo_root"

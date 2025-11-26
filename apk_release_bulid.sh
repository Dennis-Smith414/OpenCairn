#!/bin/bash
set -e  # Exit immediately if a command exits with non-zero status

# Define absolute paths
PROJECT_DIR="/root/repos/CS595-Capstone"
NODE_MOBILE_DIR="$PROJECT_DIR/NodeMobile"
APK_OUTPUT_DIR="/root/OpenCairn_APKs"
FTP_DIR="/srv/ftp/downloads"

echo "Building a new release APK file"

# Navigate to NodeMobile directory
cd "$NODE_MOBILE_DIR" || { echo "ERROR: Failed to navigate to $NODE_MOBILE_DIR"; exit 1; }

echo "Pulling Main"
git pull origin main

echo "Installing npm dependencies...."
npm install

echo "Bundling JavaScript"
mkdir -p "$NODE_MOBILE_DIR/android/app/src/main/assets"

npx react-native bundle \
  --platform android \
  --dev false \
  --entry-file index.js \
  --bundle-output "$NODE_MOBILE_DIR/android/app/src/main/assets/index.android.bundle" \
  --assets-dest "$NODE_MOBILE_DIR/android/app/src/main/res"

echo "Build the release APK"
cd "$NODE_MOBILE_DIR/android" || { echo "ERROR: Failed to navigate to android directory"; exit 1; }

./gradlew incrementPatch
./gradlew clean
./gradlew assembleRelease

# Move and copy APK files
echo "Deploying APK files..."
mkdir -p "$APK_OUTPUT_DIR"
mkdir -p "$FTP_DIR"

mv "$NODE_MOBILE_DIR/android/app/build/outputs/apk/release/OpenCairnV0.0".*.apk "$APK_OUTPUT_DIR/"
cp "$APK_OUTPUT_DIR/OpenCairnV0.0".*.apk "$FTP_DIR/"
chmod 644 "$FTP_DIR"/*

# SCP to remote server
scp "$APK_OUTPUT_DIR/OpenCairnV0.0".*.apk opencairn@192.168.1.152:~/cairn_apks

echo "DONE"

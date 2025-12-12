#!/bin/bash
set -e  # Exit immediately if a command exits with non-zero status

# Define absolute paths
PROJECT_DIR="/root/repos/CS595-Capstone"
NODE_MOBILE_DIR="$PROJECT_DIR/NodeMobile"
APK_OUTPUT_DIR="/root/OpenCairn_APKs"
FTP_DIR="/srv/ftp/downloads"

CURRENT_VERSION="0.0.5"

echo "Building a new release APK file"

# Navigate to NodeMobile directory
cd "$NODE_MOBILE_DIR" || { echo "ERROR: Failed to navigate to $NODE_MOBILE_DIR"; exit 1; }

echo "Pulling Main"
git pull origin main

echo "Installing npm dependencies...."
npm install

echo "Setting current version to $CURRENT_VERSION" 

PATCH_NUM=$(echo $CURRENT_VERSION | cut -d'.' -f3)

echo "Setting patch version to $PATCH_NUM from $CURRENT_VERSION"

sed -i "s/VERSION_PATCH=.*/VERSION_PATCH=$PATCH_NUM/" "$NODE_MOBILE_DIR/android/version.properties"

CURRENT_MAJOR=$(grep 'VERSION_MAJOR=' "$NODE_MOBILE_DIR/android/version.properties" | cut -d'=' -f2)
CURRENT_MINOR=$(grep 'VERSION_MINOR=' "$NODE_MOBILE_DIR/android/version.properties" | cut -d'=' -f2)

NEW_VERSION_CODE=$((CURRENT_MAJOR * 10000 + CURRENT_MINOR * 100 + PATCH_NUM))


echo "Version: $CURRENT_MAJOR.$CURRENT_MINOR.$PATCH_NUM"
echo "Version code: $NEW_VERSION_CODE"

NEW_VERSION="$MAJOR_NUM.$MINOR_NUM.$NEW_PATCH_NUM"
echo "New version will be: $NEW_VERSION"
CURRENT_VERSION="$NEW_VERSION"
echo "CURRENT_VERSION is now: $CURRENT_VERSION"

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

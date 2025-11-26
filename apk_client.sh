#!/bin/bash
APK_ARCHIVE_DIR="~/OpenCairn_APKs/"

LATEST_APK=$(ls -t "$APK_ARCHIVE_DIR"/*.apk 2>/dev/null | head -1)

echo "Getting APK file from Server"
ssh -p 22222 root@184.58.146.190 /root/repos/CS595-Capstone/apk_release_bulid.sh

scp -P 22222 root@184.58.146.190:/root/OpenCairn_APKs/OpenCairnV0.0.*.apk ~/OpenCairn_APKs/

if [ -z "$LATEST_APK" ]; then
    echo "No APK files found in $APK_ARCHIVE_DIR"
    exit 1
fi 

if ! adb devices | grep -q "device$"; then
    echo "Error: No Android device connected"
    exit 1
fi

adb install -r "$LATEST_APK"

#!/bin/bash
echo "Getting APK file from Server"
ssh -p 22222 root@184.58.146.190 /root/repos/CS595-Capstone/apk_release_bulid.sh

scp -P 22222 root@184.58.146.190:/root/OpenCairn_APKs/OpenCairnV0.0.*.apk ~/OpenCairn_APKs/


#!/bin/bash
echo "Building ADHD Sage APK with Capacitor..."

npm install
npm run build
npx cap sync android

echo "Applying permissions..."
mkdir -p android/app/src/main/res/xml
cp android-hints/network_security_config.xml android/app/src/main/res/xml/ || echo "No network config"
sed -i 's/<application/<application android:networkSecurityConfig="@xml\/network_security_config" android:usesCleartextTraffic="true"/g' android/app/src/main/AndroidManifest.xml
sed -i '/<application/i \
<uses-permission android:name="android.permission.INTERNET" />\n\
<uses-permission android:name="android.permission.VIBRATE" />\n\
<uses-permission android:name="android.permission.HIGH_SAMPLING_RATE_SENSORS" />\n' android/app/src/main/AndroidManifest.xml

cd android
chmod +x ./gradlew
./gradlew assembleDebug

echo "Build complete. APK is at: android/app/build/outputs/apk/debug/app-debug.apk"

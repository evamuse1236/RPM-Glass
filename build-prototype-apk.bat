@echo off
REM Builds the native offline app. The original HTML preview remains in the repository.
call gradlew.bat assembleDebug
if errorlevel 1 exit /b %errorlevel%
echo APK: app\build\outputs\apk\debug\app-debug.apk

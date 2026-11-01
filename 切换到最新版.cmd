@echo off
rem Switch Re:Material to the latest version (feature/after-testing-iterations, including new commits) and open it on a phone via cpolar.
rem Works from any branch: runs a temporary copy of the script stored on branch user-test-1008.
setlocal
set "PROJ=%~dp0"
if not exist "%PROJ%package.json" set "PROJ=%USERPROFILE%\Desktop\rematerial\"
set "TMPPS=%TEMP%\rematerial-switch-to-latest.ps1"
git -C "%PROJ%." show user-test-1008:scripts/switch-to-latest.ps1 > "%TMPPS%" 2>nul
if errorlevel 1 git -C "%PROJ%." show origin/user-test-1008:scripts/switch-to-latest.ps1 > "%TMPPS%"
if errorlevel 1 (
  echo Cannot find branch user-test-1008 in %PROJ%
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%TMPPS%" -ProjectDir "%PROJ%."
pause
endlocal

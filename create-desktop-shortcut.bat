@echo off
set "TARGET=%~dp0start-ssk.bat"
set "SHORTCUT=%USERPROFILE%\Desktop\SSK ERP.lnk"

powershell -NoProfile -Command ^
  "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT%'); $s.TargetPath = '%TARGET%'; $s.WorkingDirectory = '%~dp0'; $s.WindowStyle = 1; $s.Description = 'Start SSK ERP locally'; $s.Save()"

echo Desktop shortcut created: %SHORTCUT%
pause

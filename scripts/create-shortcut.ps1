$WshShell = New-Object -ComObject WScript.Shell
$desktop = [System.Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop "POS - Tu Dong In Bill.lnk"

$Shortcut = $WshShell.CreateShortcut($shortcutPath)
$Shortcut.TargetPath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$Shortcut.Arguments = '--user-data-dir="' + $env:LOCALAPPDATA + '\Google\Chrome\POS_Profile" --kiosk-printing --app="https://pos-cuahang.onrender.com/"'
$Shortcut.Description = "Bun Mam Mien Tay POS - Tu Dong In Khong Can Bam"
$Shortcut.IconLocation = "C:\Program Files\Google\Chrome\Application\chrome.exe,0"
$Shortcut.Save()

Write-Output "Da tao shortcut thanh cong tai: $shortcutPath"

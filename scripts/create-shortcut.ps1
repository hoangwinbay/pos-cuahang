$WshShell = New-Object -ComObject WScript.Shell
$desktop = [System.Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop "POS - Tu Dong In Bill.lnk"

$chromeIcon = "C:\Program Files\Google\Chrome\Application\chrome.exe,0"
if (-not (Test-Path "C:\Program Files\Google\Chrome\Application\chrome.exe")) {
    if (Test-Path "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe") {
        $chromeIcon = "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe,0"
    } elseif (Test-Path "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") {
        $chromeIcon = "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe,0"
    }
}

$Shortcut = $WshShell.CreateShortcut($shortcutPath)
$Shortcut.TargetPath = "D:\POS\Chay-POS-Tu-Dong-In.bat"
$Shortcut.Arguments = ""
$Shortcut.WorkingDirectory = "D:\POS"
$Shortcut.Description = "Bun Mam Mien Tay POS - Tu Dong In Khong Can Bam"
$Shortcut.IconLocation = $chromeIcon
$Shortcut.Save()

Write-Output "Da tao shortcut thanh cong tai: $shortcutPath"

# Floating operator bar: opens /operator/ in its own borderless, always-on-top, slightly transparent Edge window.
# The window is NOT part of the stream when OBS captures the game window (window/game capture, not display capture).
# Usage: operator.bat [-Port 3210] [-X <left px>] [-Y <top px>]   (default: centred directly above the scoreboard, like Riot's replay bar)
# Touches only its own Edge window, never the game process.
param([int]$Port = 0, [int]$X = -1, [int]$Y = -1, [int]$Alpha = 230)

$root = Split-Path -Parent $PSScriptRoot
if ($Port -le 0) {
  $Port = 3210
  $f = Join-Path $root 'data\settings.json'
  if (Test-Path $f) { try { $p = (Get-Content $f -Raw | ConvertFrom-Json).port; if ($p) { $Port = [int]$p } } catch { } }
}

$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { Write-Error 'Microsoft Edge not found'; exit 1 }

Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class Win {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc p, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr h, int i, int v);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int cx, uint f);
  [DllImport("user32.dll")] public static extern bool SetLayeredWindowAttributes(IntPtr h, uint key, byte a, uint f);
  public static IntPtr Find(string title) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      var sb = new StringBuilder(256); GetWindowText(h, sb, 256);
      if (sb.ToString().StartsWith(title)) { found = h; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
'@
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# physical pixels: the scoreboard frame sits at y=813 of a 1080-high overlay, x 497-1423 (926 of 1920 wide)
[void][Win]::SetProcessDPIAware()
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$scale = [System.Drawing.Graphics]::FromHwnd([IntPtr]::Zero).DpiX / 96
$H = [int](128 * $scale)
$W = [Math]::Max([int]($screen.Width * 926 / 1920), [int](900 * $scale))   # the button row needs about 900 CSS px
if ($X -lt 0) { $X = $screen.Left + [int](($screen.Width - $W) / 2) }
if ($Y -lt 0) { $Y = $screen.Top + [int][Math]::Round($screen.Height * 813 / 1080) - $H - 6 }

$profileDir = Join-Path $root 'data\operator-profile'
New-Item -ItemType Directory -Force $profileDir | Out-Null
Start-Process $edge -ArgumentList "--app=http://127.0.0.1:$Port/operator/", "--window-size=$W,$H", "--window-position=$X,$Y", "--user-data-dir=`"$profileDir`"", '--no-first-run', '--disable-features=Translate'

$hwnd = [IntPtr]::Zero
for ($i = 0; $i -lt 100 -and $hwnd -eq [IntPtr]::Zero; $i++) { Start-Sleep -Milliseconds 200; $hwnd = [Win]::Find('SG Operator') }
if ($hwnd -eq [IntPtr]::Zero) { Write-Error 'Operator window did not appear'; exit 1 }
Start-Sleep -Milliseconds 400

$GWL_STYLE = -16; $GWL_EXSTYLE = -20
$WS_CAPTION = 0x00C00000; $WS_THICKFRAME = 0x00040000; $WS_SYSMENU = 0x00080000
$style = [Win]::GetWindowLong($hwnd, $GWL_STYLE)
[void][Win]::SetWindowLong($hwnd, $GWL_STYLE, ($style -band (-bnot ($WS_CAPTION -bor $WS_THICKFRAME -bor $WS_SYSMENU))))
$ex = [Win]::GetWindowLong($hwnd, $GWL_EXSTYLE)
[void][Win]::SetWindowLong($hwnd, $GWL_EXSTYLE, ($ex -bor 0x80000 -bor 0x80))  # WS_EX_LAYERED | WS_EX_TOOLWINDOW (no taskbar button)
[void][Win]::SetLayeredWindowAttributes($hwnd, 0, [byte]$Alpha, 2)           # LWA_ALPHA
# HWND_TOPMOST = -1; flags: NOACTIVATE 0x10 | FRAMECHANGED 0x20 | SHOWWINDOW 0x40
[void][Win]::SetWindowPos($hwnd, [IntPtr](-1), $X, $Y, $W, $H, 0x70)
Write-Host "Operator bar open at $X,$Y (port $Port)"

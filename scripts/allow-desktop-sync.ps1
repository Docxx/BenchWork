param(
  [Parameter(Mandatory = $true)][string]$TabletAddress,
  [Parameter(Mandatory = $true)][string]$Executable
)
$ErrorActionPreference = 'Stop'
$address = [Net.IPAddress]::Parse($TabletAddress)
if ($address.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork) { throw 'Use the tablet local IPv4 address.' }
$bytes = $address.GetAddressBytes()
if (!(($bytes[0] -eq 10) -or ($bytes[0] -eq 192 -and $bytes[1] -eq 168) -or ($bytes[0] -eq 172 -and $bytes[1] -ge 16 -and $bytes[1] -le 31))) { throw 'Use a private tablet address.' }
$program = [IO.Path]::GetFullPath($Executable)
if (!(Test-Path -LiteralPath $program -PathType Leaf) -or [IO.Path]::GetFileName($program) -ne 'benchwork.exe') { throw 'Choose the built BenchWork executable.' }
$name = 'BenchWork-DesktopSync-Tablet'
if (Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue) {
  Set-NetFirewallRule -Name $name -Enabled True -Direction Inbound -Action Allow -Program $program -Protocol TCP -LocalPort 47831 -RemoteAddress $TabletAddress -Profile Any | Out-Null
} else {
  New-NetFirewallRule -Name $name -DisplayName 'BenchWork Desktop Sync - paired tablet' -Direction Inbound -Action Allow -Program $program -Protocol TCP -LocalPort 47831 -RemoteAddress $TabletAddress -Profile Any | Out-Null
}

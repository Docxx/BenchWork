# Copies the relay's newest nightly backup from the server to this computer,
# so a backup outlives the server. Keeps the newest $Keep copies here.
# The archives hold the relay's TLS key: keep the folder private, and outside
# any vault or synced folder.
param(
  [string]$Server = '178.62.50.124',
  [string]$SshKey = (Join-Path $env:USERPROFILE '.ssh\benchwork_relay'),
  [string]$To = (Join-Path $env:USERPROFILE 'BenchWork relay backups'),
  [int]$Keep = 30
)
$ErrorActionPreference = 'Stop'
if ($Server -notmatch '^\d+\.\d+\.\d+\.\d+$') { throw 'Use the relay server IPv4 address.' }
$options = @('-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-i', (Resolve-Path -LiteralPath $SshKey).Path)
New-Item -ItemType Directory -Force -Path $To | Out-Null

$newest = & ssh @options "root@$Server" 'ls -1t /var/backups/benchwork-relay/benchwork-relay-*.tar.gz | head -n 1'
if ($LASTEXITCODE -ne 0 -or -not $newest) { throw 'No backup found on the server.' }
$newest = $newest.Trim()
$name = Split-Path -Leaf $newest
$target = Join-Path $To $name
if (Test-Path -LiteralPath $target) {
  Write-Output "Already here: $name"
} else {
  $remoteHash = (& ssh @options "root@$Server" "sha256sum '$newest'").Split(' ')[0]
  if ($LASTEXITCODE -ne 0) { throw 'Could not read the backup on the server.' }
  $partial = "$target.partial"
  & scp @options "root@${Server}:$newest" $partial
  if ($LASTEXITCODE -ne 0) { throw 'Copying the backup failed.' }
  $hash = (Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($hash -ne $remoteHash) {
    Remove-Item -LiteralPath $partial -Force
    throw 'The copy does not match the server''s backup; nothing was kept.'
  }
  Move-Item -LiteralPath $partial -Destination $target
  Write-Output "Copied $name ($([math]::Round((Get-Item $target).Length / 1MB, 1)) MB)"
}

Get-ChildItem -LiteralPath $To -Filter 'benchwork-relay-*.tar.gz' |
  Sort-Object Name -Descending |
  Select-Object -Skip $Keep |
  Remove-Item -Force

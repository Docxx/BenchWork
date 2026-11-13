param(
  [Parameter(Mandatory=$true)][string]$Version,
  [Parameter(Mandatory=$true)][string]$WindowsInstaller,
  [Parameter(Mandatory=$true)][string]$AndroidApk,
  [Parameter(Mandatory=$true)][string]$SshKey,
  [string]$Server = '178.62.50.124',
  [string]$Notes = 'BenchWork update'
)
$ErrorActionPreference = 'Stop'
if ($Version -notmatch '^\d+\.\d+\.\d+$' -or $Server -notmatch '^\d+\.\d+\.\d+\.\d+$') { throw 'Use a release version and an IPv4 server address.' }
$publishAssets = @(
  @{ source = (Resolve-Path -LiteralPath $WindowsInstaller).Path; name = "BenchWork_${Version}_x64-setup.exe" },
  @{ source = (Resolve-Path -LiteralPath $AndroidApk).Path; name = "BenchWork_${Version}_arm64.apk" }
)
$publishOptions = @('-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-i',(Resolve-Path -LiteralPath $SshKey).Path)
& ssh @publishOptions "root@$Server" 'install -d -m 755 /var/lib/benchwork-relay/updates'
if ($LASTEXITCODE -ne 0) { throw 'Cannot open update directory on the server.' }
$manifestAssets = @()
foreach ($asset in $publishAssets) {
  $hash = (Get-FileHash -LiteralPath $asset.source -Algorithm SHA256).Hash.ToLowerInvariant()
  $size = (Get-Item -LiteralPath $asset.source).Length
  if ($size -gt 800MB) { throw 'Installer exceeds the update size limit.' }
  & scp @publishOptions $asset.source "root@${Server}:/var/lib/benchwork-relay/updates/$($asset.name).partial"
  if ($LASTEXITCODE -ne 0) { throw 'Installer upload failed; the live catalogue was kept.' }
  $remoteFile = "/var/lib/benchwork-relay/updates/$($asset.name)"
  & ssh @publishOptions "root@$Server" "echo '$hash  $remoteFile.partial' | sha256sum -c - && if [ -e $remoteFile ]; then echo '$hash  $remoteFile' | sha256sum -c - && rm -f $remoteFile.partial; else chmod 644 $remoteFile.partial && mv $remoteFile.partial $remoteFile; fi"
  if ($LASTEXITCODE -ne 0) { throw 'Remote checksum verification failed; the live catalogue was kept.' }
  $manifestAssets += @{ name=$asset.name; size=$size; digest="sha256:$hash"; browser_download_url="https://$Server/updates/$($asset.name)" }
}
$manifest = @{ tag_name="v$Version"; body=$Notes; draft=$false; prerelease=$false; assets=$manifestAssets }
$temporary = Join-Path ([System.IO.Path]::GetTempPath()) "benchwork-update-$([guid]::NewGuid().ToString('N')).json"
try {
  [System.IO.File]::WriteAllText($temporary, ($manifest | ConvertTo-Json -Depth 5), [System.Text.UTF8Encoding]::new($false))
  & scp @publishOptions $temporary "root@${Server}:/var/lib/benchwork-relay/updates/latest.json.partial"
  if ($LASTEXITCODE -ne 0) { throw 'Catalogue upload failed.' }
  & ssh @publishOptions "root@$Server" 'chmod 644 /var/lib/benchwork-relay/updates/latest.json.partial && mv /var/lib/benchwork-relay/updates/latest.json.partial /var/lib/benchwork-relay/updates/latest.json'
  if ($LASTEXITCODE -ne 0) { throw 'Could not activate the new update catalogue.' }
} finally { Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue }
Write-Output "Published BenchWork $Version for Windows and Android."

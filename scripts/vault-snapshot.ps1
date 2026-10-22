<#
.SYNOPSIS
  Records, or compares, the state of a vault folder on disk.

.DESCRIPTION
  Used for the Phase 0 exit check: switching a module on and off must not
  change any file outside .benchwork. Records each item's path, size and
  last-write time. File contents are never read, so OneDrive files that are
  only in the cloud are not downloaded.

.EXAMPLE
  .\scripts\vault-snapshot.ps1 -Vault "C:\Vault" -Out before.json
  .\scripts\vault-snapshot.ps1 -Vault "C:\Vault" -Compare before.json
#>
[CmdletBinding(DefaultParameterSetName = 'Record')]
param(
    [Parameter(Mandatory = $true)] [string] $Vault,
    [Parameter(Mandatory = $true, ParameterSetName = 'Record')] [string] $Out,
    [Parameter(Mandatory = $true, ParameterSetName = 'Compare')] [string] $Compare
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $Vault).ProviderPath.TrimEnd('\')

function Get-VaultState {
    $items = @{}
    Get-ChildItem -LiteralPath $root -Force -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
        $rel = $_.FullName.Substring($root.Length + 1)
        $items[$rel] = [pscustomobject]@{
            dir      = $_.PSIsContainer
            size     = if ($_.PSIsContainer) { 0 } else { $_.Length }
            modified = $_.LastWriteTimeUtc.Ticks
        }
    }
    return $items
}

function Test-InBenchwork([string] $rel) {
    return $rel -eq '.benchwork' -or $rel.StartsWith('.benchwork\')
}

$now = Get-VaultState

if ($PSCmdlet.ParameterSetName -eq 'Record') {
    [pscustomobject]@{ vault = $root; taken = (Get-Date).ToString('o'); items = $now } |
        ConvertTo-Json -Depth 4 -Compress | Out-File -LiteralPath $Out -Encoding utf8
    $outside = @($now.Keys | Where-Object { -not (Test-InBenchwork $_) }).Count
    Write-Output "Recorded $($now.Count) items ($outside outside .benchwork) to $Out"
    return
}

$saved = Get-Content -LiteralPath $Compare -Raw | ConvertFrom-Json
$before = @{}
$saved.items.PSObject.Properties | ForEach-Object { $before[$_.Name] = $_.Value }

$added = @(); $removed = @(); $changed = @()
foreach ($rel in $now.Keys) {
    if (-not $before.ContainsKey($rel)) { $added += $rel; continue }
    $a = $before[$rel]; $b = $now[$rel]
    # Folder times change whenever something inside them changes, so only files are compared.
    if (-not $b.dir -and ($a.size -ne $b.size -or $a.modified -ne $b.modified)) { $changed += $rel }
}
foreach ($rel in $before.Keys) { if (-not $now.ContainsKey($rel)) { $removed += $rel } }

$problems = @(
    $added | Where-Object { -not (Test-InBenchwork $_) } | ForEach-Object { "ADDED    $_" }
    $removed | Where-Object { -not (Test-InBenchwork $_) } | ForEach-Object { "REMOVED  $_" }
    $changed | Where-Object { -not (Test-InBenchwork $_) } | ForEach-Object { "CHANGED  $_" }
)
$inside = @(
    $added | Where-Object { Test-InBenchwork $_ } | ForEach-Object { "added    $_" }
    $changed | Where-Object { Test-InBenchwork $_ } | ForEach-Object { "changed  $_" }
    $removed | Where-Object { Test-InBenchwork $_ } | ForEach-Object { "removed  $_" }
)

$outsideCount = @($now.Keys | Where-Object { -not (Test-InBenchwork $_) }).Count
Write-Output "Vault: $root"
Write-Output "Snapshot taken: $($saved.taken)"
Write-Output ''
Write-Output "Inside .benchwork ($($inside.Count) change(s)):"
if ($inside.Count -eq 0) { Write-Output '  none' } else { $inside | Sort-Object | ForEach-Object { "  $_" } }
Write-Output ''
if ($problems.Count -eq 0) {
    Write-Output "PASS: all $outsideCount items outside .benchwork are unchanged."
} else {
    Write-Output "FAIL: $($problems.Count) item(s) outside .benchwork changed:"
    $problems | Sort-Object | ForEach-Object { "  $_" }
    exit 1
}

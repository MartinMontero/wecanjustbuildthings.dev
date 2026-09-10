#Requires -Version 5.1
<#
  gate.ps1 — the definition-of-done gate for wecanjustbuildthings.dev.

  Runs every proof line from RECIPE.md, prints PASS/FAIL per subsystem, ends with
  "X/Y subsystems PASS", and exits 0 only if all pass. Where a proof maps to an
  existing script (npm run enforce, npm run verify:all, the node test suites,
  catalog-count.mjs --check) this gate CALLS it — it does not re-implement it.
  The one exception, documented in RECIPE.md: the OSV CRITICAL gate
  (scripts/osv-critical-gate.sh) needs bash+jq; here the same two signals
  (CRITICAL by CVSS>=9.0 OR database_specific label, AND fix-available) are
  evaluated from the same osv-scanner JSON with native PowerShell.

  Windows PowerShell only: no bash, no POSIX, no && chaining.

  Usage:
    powershell -File gate.ps1            # full gate (~10 min; includes the build)
    powershell -File gate.ps1 -SelfTest  # prove the gate can FAIL, then restore
#>
param([switch]$SelfTest)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$script:passCount = 0
$script:failCount = 0

function Invoke-Proof {
  param([string]$Subsystem, [scriptblock]$Check)
  try {
    $evidence = & $Check
    if ([string]::IsNullOrWhiteSpace("$evidence")) { throw 'proof returned no evidence' }
    Write-Host "PASS  $Subsystem -- $evidence"
    $script:passCount++
  } catch {
    Write-Host "FAIL  $Subsystem -- $($_.Exception.Message)"
    $script:failCount++
  }
}

function Require-Path([string]$p) {
  if (-not (Test-Path $p)) { throw "missing $p" }
}

function Invoke-Cli([string]$cmd, [string[]]$cmdArgs) {
  $out = & $cmd @cmdArgs 2>&1 | Out-String
  return @{ Out = $out; Code = $LASTEXITCODE }
}

function Read-JsonFile([string]$p) {
  # Explicit UTF-8: PS 5.1 would otherwise misread BOM-less UTF-8 as ANSI.
  return ([IO.File]::ReadAllText($p, [Text.Encoding]::UTF8) | ConvertFrom-Json)
}

# ---------------------------------------------------------------- proofs -----

function Proof-CatalogData {
  Require-Path 'node_modules'
  $r = Invoke-Cli 'node' @('scripts/catalog-count.mjs', '--check')
  if ($r.Code -ne 0) { throw "catalog-count.mjs --check exited $($r.Code): $($r.Out.Trim())" }
  if ($r.Out -notmatch 'catalog count current: total=(\d+)') { throw 'no count line in output' }
  return "catalog count current: total=$($Matches[1]) (scripts/catalog-count.mjs --check)"
}

function Proof-Enforcement {
  $r = Invoke-Cli 'npm' @('run', '--silent', 'enforce')
  if ($r.Code -ne 0) { throw "npm run enforce exited $($r.Code)" }
  if ($r.Out -notmatch 'Enforcement passed') { throw "output missing 'Enforcement passed'" }
  return "npm run enforce exits 0; stdout contains 'Enforcement passed'"
}

function Proof-I18n {
  Require-Path '.github/workflows/i18n-security-gate.yml'
  $r = Invoke-Cli 'node' @('--import', 'tsx', '--test', 'scripts/i18n-security-gate.test.ts')
  if ($r.Code -ne 0) { throw "i18n-security-gate tests exited $($r.Code)" }
  if ($r.Out -notmatch 'fail 0') { throw "test summary missing 'fail 0'" }
  if ($r.Out -match 'pass (\d+)') { $n = $Matches[1] } else { $n = '?' }
  return "i18n-security-gate.test.ts: pass $n / fail 0; workflow file exists"
}

function Proof-Worker {
  $r = Invoke-Cli 'npm' @('run', '--silent', 'typecheck:worker')
  if ($r.Code -ne 0) { throw "typecheck:worker exited $($r.Code)" }
  $t = Invoke-Cli 'node' @('--import', 'tsx', '--test',
    'worker/tests/auth.test.ts', 'worker/tests/auth-nostr.test.ts', 'worker/tests/auth-bluesky.test.ts',
    'worker/tests/pricing.test.ts', 'worker/tests/routing.test.ts', 'worker/tests/worker.test.ts')
  if ($t.Code -ne 0 -or $t.Out -notmatch 'fail 0') { throw "worker tests: exit $($t.Code)" }
  return "typecheck:worker exits 0; 6 worker test files report fail 0"
}

function Proof-AdminConsole {
  Require-Path 'migrations-admin/0001_admin_storage.sql'
  $t = Invoke-Cli 'node' @('--import', 'tsx', '--test',
    'worker/tests/admin-auth.test.ts', 'worker/tests/admin-roster.test.ts',
    'worker/tests/admin-router.test.ts', 'worker/tests/admin-staging.test.ts')
  if ($t.Code -ne 0 -or $t.Out -notmatch 'fail 0') { throw "admin tests: exit $($t.Code)" }
  return "4 admin test files report fail 0; migrations-admin/0001_admin_storage.sql exists"
}

function Proof-Skills {
  $r = Invoke-Cli 'npm' @('run', '--silent', 'enforce:skills')
  if ($r.Code -ne 0 -or $r.Out -notmatch 'Enforcement passed') { throw "enforce:skills exited $($r.Code)" }
  $dirs = Get-ChildItem 'skills' -Directory
  $missing = @($dirs | Where-Object { -not (Test-Path (Join-Path $_.FullName 'SKILL.md')) })
  if ($missing.Count -gt 0) { throw "skill dirs missing SKILL.md: $($missing.Name -join ', ')" }
  return "enforce:skills passed; $($dirs.Count) skill dirs each carry SKILL.md"
}

function Proof-SpecKit {
  foreach ($a in @('nostr-mls-group-messaging', 'nostr-web-client')) {
    foreach ($f in @('.specify/memory/constitution.md', '.specify/templates/plan.md',
                     '.specify/templates/spec.md', '.specify/templates/tasks.md')) {
      Require-Path "templates/spec-kit/$a/$f"
    }
  }
  return "2 archetypes carry constitution.md + plan/spec/tasks templates (8 files)"
}

function Proof-SupplyChain {
  Require-Path 'osv-scanner.toml'
  Require-Path 'package-lock.json'
  if (-not (Get-Command 'osv-scanner' -ErrorAction SilentlyContinue)) { throw 'osv-scanner not on PATH' }
  $jsonPath = Join-Path $env:TEMP 'gate-osv.json'
  & osv-scanner scan --lockfile=package-lock.json --format=json --output="$jsonPath" 2>$null | Out-Null
  Require-Path $jsonPath
  $report = Read-JsonFile $jsonPath
  $critFix = 0
  foreach ($res in $report.results) {
    foreach ($pkg in $res.packages) {
      $sev = @{}
      foreach ($g in @($pkg.groups)) { foreach ($id in @($g.ids)) { $sev[$id] = "$($g.max_severity)" } }
      foreach ($v in @($pkg.vulnerabilities)) {
        $label = ''
        if ($v.database_specific -and $v.database_specific.severity) { $label = "$($v.database_specific.severity)".ToUpper() }
        $score = [double]0
        if ($sev.ContainsKey($v.id)) { [void][double]::TryParse($sev[$v.id], [ref]$score) }
        if ($label -eq 'CRITICAL' -or $score -ge 9.0) {
          $fixable = $false
          foreach ($a in @($v.affected)) {
            foreach ($rg in @($a.ranges)) { foreach ($e in @($rg.events)) { if ($e.fixed) { $fixable = $true } } }
          }
          if ($fixable) { $critFix++ }
        }
      }
    }
  }
  if ($critFix -gt 0) { throw "$critFix CRITICAL+fixable advisories (osv-critical-gate semantics)" }
  return "osv-scanner lockfile scan: 0 critical+fixable advisories; osv-scanner.toml exists"
}

function Proof-Pipelines {
  Require-Path '.github/workflows/verify.yml'
  Require-Path '.github/workflows/quality.yml'
  $r = Invoke-Cli 'npm' @('run', 'verify:all')
  if ($r.Code -ne 0) { throw "verify:all exited $($r.Code)" }
  if ($r.Out -notmatch 'fail 0') { throw "verify:all test summary missing 'fail 0'" }
  return "npm run verify:all exits 0 (fail 0) — its build also refreshes dist/ for the island proofs"
}

function Proof-Explorer {
  Require-Path 'dist/catalog/index.html'
  $dist = Read-JsonFile 'dist/catalog.json'
  $expected = (Read-JsonFile 'data/catalog-count.json').total
  if ($dist.Count -ne $expected) { throw "dist/catalog.json has $($dist.Count) entries; data/catalog-count.json says $expected" }
  return "dist/catalog.json = $($dist.Count) entries, matching data/catalog-count.json"
}

function Proof-Studio {
  Require-Path 'dist/policy.json'
  $p = Read-JsonFile 'dist/policy.json'
  if (@($p.orgs).Count -lt 1 -or @($p.signals).Count -lt 1) { throw 'dist/policy.json has empty orgs/signals' }
  foreach ($f in @('dist/build/index.html', 'dist/es/build/index.html', 'dist/ar/build/index.html')) { Require-Path $f }
  return "dist/policy.json carries $(@($p.orgs).Count) orgs / $(@($p.signals).Count) signals; build pages exist x3 locales"
}

function Proof-Checker {
  Require-Path 'dist/check/index.html'
  # Island strings ship in the hydrated JS chunk (hashed name), not the SSR
  # HTML — scan every dist/_astro chunk for the localized CTA.
  $needle = 'omprobar contra la pol' + [char]0x00ED + 'tica'
  $found = $false
  foreach ($chunk in Get-ChildItem 'dist/_astro' -Filter '*.js') {
    if ([IO.File]::ReadAllText($chunk.FullName, [Text.Encoding]::UTF8).Contains($needle)) { $found = $true; break }
  }
  if (-not $found) { throw 'no dist/_astro chunk carries the es CTA string (Comprobar contra la politica)' }
  return "dist/check/ exists; a dist/_astro chunk carries the es CTA string (localized island ships)"
}

# ------------------------------------------------------------ self test -----

if ($SelfTest) {
  Write-Host '--- gate.ps1 -SelfTest: plant a failing proof, watch FAIL fire, restore, clean run ---'
  $countFile = 'data/catalog-count.json'
  $original = [IO.File]::ReadAllText($countFile, [Text.Encoding]::UTF8)
  $planted = ([IO.File]::ReadAllText($countFile, [Text.Encoding]::UTF8) | ConvertFrom-Json).total + 1
  $bomless = New-Object Text.UTF8Encoding $false
  try {
    $corrupt = $original -replace '"total": \d+', ('"total": ' + $planted)
    [IO.File]::WriteAllText($countFile, $corrupt, $bomless)
    Write-Host "planted: data/catalog-count.json total -> $planted"
    Invoke-Proof 'catalog data layer (planted failure)' ${function:Proof-CatalogData}
    if ($script:failCount -ne 1) {
      Write-Host 'SELF-TEST BROKEN: the planted failure did NOT fire — the gate cannot be trusted'
      exit 3
    }
    Write-Host 'evidence: FAIL fired through the real proof path (Invoke-Proof -> catalog-count.mjs --check)'
  } finally {
    [IO.File]::WriteAllText($countFile, $original, $bomless)
  }
  $r = Invoke-Cli 'node' @('scripts/catalog-count.mjs', '--check')
  if ($r.Code -ne 0) { Write-Host 'SELF-TEST BROKEN: restore failed'; exit 3 }
  Write-Host "restored; clean run: $($r.Out.Trim())"
  Write-Host 'SELF-TEST PASS (gate proven able to fail, then proven green after restore)'
  exit 0
}

# ------------------------------------------------------------ full gate -----

if (-not (Test-Path 'node_modules')) {
  Write-Host 'FAIL  precondition -- node_modules missing; run npm ci first'
  Write-Host '0/12 subsystems PASS'
  exit 1
}

Invoke-Proof 'catalog data layer' ${function:Proof-CatalogData}
Invoke-Proof 'enforcement engine' ${function:Proof-Enforcement}
Invoke-Proof 'i18n governance' ${function:Proof-I18n}
Invoke-Proof 'edge API worker' ${function:Proof-Worker}
Invoke-Proof 'admin console' ${function:Proof-AdminConsole}
Invoke-Proof 'agent skills' ${function:Proof-Skills}
Invoke-Proof 'Spec Kit templates' ${function:Proof-SpecKit}
Invoke-Proof 'supply-chain' ${function:Proof-SupplyChain}
Invoke-Proof 'CI verify + quality pipelines' ${function:Proof-Pipelines}
Invoke-Proof 'catalog explorer island' ${function:Proof-Explorer}
Invoke-Proof 'Build Studio island' ${function:Proof-Studio}
Invoke-Proof 'PolicyChecker island' ${function:Proof-Checker}

$total = $script:passCount + $script:failCount
Write-Host "$($script:passCount)/$total subsystems PASS"
if ($script:failCount -eq 0) { exit 0 } else { exit 1 }

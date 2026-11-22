<#
  Lanza la sesion nocturna del userscript en el navegador de verdad.

  Chrome congela los temporizadores de una pestana en segundo plano, la descarta
  cuando anda bajo de memoria y pausa requestAnimationFrame cuando la ventana
  queda tapada. Los tres matan una noche de carreras: el tipador se queda
  esperando un frame que no llega y el juego lo da por inactivo a los 12 s. Las
  banderas de abajo desarman los tres frenos.

  Uso:
    pwsh -File tools/afk-night.ps1              # detecta el navegador y lanza
    pwsh -File tools/afk-night.ps1 -DryRun      # solo muestra la linea de comando
    pwsh -File tools/afk-night.ps1 -Browser brave
    pwsh -File tools/afk-night.ps1 -Reuse       # ya hay uno abierto: solo abre la pestana

  Deja la ventana a la vista. Minimizarla no rompe nada con estas banderas, pero
  taparla con otra ventana a pantalla completa es justo el caso que Chrome trata
  como oculta, y para eso esta --disable-features=CalculateNativeWinOcclusion.
#>
[CmdletBinding()]
param(
  [ValidateSet('auto', 'chrome', 'brave', 'edge')][string]$Browser = 'auto',
  [string]$Url = 'https://www.nitrotype.com/garage',
  [switch]$Install,
  [switch]$Reuse,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$candidates = [ordered]@{
  chrome = @(
    (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe')
  )
  brave  = @(
    (Join-Path $env:ProgramFiles 'BraveSoftware\Brave-Browser\Application\brave.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'BraveSoftware\Brave-Browser\Application\brave.exe')
  )
  edge   = @(
    (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe')
  )
}

$exe = $null
$chosen = $null
foreach ($name in $candidates.Keys) {
  if ($Browser -ne 'auto' -and $Browser -ne $name) { continue }
  foreach ($path in $candidates[$name]) {
    if ($path -and (Test-Path -LiteralPath $path)) { $exe = $path; $chosen = $name; break }
  }
  if ($exe) { break }
}
if (-not $exe) { throw "no encontre el navegador ($Browser)" }

# Los perfiles viven fuera del arbol de instalacion; si la carpeta no existe el
# navegador arranca de cero y el userscript no esta instalado.
$profileRoot = switch ($chosen) {
  'chrome' { Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data' }
  'brave' { Join-Path $env:LOCALAPPDATA 'BraveSoftware\Brave-Browser\User Data' }
  'edge' { Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\User Data' }
}

$flags = @(
  '--disable-background-timer-throttling'   # temporizadores de pestana oculta
  '--disable-backgrounding-occluded-windows' # ventanas tapadas
  '--disable-renderer-backgrounding'         # prioridad del renderer
  '--disable-features=CalculateNativeWinOcclusion,MemorySaverMode'
  '--no-first-run'
  '--no-default-browser-check'
)

$running = @(Get-Process -Name $chosen -ErrorAction SilentlyContinue)
if ($running.Count -gt 0 -and -not $Reuse) {
  Write-Warning "$chosen ya esta abierto ($($running.Count) procesos): una segunda instancia reusa la primera y descarta las banderas. Cierra $chosen y vuelve a lanzar, o usa -Reuse para abrir solo la pestana."
}

if (-not (Test-Path -LiteralPath $profileRoot)) {
  Write-Warning "no hay perfil de $chosen en $profileRoot"
  Write-Host '  Antes de dejar la noche corriendo:' -ForegroundColor Yellow
  Write-Host '   1. instala Tampermonkey (o Violentmonkey) en ese navegador' -ForegroundColor Yellow
  Write-Host '   2. abre nitro-wraith.user.js y confirma la instalacion' -ForegroundColor Yellow
  Write-Host '   3. inicia sesion en nitrotype.com con la cuenta del userscript' -ForegroundColor Yellow
}

if ($Reuse) {
  Write-Host "abriendo $Url en la instancia ya abierta de $chosen"
  if (-not $DryRun) { Start-Process -FilePath $exe -ArgumentList @($Url) | Out-Null }
  return
}

# -Install abre la pagina de instalacion en la misma ventana con banderas, para
# no tener que cerrar el navegador despues de instalar.
$targets = @()
if ($Install) {
  $targets += 'https://raw.githubusercontent.com/ezurinho/nitro-wraith/main/nitro-wraith.user.js'
}
$targets += $Url

$args = $flags + $targets
Write-Host ("{0} -> {1}" -f $chosen, $exe)
Write-Host ("argumentos: {0}" -f ($args -join ' '))
if ($DryRun) { return }

$proc = Start-Process -FilePath $exe -ArgumentList $args -PassThru
Write-Host "pid $($proc.Id)  -  la ventana queda a la vista; no la cierres hasta la manana" -ForegroundColor Green
Write-Host 'Comprobacion en 30 s: el panel tiene que decir  state  waiting - starts by itself' -ForegroundColor DarkGray

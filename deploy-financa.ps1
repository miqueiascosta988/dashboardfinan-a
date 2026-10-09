# deploy-financa.ps1
# Uso (PowerShell, dentro da pasta do repositório do Finança):
#   .\deploy-financa.ps1
#   .\deploy-financa.ps1 -Zip "C:\Users\voce\Downloads\dashboardfinan-a.zip"
#   .\deploy-financa.ps1 -Zip "...zip" -Mensagem "feat: perfil de renda"
param(
  [string]$Zip = "",
  [string]$Mensagem = "feat: dashboard moldado por vinculo de trabalho e previsibilidade da renda",
  [string]$Branch = ""
)
$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath ".git")) {
  Write-Host "ERRO: esta pasta nao e um repositorio git. Entre na pasta do projeto e rode de novo." -ForegroundColor Red
  exit 1
}

# 1) Opcional: copiar os arquivos do zip por cima do repositorio
if ($Zip -ne "") {
  if (-not (Test-Path -LiteralPath $Zip)) { Write-Host "ERRO: zip nao encontrado: $Zip" -ForegroundColor Red; exit 1 }
  $tmp = Join-Path $env:TEMP ("financa_" + [guid]::NewGuid().ToString("N"))
  Expand-Archive -LiteralPath $Zip -DestinationPath $tmp -Force
  $raiz = Join-Path $tmp "dashboardfinan-a"
  if (-not (Test-Path -LiteralPath $raiz)) { $raiz = $tmp }
  Write-Host "Copiando arquivos do zip..." -ForegroundColor Cyan
  robocopy $raiz (Get-Location).Path /E /XD ".git" "node_modules" /NFL /NDL /NJH /NJS | Out-Null
  Remove-Item -LiteralPath $tmp -Recurse -Force
}

# 2) Branch atual
if ($Branch -eq "") { $Branch = (git rev-parse --abbrev-ref HEAD).Trim() }
Write-Host "Branch: $Branch" -ForegroundColor Cyan

# 3) Garante que o .env nunca vai pro git
if (Test-Path -LiteralPath ".env") {
  if (-not (Select-String -LiteralPath ".gitignore" -Pattern "^\.env$" -Quiet -ErrorAction SilentlyContinue)) {
    Add-Content -LiteralPath ".gitignore" "`n.env`nnode_modules/"
    Write-Host ".env adicionado ao .gitignore" -ForegroundColor Yellow
  }
}

# 4) Mostra o que mudou
git add -A
$status = git status --short
if (-not $status) { Write-Host "Nada para commitar." -ForegroundColor Yellow; exit 0 }
Write-Host "`nArquivos alterados:" -ForegroundColor Cyan
$status

# 5) Commit e push
git commit -m $Mensagem
git push origin $Branch
if ($LASTEXITCODE -ne 0) {
  Write-Host "`nPush recusado. Se o remoto tem commits novos, rode: git pull --rebase origin $Branch  e depois este script de novo." -ForegroundColor Red
  exit 1
}

Write-Host "`nPush feito. Railway/Vercel devem iniciar o deploy sozinhos." -ForegroundColor Green
Write-Host "LEMBRETE: rode supabase/migrations/004_occupation.sql no SQL Editor do Supabase." -ForegroundColor Yellow
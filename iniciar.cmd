@echo off
REM ============================================
REM  JJ GUI - Lanzador web (Windows)
REM  Inicia el servidor y abre http://127.0.0.1:%PORT%
REM  Requiere Node.js, npm y jj en el PATH del sistema.
REM ============================================
setlocal
if "%PORT%"=="" set "PORT=3000"
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo No se encontro Node.js en el PATH. Instalalo desde https://nodejs.org y vuelve a intentarlo.
  goto end
)
where npm >nul 2>&1
if errorlevel 1 (
  echo No se encontro npm en el PATH. Reinstala Node.js y vuelve a intentarlo.
  goto end
)
where jj >nul 2>&1
if errorlevel 1 (
  echo AVISO: no se encontro jj en el PATH. La app arrancara, pero no podra hacer nada hasta que instales Jujutsu.
  echo         winget install jj-vcs.jj
)

if not exist "node_modules" (
  echo Instalando dependencias...
  call npm.cmd install
  if errorlevel 1 goto error
)

echo Iniciando JJ GUI (Jujutsu Version Control)...
echo La interfaz se abrira en http://127.0.0.1:%PORT%
start "" powershell -NoProfile -WindowStyle Hidden -Command "$p=%PORT%; for ($i=0; $i -lt 60; $i++) { try { $r = Invoke-WebRequest -UseBasicParsing -Uri \"http://127.0.0.1:$p\" -TimeoutSec 2; if ($r.StatusCode -eq 200) { break } } catch {} Start-Sleep -Seconds 1 }; Start-Process \"http://127.0.0.1:$p\""
call npm.cmd run dev
goto end

:error
echo.
echo No se pudieron instalar las dependencias. Revisa Node.js y tu conexion.

:end
echo.
echo La app se detuvo. Puedes cerrar esta ventana.
pause

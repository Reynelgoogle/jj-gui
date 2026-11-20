# JJ GUI — Jujutsu Version Control

Interfaz gráfica **web y de escritorio** para [Jujutsu (jj)](https://github.com/jj-vcs/jj).

La aplicación habla siempre con el binario real de `jj`: no hay motor de datos
simulados ni respuestas de éxito falsas. Si un comando falla, el error se muestra
en la interfaz.

## Características

- Grafo DAG de commits con bookmarks, conflictos, copia de trabajo (`@`) y filtro.
- Visor de diffs real por archivo (`jj diff`) con numeración de líneas.
- Estado real de la copia de trabajo (`jj status`): archivos modificados y conflictos.
- Acciones: `jj new`, `jj commit`, `jj describe`, `jj undo`, `jj split`, `jj edit`,
  `jj rebase`, `jj merge` y creación de bookmarks.
- Sincronización Git: `jj git fetch` / `jj git push` (deshabilitada si no hay remoto).
- Historial de ejecución CLI con código de salida, duración, stdout y stderr.
- Selector de repositorios con historial de repos abiertos.
- Interfaz bilingüe español / inglés.

## Requisitos

- Node.js **>= 20**
- **Jujutsu (jj)** instalado y disponible en el `PATH` (probado con `jj 0.44.0`)
- Git (solo si usas remotos)

## Instalación

```bash
npm install
```

## Uso

### Web (desarrollo)

```bash
npm run dev
```

Abre <http://127.0.0.1:3000>. En Windows también puedes hacer doble clic en
`iniciar.cmd`.

### Web (producción)

```bash
npm run build
npm start
```

`npm start` sirve el bundle de `dist/` con el servidor Express.

### Escritorio (Electron)

```bash
# Desarrollo: arranca el servidor y abre la ventana de Electron
npm run dev:electron

# Producción: compila y abre Electron
npm run start:electron
```

## Configuración

Copia `.env.example` a `.env` si quieres cambiar el puerto o el repositorio inicial:

| Variable | Descripción |
| --- | --- |
| `PORT` | Puerto del servidor (por defecto `3000`) |
| `HOST` | Interfaz de escucha (por defecto `127.0.0.1`) |
| `VITE_DEFAULT_REPO` | Repositorio que se abre la primera vez |

Después del primer arranque, la GUI guarda en `localStorage`:

- `jj_gui_last_repo`: último repositorio abierto.
- `jj_gui_recent_repos_v1`: lista de repositorios recientes.
- `jj_gui_config_v1`: configuración (binario, revset, auto-refresh).
- `jujutsu_gui_language`: idioma de la interfaz.

La configuración también se puede editar desde **Preferencias**: ruta del binario
`jj`, revset por defecto, auto-refresh e intervalo.

## Scripts

| Script | Descripción |
| --- | --- |
| `npm run dev` | Servidor Express + Vite en modo desarrollo |
| `npm run dev:electron` | Servidor de desarrollo + ventana Electron |
| `npm run build` | Compila web, Electron y servidor |
| `npm start` | Sirve la build web en producción |
| `npm run start:electron` | Compila y abre Electron |
| `npm run lint` | Comprueba TypeScript (`tsc --noEmit`) |
| `npm run check` | Lint + build completo |

## Arquitectura

```
electron/jj-service.ts   Ejecuta y parsea `jj` (única fuente de datos)
electron/main.ts         Proceso principal de Electron + IPC + menús
electron/preload.ts      Puente seguro `window.electronAPI`
server.ts                API REST de Express + Vite/estático
src/services/api.ts      Cliente universal (Electron IPC o HTTP)
src/hooks/useJJ.ts       Estado central de React
src/components/          Interfaz (grafo, diff, paneles y modales)
```

El cliente web y Electron comparten los mismos contratos de `src/types/jj.ts`.

### Notas de implementación

- `jj split` se ejecuta con `-m "<mensaje>"` y una lista de archivos, de modo que
  nunca abre un editor interactivo ni bloquea la GUI.
- Los diffs entre revisiones usan `jj diff --from <destino> --to <revisión>`.
- `jj log` usa una plantilla JSONL y fechas relativas reales (`committer.timestamp().ago()`).
- Las rutas de repositorio se validan antes de ejecutar cualquier comando.

## Solución de problemas

- **“No se encontró el ejecutable de Jujutsu”**: instala `jj` o indica su ruta
  absoluta en Preferencias.
- **“El repositorio no existe o no es una carpeta”**: revisa la ruta en el
  selector de repositorios. Debe ser la raíz donde está `.jj`.
- **El repositorio es inválido**: abre la raíz del repo (no un subdirectorio) o
  inicialízalo con `jj git init`.
- **Push/Fetch deshabilitados**: el repositorio no tiene remoto configurado.
  Añádelo con `jj git remote add origin <url>`.

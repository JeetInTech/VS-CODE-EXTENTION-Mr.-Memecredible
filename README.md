# 🎭 Uncanny Code Monitor

> *Watch Mr. Incredible become increasingly uncanny as your code falls apart.*

A VS Code extension that tracks your real-time diagnostics and visualizes your code health as a 9-stage emotional breakdown — inspired by the *Mr. Incredible Becoming Uncanny* meme.

---

## Features

- **Real-time diagnostics** — Monitors errors and warnings across all open files using `vscode.languages.getDiagnostics()`
- **9-stage chaos system** — Maps your chaos score to one of 9 progressive stages
- **Sidebar panel** — Large image view with live stats (errors / warnings / chaos score)
- **Status bar** — Quick emoji indicator + score, colored by severity
- **Sound mode** — Web Audio synthesized ambient tones that intensify with chaos (optional)
- **Recovery mode** — Celebratory flash when your code drops to 0 issues
- **Git conflict detection** — Detects merge conflict markers and boosts chaos score
- **Time decay** — Optionally reduce chaos score over time with no new errors
- **Fully configurable** — Weights, thresholds, sounds, meme mode toggle

---

## Setup

### 1. Add your images

Place your 9 stage images in the `media/` folder:

```
media/
  stage1.png   ← normal face (no issues)
  stage2.png   ← slight concern
  stage3.png   ← mild errors
  stage4.png   ← noticeable issues
  stage5.png   ← disturbing errors
  stage6.png   ← serious problems
  stage7.png   ← critical errors
  stage8.png   ← extreme failure
  stage9.png   ← full uncanny / broken state
```

> If an image is missing, the panel shows a placeholder — the extension still works fully.

### 2. Install dependencies & compile

```bash
npm install
npm run compile
```

### 3. Run in development

Press **F5** in VS Code to launch the Extension Development Host.

---

## Scoring System

| Chaos Score | Stage | Name |
|---|---|---|
| 0 | 1 | All Good |
| 1–2 | 2 | Slight Concern |
| 3–4 | 3 | Mild Errors |
| 5–6 | 4 | Noticeable Issues |
| 7–8 | 5 | Disturbing Errors |
| 9–10 | 6 | Serious Problems |
| 11–13 | 7 | Critical Errors |
| 14–16 | 8 | Extreme Failure |
| 17+ | 9 | Full Uncanny |

**Formula:** `chaos_score = (errors × errorWeight) + (warnings × warningWeight)`

Default weights: errors = 2, warnings = 1.

---

## Settings

| Setting | Default | Description |
|---|---|---|
| `uncannyCodeMonitor.enableSounds` | `false` | Play ambient sounds |
| `uncannyCodeMonitor.showInStatusBar` | `true` | Show in status bar |
| `uncannyCodeMonitor.memeMode` | `true` | Show meme images (false = stats only) |
| `uncannyCodeMonitor.errorWeight` | `2` | Score weight per error |
| `uncannyCodeMonitor.warningWeight` | `1` | Score weight per warning |
| `uncannyCodeMonitor.stageThresholds` | `[0,1,3,5,7,9,11,14,17]` | Custom stage boundaries |
| `uncannyCodeMonitor.debounceMs` | `400` | Debounce delay in ms |
| `uncannyCodeMonitor.enableGitConflictBoost` | `true` | Extra chaos for merge conflicts |
| `uncannyCodeMonitor.enableTimeDecay` | `false` | Slowly reduce score over time |
| `uncannyCodeMonitor.timeDecayIntervalMs` | `30000` | Time decay interval in ms |

---

## Commands

| Command | Description |
|---|---|
| `Uncanny Code Monitor: Open Panel` | Reveal the sidebar panel |
| `Uncanny Code Monitor: Toggle Sound Mode` | Enable/disable ambient sounds |
| `Uncanny Code Monitor: Reset Chaos Score` | Force re-evaluate current diagnostics |

---

## Package for distribution

```bash
npm install -g @vscode/vsce
vsce package
# Produces: uncanny-code-monitor-1.0.0.vsix
```

Install the `.vsix`:
```bash
code --install-extension uncanny-code-monitor-1.0.0.vsix
```

---

## Architecture

```
src/
  extension.ts          ← Activation, commands, status bar, wiring
  diagnosticsWatcher.ts ← Real-time diagnostic listener (debounced)
  scorer.ts             ← Pure scoring logic (testable, no VS Code deps)
  panel.ts              ← WebviewViewProvider sidebar panel

media/
  panel.js              ← Webview client script (DOM updates, Web Audio)
  panel.css             ← Dark premium UI styles
  stage1.png … stage9.png ← Your meme images (you provide these)
```

---

*Built with the VS Code Extension API · TypeScript · Web Audio API*

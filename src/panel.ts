/**
 * panel.ts
 * WebviewViewProvider for the Uncanny Code Monitor sidebar panel.
 * Renders the stage image, stats, and handles two-way messaging with the webview.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ScoreResult } from './scorer';

export class UncannyPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'uncannyCodeMonitor.panel';

  private _view?: vscode.WebviewView;
  private _extensionUri: vscode.Uri;

  /** Track the last result so we can re-render on panel reveal */
  private _lastResult: ScoreResult | undefined;

  constructor(extensionUri: vscode.Uri) {
    this._extensionUri = extensionUri;
  }

  /** Called by VS Code when the webview panel is shown for the first time or revealed. */
  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        this._extensionUri,
        vscode.Uri.joinPath(this._extensionUri, 'img'),
        vscode.Uri.joinPath(this._extensionUri, 'media'),
      ],
    };

    webviewView.webview.html = this._buildHtml(webviewView.webview);

    // Handle messages from the webview (e.g. sound ready confirmation)
    webviewView.webview.onDidReceiveMessage((msg) => {
      if (msg.type === 'ready') {
        // Send current state as soon as webview signals it's ready
        if (this._lastResult) {
          this._sendUpdate(this._lastResult);
        }
      }
    });

    // Re-send state when panel becomes visible again
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible && this._lastResult) {
        this._sendUpdate(this._lastResult);
      }
    });
  }

  /**
   * Push a new score result update to the webview.
   * Call this from extension.ts whenever diagnostics change.
   */
  public update(result: ScoreResult): void {
    this._lastResult = result;
    if (this._view?.visible) {
      this._sendUpdate(result);
    }
  }

  private _sendUpdate(result: ScoreResult): void {
    if (!this._view) {
      return;
    }
    const config = vscode.workspace.getConfiguration('uncannyCodeMonitor');
    const soundEnabled = config.get<boolean>('enableSounds', false);
    const memeMode = config.get<boolean>('memeMode', true);

    // Build the webview-safe URI for the stage image
    const imageUri = this._getStageImageUri(this._view.webview, result.stage);

    this._view.webview.postMessage({
      type: 'update',
      stage: result.stage,
      stageName: result.stageName,
      errors: result.errors,
      warnings: result.warnings,
      chaosScore: result.chaosScore,
      imageUri: imageUri?.toString(),
      soundEnabled,
      memeMode,
    });
  }

  /**
   * Build the webview-safe URI for a stage image.
   * Returns undefined if the image file doesn't exist yet.
   */
  private _getStageImageUri(
    webview: vscode.Webview,
    stage: number,
  ): vscode.Uri | undefined {
    // Files are named: "stageN.png" inside the img/ folder
    const imagePath = vscode.Uri.joinPath(
      this._extensionUri,
      'img',
      `stage${stage}.png`,
    );
    try {
      fs.accessSync(imagePath.fsPath);
      return webview.asWebviewUri(imagePath);
    } catch {
      return undefined;
    }
  }

  /** Build the full HTML document for the webview. */
  private _buildHtml(webview: vscode.Webview): string {
    // Load panel.js and panel.css as webview URIs (still in media/)
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'panel.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'panel.css'),
    );

    // Content Security Policy nonce for inline scripts/styles
    const nonce = getNonce();

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             img-src ${webview.cspSource} https: data:;
             script-src 'nonce-${nonce}';
             style-src ${webview.cspSource} 'unsafe-inline';
             media-src 'none';">
  <link rel="stylesheet" href="${styleUri}">
  <title>Mr. Memecredible</title>
</head>
<body>
  <div id="app">
    <div id="header">
      <span id="stage-badge" class="badge">Stage 1</span>
      <span id="stage-name" class="stage-name">All Good</span>
    </div>

    <div id="image-container">
      <!-- Stage image rendered here -->
      <img id="stage-img" src="" alt="Stage image" draggable="false" />
      <div id="no-image-placeholder" class="placeholder hidden">
        <div class="placeholder-icon">🎭</div>
        <div class="placeholder-text">Place your stage images in<br><code>/img/stage1.png</code> → <code>stage9.png</code></div>
      </div>
    </div>

    <div id="stats-panel">
      <div class="stat-row">
        <span class="stat-icon error-icon">✗</span>
        <span class="stat-label">Errors</span>
        <span id="stat-errors" class="stat-value error-value">0</span>
      </div>
      <div class="stat-row">
        <span class="stat-icon warn-icon">⚠</span>
        <span class="stat-label">Warnings</span>
        <span id="stat-warnings" class="stat-value warn-value">0</span>
      </div>
      <div class="stat-row chaos-row">
        <span class="stat-icon chaos-icon">💀</span>
        <span class="stat-label">Chaos Score</span>
        <span id="stat-score" class="stat-value chaos-value">0</span>
      </div>
    </div>

    <div id="chaos-bar-container">
      <div id="chaos-bar">
        <div id="chaos-bar-fill"></div>
      </div>
      <span id="chaos-bar-label">0 / 17+</span>
    </div>

    <div id="status-message">Your code is healthy 💪</div>

    <div id="sound-indicator" class="hidden">
      <span>🔊</span> Sound Mode <span id="sound-stage-dot"></span>
    </div>
  </div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

/** Generate a cryptographically random nonce for CSP. */
function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

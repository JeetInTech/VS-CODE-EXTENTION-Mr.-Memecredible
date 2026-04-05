/**
 * extension.ts
 * Main entry point for Uncanny Code Monitor.
 * Wires together: DiagnosticsWatcher → Scorer → Panel + StatusBar.
 */

import * as vscode from 'vscode';
import { DiagnosticsWatcher } from './diagnosticsWatcher';
import { UncannyPanelProvider } from './panel';
import { ScoreResult } from './scorer';

// ─── Status Bar ──────────────────────────────────────────────────────────────

/** Emoji icons mapped to each stage for the status bar. */
const STAGE_ICONS: readonly string[] = [
  '😊', // 1 - All Good
  '🙂', // 2 - Slight Concern
  '😐', // 3 - Mild Errors
  '😟', // 4 - Noticeable Issues
  '😨', // 5 - Disturbing Errors
  '😰', // 6 - Serious Problems
  '😱', // 7 - Critical Errors
  '🤯', // 8 - Extreme Failure
  '💀', // 9 - Full Uncanny
];

/** Recovery flash — briefly shows stage 1 icon when score drops to 0. */
let _recoveryTimer: ReturnType<typeof setTimeout> | undefined;
let _isInRecovery = false;

// ─── Activation ──────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
  console.log('[MrMemecredible] Extension activated.');

  // ── Sidebar panel provider ─────────────────────────────────────────────────
  const panelProvider = new UncannyPanelProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      UncannyPanelProvider.viewType,
      panelProvider,
      {
        // Keep panel alive even when hidden (avoids re-builds)
        webviewOptions: { retainContextWhenHidden: true },
      },
    ),
  );

  // ── Status bar item ────────────────────────────────────────────────────────
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBar.command = 'uncannyCodeMonitor.openPanel';
  statusBar.tooltip = 'Mr. Memecredible — click to open panel';
  context.subscriptions.push(statusBar);

  // Show or hide status bar based on settings
  const updateStatusBarVisibility = () => {
    const config = vscode.workspace.getConfiguration('uncannyCodeMonitor');
    const show = config.get<boolean>('showInStatusBar', true);
    if (show) {
      statusBar.show();
    } else {
      statusBar.hide();
    }
  };
  updateStatusBarVisibility();

  // ── Shared update handler ──────────────────────────────────────────────────
  let _prevStage = 1;

  const handleScoreChange = (result: ScoreResult): void => {
    // ── Panel update ─────────────────────────────────────────────────────────
    panelProvider.update(result);

    // ── Status bar update ────────────────────────────────────────────────────
    const config = vscode.workspace.getConfiguration('uncannyCodeMonitor');
    const showStatus = config.get<boolean>('showInStatusBar', true);

    if (showStatus) {
      const icon = STAGE_ICONS[result.stage - 1];

      // Recovery mode: if score just dropped to 0, flash a "recovery" message
      if (result.chaosScore === 0 && _prevStage > 1) {
        triggerRecovery(statusBar, icon, result);
      } else if (!_isInRecovery) {
        statusBar.text = `${icon} Stage ${result.stage} — ${result.chaosScore} chaos`;
        statusBar.tooltip = buildTooltip(result);
        // Color the status bar based on severity
        statusBar.backgroundColor = getSeverityBackground(result.stage);
      }
      statusBar.show();
    } else {
      statusBar.hide();
    }

    _prevStage = result.stage;
  };

  // ── Diagnostics watcher ────────────────────────────────────────────────────
  const watcher = new DiagnosticsWatcher(handleScoreChange);
  context.subscriptions.push(watcher);

  // ── Configuration change listener ──────────────────────────────────────────
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('uncannyCodeMonitor')) {
        updateStatusBarVisibility();
        watcher.refresh();
      }
    }),
  );

  // ── Commands ───────────────────────────────────────────────────────────────

  // Open the sidebar panel — focuses our custom activity bar container
  context.subscriptions.push(
    vscode.commands.registerCommand('uncannyCodeMonitor.openPanel', () => {
      vscode.commands.executeCommand(
        'workbench.view.extension.mr-memecredible-container',
      );
    }),
  );

  // Toggle sound mode
  context.subscriptions.push(
    vscode.commands.registerCommand('uncannyCodeMonitor.toggleSounds', () => {
      const config = vscode.workspace.getConfiguration('uncannyCodeMonitor');
      const current = config.get<boolean>('enableSounds', false);
      config.update('enableSounds', !current, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(
        `Mr. Memecredible: Sound mode ${!current ? 'enabled 🔊' : 'disabled 🔇'}`,
      );
      watcher.forceUpdate();
    }),
  );

  // Reset / force re-evaluate score
  context.subscriptions.push(
    vscode.commands.registerCommand('uncannyCodeMonitor.resetScore', () => {
      watcher.forceUpdate();
      vscode.window.showInformationMessage('Mr. Memecredible: Score refreshed!');
    }),
  );
}

export function deactivate(): void {
  if (_recoveryTimer !== undefined) {
    clearTimeout(_recoveryTimer);
  }
  console.log('[MrMemecredible] Extension deactivated.');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build the tooltip string for the status bar item. */
function buildTooltip(result: ScoreResult): string {
  return [
    `🎭 Mr. Memecredible`,
    ``,
    `Stage: ${result.stage} — ${result.stageName}`,
    `Errors: ${result.errors}`,
    `Warnings: ${result.warnings}`,
    `Chaos Score: ${result.chaosScore}`,
    ``,
    `Click to open panel`,
  ].join('\n');
}

/** Return a VS Code ThemeColor for the status bar background based on stage. */
function getSeverityBackground(
  stage: number,
): vscode.ThemeColor | undefined {
  if (stage >= 7) {
    return new vscode.ThemeColor('statusBarItem.errorBackground');
  }
  if (stage >= 4) {
    return new vscode.ThemeColor('statusBarItem.warningBackground');
  }
  return undefined; // default theme color
}

/**
 * Recovery mode: briefly flash a celebratory "All Clear" message,
 * then restore normal display.
 */
function triggerRecovery(
  statusBar: vscode.StatusBarItem,
  icon: string,
  result: ScoreResult,
): void {
  if (_recoveryTimer !== undefined) {
    clearTimeout(_recoveryTimer);
  }
  _isInRecovery = true;
  statusBar.text = `🎉 Code Cleared! — All Good`;
  statusBar.backgroundColor = undefined;
  statusBar.tooltip = buildTooltip(result);

  _recoveryTimer = setTimeout(() => {
    _isInRecovery = false;
    statusBar.text = `${icon} Stage ${result.stage} — ${result.chaosScore} chaos`;
    statusBar.backgroundColor = undefined;
  }, 3000);
}

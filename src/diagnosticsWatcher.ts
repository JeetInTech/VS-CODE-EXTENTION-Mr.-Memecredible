/**
 * diagnosticsWatcher.ts
 * Watches VS Code diagnostics in real-time, debounces updates, detects
 * git merge conflicts, and emits a structured event whenever the score changes.
 */

import * as vscode from 'vscode';
import { buildScoreResult, DEFAULT_STAGE_THRESHOLDS, ScoreResult } from './scorer';

export type ScoreChangeHandler = (result: ScoreResult) => void;

export class DiagnosticsWatcher implements vscode.Disposable {
  private readonly _disposables: vscode.Disposable[] = [];
  private readonly _onScoreChange: ScoreChangeHandler;

  /** Debounce timer handle */
  private _debounceTimer: ReturnType<typeof setTimeout> | undefined;

  /** Time-decay interval handle */
  private _decayTimer: ReturnType<typeof setInterval> | undefined;

  /** Last known score (used for decay) */
  private _lastScore = 0;

  constructor(onScoreChange: ScoreChangeHandler) {
    this._onScoreChange = onScoreChange;

    // Listen to diagnostic changes on any language/document
    this._disposables.push(
      vscode.languages.onDidChangeDiagnostics(() => this._scheduleUpdate()),
    );

    // Also re-evaluate when workspace changes or files open/close
    this._disposables.push(
      vscode.workspace.onDidOpenTextDocument(() => this._scheduleUpdate()),
      vscode.workspace.onDidCloseTextDocument(() => this._scheduleUpdate()),
    );

    // Run immediately on activation to show current state
    this._scheduleUpdate(0);

    // Start time-decay if configured
    this._startDecayTimer();
  }

  /** Schedule a debounced update. */
  private _scheduleUpdate(delay?: number): void {
    const config = vscode.workspace.getConfiguration('uncannyCodeMonitor');
    const debounceMs: number = delay ?? config.get<number>('debounceMs', 400);

    if (this._debounceTimer !== undefined) {
      clearTimeout(this._debounceTimer);
    }
    this._debounceTimer = setTimeout(() => this._update(), debounceMs);
  }

  /** Perform the actual diagnostic scan and fire the change handler. */
  private _update(): void {
    try {
      const config = vscode.workspace.getConfiguration('uncannyCodeMonitor');
      const errorWeight = config.get<number>('errorWeight', 2);
      const warningWeight = config.get<number>('warningWeight', 1);
      const thresholds = config.get<number[]>(
        'stageThresholds',
        [...DEFAULT_STAGE_THRESHOLDS],
      );
      const gitBoost = config.get<boolean>('enableGitConflictBoost', true);

      let errors = 0;
      let warnings = 0;

      // Aggregate diagnostics across all known URIs.
      // Only count diagnostics for file:// URIs to avoid noise from
      // virtual documents (e.g. Salesforce SFDX, output channels, etc.)
      const allDiagnostics = vscode.languages.getDiagnostics();
      for (const [uri, fileDiags] of allDiagnostics) {
        // Skip non-file URIs (virtual docs, salesforce, output panels, etc.)
        if (uri.scheme !== 'file') {
          continue;
        }
        for (const diag of fileDiags) {
          if (diag.severity === vscode.DiagnosticSeverity.Error) {
            errors++;
          } else if (diag.severity === vscode.DiagnosticSeverity.Warning) {
            warnings++;
          }
        }
      }

      // Bonus chaos: detect git merge conflict markers in open text documents
      if (gitBoost) {
        const conflictCount = this._countMergeConflicts();
        // Each conflict file adds +3 errors-worth of chaos
        errors += conflictCount * 3;
      }

      const result = buildScoreResult(errors, warnings, thresholds, errorWeight, warningWeight);
      this._lastScore = result.chaosScore;
      this._onScoreChange(result);
    } catch (_err) {
      // Silently swallow internal errors — never let a watcher update crash the extension
    }
  }

  /**
   * Scan open text editors for git merge conflict markers (<<<<<<).
   * Returns number of files with conflicts.
   */
  private _countMergeConflicts(): number {
    let conflictFiles = 0;
    for (const doc of vscode.workspace.textDocuments) {
      try {
        // Only scan real files (not virtual docs, output panels, etc.)
        if (doc.isClosed || doc.uri.scheme !== 'file') {
          continue;
        }
        // Skip very large files (> 500 KB) for performance
        if (doc.getText.length > 500_000) {
          continue;
        }
        const text = doc.getText();
        if (text.includes('<<<<<<<') && text.includes('=======') && text.includes('>>>>>>>')) {
          conflictFiles++;
        }
      } catch (_) {
        // Skip any document that errors on getText()
      }
    }
    return conflictFiles;
  }

  /** Start the optional time-decay interval. */
  private _startDecayTimer(): void {
    this._stopDecayTimer();
    const config = vscode.workspace.getConfiguration('uncannyCodeMonitor');
    const decayEnabled = config.get<boolean>('enableTimeDecay', false);
    const decayInterval = config.get<number>('timeDecayIntervalMs', 30000);

    if (!decayEnabled) {
      return;
    }

    this._decayTimer = setInterval(() => {
      if (this._lastScore > 0) {
        this._scheduleUpdate(0);
      }
    }, decayInterval);
  }

  private _stopDecayTimer(): void {
    if (this._decayTimer !== undefined) {
      clearInterval(this._decayTimer);
      this._decayTimer = undefined;
    }
  }

  /** Re-apply configuration changes (e.g. user updates settings). */
  public refresh(): void {
    this._stopDecayTimer();
    this._startDecayTimer();
    this._scheduleUpdate(0);
  }

  /** Force an immediate update (useful for reset command). */
  public forceUpdate(): void {
    this._scheduleUpdate(0);
  }

  dispose(): void {
    this._stopDecayTimer();
    if (this._debounceTimer !== undefined) {
      clearTimeout(this._debounceTimer);
    }
    for (const d of this._disposables) {
      d.dispose();
    }
  }
}

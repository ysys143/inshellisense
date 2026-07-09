// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Suggestion, SuggestionBlob } from "../runtime/model.js";
import { getSuggestions } from "../runtime/runtime.js";
import type { ISTerm, ISTermPatch } from "../isterm/pty.js";
import { renderBox, truncateText, truncateMultilineText } from "./utils.js";
import chalk from "chalk";
import { Shell } from "../utils/shell.js";
import log from "../utils/log.js";
import { getConfig } from "../utils/config.js";
import { calculateReplacement, applyReplacement } from "../runtime/replacement.js";
import { getAIProvider } from "../runtime/ai/index.js";
import { collectEnv } from "../runtime/ai/prompt.js";
import { SuggestionIcons } from "../runtime/suggestion.js";
import { wcswidth } from "../utils/unicode.js";

const getMaxSuggestions = () => getConfig().maxSuggestions ?? 5;
const suggestionWidth = 40;
const descriptionWidth = 30;
const descriptionHeight = 5;
const borderWidth = 2;
const activeSuggestionBackgroundColor = "#7D56F4";
export const getMaxLines = () => borderWidth + Math.max(getMaxSuggestions(), descriptionHeight) + 1; // accounts when there is a unhandled newline at the end of the command
export const MIN_WIDTH = borderWidth + descriptionWidth;

export type KeyPressEvent = [string | null | undefined, KeyPress];

type KeyPress = {
  sequence: string;
  name: string;
  ctrl: boolean;
  shift: boolean;
};

const aiSuggestion = (name: string, insertValue: string | undefined): Suggestion => ({
  name,
  allNames: [name],
  icon: SuggestionIcons.Special,
  priority: 100,
  type: "special",
  insertValue,
});

export class SuggestionManager {
  #term: ISTerm;
  #command: string;
  #activeSuggestionIdx: number;
  #suggestBlob?: SuggestionBlob;
  #shell: Shell;
  #hideSuggestions: boolean = false;
  #abortController?: AbortController;
  #aiPending: boolean = false;
  #aiActive: boolean = false;
  #llmAbortController?: AbortController;

  constructor(terminal: ISTerm, shell: Shell) {
    this.#term = terminal;
    this.#suggestBlob = { suggestions: [] };
    this.#command = "";
    this.#activeSuggestionIdx = 0;
    this.#shell = shell;
  }

  private async _loadSuggestions(): Promise<void> {
    if (this.#aiPending) return; // don't let spec suggestions overwrite the AI loading/result blob
    this.#abortController?.abort();
    const commandState = this.#term.getCommandState();
    const commandText = commandState.commandText;
    if (!commandText) {
      this.#command = "";
    }
    if (!commandText || this.#hideSuggestions || commandState.hasOutput) {
      this.#suggestBlob = undefined;
      this.#activeSuggestionIdx = 0;
      return;
    }
    if (commandText == this.#command) {
      return;
    }
    this.#aiActive = false; // command text changed -> spec path supersedes any AI result
    this.#abortController = new AbortController();
    try {
      const suggestionBlob = await getSuggestions(commandText, this.#term.cwd, this.#shell, this.#abortController.signal);
      this.#command = commandText;
      this.#suggestBlob = suggestionBlob;
      this.#activeSuggestionIdx = 0;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        log.debug({ msg: "suggestion generation aborted", commandText, shell: this.#shell });
        return;
      }
      throw e;
    }
  }

  private _renderArgumentDescription(description: string | undefined) {
    if (!description) return [];
    return renderBox([truncateText(description, descriptionWidth - borderWidth)], descriptionWidth);
  }

  private _renderDescription(description: string | undefined) {
    if (!description) return "";
    return renderBox(truncateMultilineText(description, descriptionWidth - borderWidth, descriptionHeight), descriptionWidth);
  }

  private _renderSuggestions(suggestions: Suggestion[], activeSuggestionIdx: number, width: number = suggestionWidth) {
    return renderBox(
      suggestions.map((suggestion, idx) => {
        const suggestionText = `${suggestion.icon} ${suggestion.name}`;
        const truncatedSuggestion = truncateText(suggestionText, width - 2);
        return idx == activeSuggestionIdx ? chalk.bgHex(activeSuggestionBackgroundColor)(truncatedSuggestion) : truncatedSuggestion;
      }),
      width,
    );
  }

  private _calculatePadding(description: string, width: number = suggestionWidth): { padding: number; swapDescription: boolean } {
    const wrappedPadding = this.#term.getCursorState().cursorX % this.#term.cols;
    const maxPadding = description.length !== 0 ? this.#term.cols - width - descriptionWidth : this.#term.cols - width;
    const swapDescription = wrappedPadding > maxPadding && description.length !== 0;
    const swappedPadding = swapDescription ? Math.max(wrappedPadding - descriptionWidth, 0) : wrappedPadding;
    const padding = Math.min(Math.min(wrappedPadding, swappedPadding), maxPadding);
    return { padding, swapDescription };
  }

  private _calculateRowPadding(
    padding: number,
    swapDescription: boolean,
    suggestionContent?: string,
    descriptionContent?: string,
    width: number = suggestionWidth,
  ): number {
    if (swapDescription) {
      return descriptionContent == null ? padding + descriptionWidth : padding;
    }
    return suggestionContent == null ? padding + width : padding;
  }

  async exec(): Promise<void> {
    return await this._loadSuggestions();
  }

  render(direction: "above" | "below"): ISTermPatch[] {
    if (!this.#suggestBlob) {
      return [];
    }
    const { suggestions, argumentDescription } = this.#suggestBlob;

    const maxSuggestions = getMaxSuggestions();
    const page = Math.min(Math.floor(this.#activeSuggestionIdx / maxSuggestions) + 1, Math.floor(suggestions.length / maxSuggestions) + 1);
    const pagedSuggestions = suggestions.filter((_, idx) => idx < page * maxSuggestions && idx >= (page - 1) * maxSuggestions);
    const activePagedSuggestionIndex = this.#activeSuggestionIdx % maxSuggestions;
    const activeDescription = pagedSuggestions.at(activePagedSuggestionIndex)?.description || argumentDescription || "";
    // AI results are a single, often short command -> size the box to its content
    // instead of the fixed suggestionWidth (which suits multi-item spec lists).
    const sw = this.#aiActive
      ? Math.min(suggestionWidth, Math.max(0, ...pagedSuggestions.map((s) => wcswidth(`${s.icon} ${s.name}`))) + borderWidth)
      : suggestionWidth;
    const { swapDescription, padding } = this._calculatePadding(activeDescription, sw);

    if (suggestions.length <= this.#activeSuggestionIdx) {
      this.#activeSuggestionIdx = Math.max(suggestions.length - 1, 0);
    }

    if (pagedSuggestions.length == 0) {
      if (argumentDescription != null) {
        return this._renderArgumentDescription(argumentDescription).map((row) => ({ startX: padding, length: descriptionWidth, data: row }));
      }
      return [];
    }
    const descriptionUI = this._renderDescription(activeDescription);
    const suggestionUI = this._renderSuggestions(pagedSuggestions, activePagedSuggestionIndex, sw);
    const ui = [];
    const maxRows = Math.max(descriptionUI.length, suggestionUI.length);
    for (let i = 0; i < maxRows; i++) {
      const [suggestionUIRow, descriptionUIRow] =
        direction == "above"
          ? [suggestionUI[i - maxRows + suggestionUI.length], descriptionUI[i - maxRows + descriptionUI.length]]
          : [suggestionUI[i], descriptionUI[i]];

      const data = swapDescription ? (descriptionUIRow ?? "") + (suggestionUIRow ?? "") : (suggestionUIRow ?? "") + (descriptionUIRow ?? "");
      const rowPadding = this._calculateRowPadding(padding, swapDescription, suggestionUIRow, descriptionUIRow, sw);

      ui.push({
        startX: rowPadding,
        length: (suggestionUIRow == null ? 0 : sw) + (descriptionUIRow == null ? 0 : descriptionWidth),
        data: data,
      });
    }
    return ui;
  }

  update(keyPress: KeyPress): boolean {
    const { name, shift, ctrl } = keyPress;
    const {
      dismissSuggestions: { key: dismissKey, shift: dismissShift, control: dismissCtrl },
      acceptSuggestion: { key: acceptKey, shift: acceptShift, control: acceptCtrl },
      nextSuggestion: { key: nextKey, shift: nextShift, control: nextCtrl },
      previousSuggestion: { key: prevKey, shift: prevShift, control: prevCtrl },
      generateCommand: { key: genKey, shift: genShift, control: genCtrl },
    } = getConfig().bindings;

    // AI trigger must run even when there are no spec suggestions (natural language),
    // so it is handled before the `!this.#suggestBlob` early-return below.
    if (name == genKey && shift == !!genShift && ctrl == !!genCtrl) {
      void this._triggerAI();
      return true;
    }

    // Any non-trigger key cancels an in-flight AI request (user kept typing).
    if (this.#aiPending) {
      this.#llmAbortController?.abort();
      this.#aiPending = false;
    }

    // AI result: accept with tab OR enter, replacing the whole natural-language line.
    // Enter accepts (does not run) since the line is natural language, not a command.
    // Handled before the enter-clears-command logic below so the replacement survives.
    if (this.#aiActive && this.#suggestBlob) {
      const acceptTab = name == acceptKey && shift == !!acceptShift && ctrl == !!acceptCtrl;
      if (acceptTab || name == "return") {
        const insert = this.#suggestBlob.suggestions.at(this.#activeSuggestionIdx)?.insertValue;
        if (insert != null) {
          const width = wcswidth(this.#term.getCommandState().commandText ?? "");
          this.#term.write(applyReplacement({ backspaceCount: width, insertText: insert }));
        }
        this.#aiActive = false;
        return true;
      }
    }

    if (name == "return") {
      this.#term.clearCommand(); // clear the current command on enter
    }

    // if suggestions are hidden, keep them hidden until during command navigation
    if (this.#hideSuggestions) {
      this.#hideSuggestions = name == "up" || name == "down";
    }

    if (!this.#suggestBlob) {
      return false;
    }

    if (name == dismissKey && shift == !!dismissShift && ctrl == !!dismissCtrl) {
      this.#suggestBlob = undefined;
      this.#hideSuggestions = true;
      this.#aiActive = false;
    } else if (name == prevKey && shift == !!prevShift && ctrl == !!prevCtrl) {
      this.#activeSuggestionIdx = Math.max(0, this.#activeSuggestionIdx - 1);
    } else if (name == nextKey && shift == !!nextShift && ctrl == !!nextCtrl) {
      this.#activeSuggestionIdx = Math.min(this.#activeSuggestionIdx + 1, (this.#suggestBlob?.suggestions.length ?? 1) - 1);
    } else if (name == acceptKey && shift == !!acceptShift && ctrl == !!acceptCtrl) {
      const suggestion = this.#suggestBlob?.suggestions.at(this.#activeSuggestionIdx);
      if (suggestion == null || this.#suggestBlob?.suggestions.length == 0) {
        return false;
      }
      const action = calculateReplacement(this.#suggestBlob?.activeToken, suggestion);
      if (action == null) {
        return false;
      }
      this.#term.write(applyReplacement(action));
    } else if (name == "return" || (name == "c" && ctrl)) {
      this.#term.clearCommand();
      return false;
    } else {
      return false;
    }
    log.debug({ msg: "handled keypress", ...keyPress });
    return true;
  }

  // Fire-and-forget from update() (keypress is sync). Sets a loading blob, calls the
  // provider, then swaps in the result/error blob. Re-render is driven by term.noop().
  private async _triggerAI(): Promise<void> {
    const commandText = this.#term.getCommandState().commandText;
    if (!commandText) return;

    this.#llmAbortController?.abort();
    const controller = new AbortController();
    this.#llmAbortController = controller;
    this.#aiPending = true;
    this.#aiActive = false;
    this.#command = commandText; // keep _loadSuggestions from recomputing over the AI blob
    this.#activeSuggestionIdx = 0;
    this.#suggestBlob = { suggestions: [aiSuggestion("Generating...", undefined)] };
    this.#term.noop();

    // timedOut distinguishes a timeout (show error) from a user cancel (stay silent),
    // since both abort the same controller. AbortSignal.any isn't in the type defs.
    const timeoutMs = getConfig().ai?.timeoutMs ?? 8000;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const provider = getAIProvider();
      const cmd = await provider.generateCommand(
        { input: commandText, cwd: this.#term.cwd, env: collectEnv(this.#shell), shell: this.#shell },
        controller.signal,
      );
      clearTimeout(timer);
      this.#aiPending = false;
      this.#aiActive = true;
      this.#activeSuggestionIdx = 0;
      this.#suggestBlob = { suggestions: [aiSuggestion(cmd, cmd)] };
      this.#term.noop();
    } catch (e) {
      clearTimeout(timer);
      this.#aiPending = false;
      if (controller.signal.aborted && !timedOut) {
        return; // user cancelled by typing; let normal flow resume
      }
      this.#aiActive = true;
      const msg = timedOut ? "timeout" : e instanceof Error ? e.message : String(e);
      this.#activeSuggestionIdx = 0;
      this.#suggestBlob = { suggestions: [aiSuggestion(`[AI] error: ${truncateText(msg, 40)}`, undefined)] };
      this.#term.noop();
    }
  }
}

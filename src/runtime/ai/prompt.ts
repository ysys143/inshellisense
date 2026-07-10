// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import os from "node:os";

import { NLRequest } from "./provider.js";

// Builds the "os/arch | shell version" context string injected into the prompt,
// mirroring autocorrect.zsh's _FIX_ENV. inshellisense already uses os.platform()
// widely, but os.arch() and the shell version are collected fresh here.
export const collectEnv = (shell: string): string => {
  const platform = os.platform();
  const arch = os.arch();
  const shellVersion = process.env.ZSH_VERSION ?? process.env.BASH_VERSION ?? "";
  const shellStr = shellVersion ? `${shell} ${shellVersion}` : shell;
  return `${platform}/${arch} | ${shellStr}`;
};

// Single-string prompt for Gemini's native API (JSON {"cmd":"..."} output).
export const buildPrompt = (req: NLRequest): string => {
  return `[env: ${req.env}] [cwd: ${req.cwd}]
${req.input}
-> Output the single correct command that fulfills the user's intent. Rules: 1) achieve exactly what the user wants 2) use only options valid for the env above (mind OS/shell differences: macOS coreutils differ from GNU, BSD sort lacks -h, bash vs zsh syntax) 3) do not add heavy work that was not requested. Respond ONLY as JSON: {"cmd":"command"}.`;
};

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

// OpenAI-style few-shot messages for command generation. The platform context lives in
// the system prompt (nudges BSD vs GNU); the few-shot pairs pin the "bare command" format
// that small models otherwise ignore.
export const buildMessages = (req: NLRequest): ChatMessage[] => {
  const bsdHint = req.env.includes("darwin") ? " Target macOS/BSD: avoid GNU-only flags (ps has no --sort; use `ps aux | sort` or `top -o`)." : "";
  const system = `Translate the request into ONE runnable shell command for this environment: ${req.env}.${bsdHint} The request may be natural language in any language (including Korean), or a bare tool/service/domain name — always output the full command that accomplishes it (a service or domain name means the command that queries it, e.g. via curl). Never echo the input back unchanged. Reply with only the command line: no prose, no markdown, no code fences, no alternatives. Exactly one line.`;
  return [
    { role: "system", content: system },
    { role: "user", content: "list files by size" },
    { role: "assistant", content: "ls -lhS" },
    { role: "user", content: "disk usage per item at depth 1, largest first" },
    { role: "assistant", content: "du -sh * | sort -rh" },
    { role: "user", content: "find folders named cc without recursion" },
    { role: "assistant", content: "find . -maxdepth 1 -type d -name '*cc*'" },
    { role: "user", content: "copy the current path to the clipboard" },
    { role: "assistant", content: "pwd | pbcopy" },
    { role: "user", content: "top processes by memory" },
    { role: "assistant", content: "top -o mem" },
    { role: "user", content: "ifconfig.me" },
    { role: "assistant", content: "curl ifconfig.me" },
    { role: "user", content: `[cwd: ${req.cwd}] ${req.input}` },
  ];
};

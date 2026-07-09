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

// Prompt ported verbatim from autocorrect.zsh (already tuned against Gemini):
// platform + cwd context, intent-faithful single command, JSON {"cmd": "..."}.
export const buildPrompt = (req: NLRequest): string => {
  return `[env: ${req.env}] [cwd: ${req.cwd}]
${req.input}
-> 사용자 의도를 정확히 반영한 올바른 명령어 한 줄만. 규칙: 1) 사용자가 원하는 결과를 정확히 달성할 것 2) 위 env 정보에 맞는 옵션만 사용 (OS/셸별 차이 주의. 예: macOS coreutils는 GNU와 다름, BSD sort는 -h 미지원, bash와 zsh 문법 차이 등) 3) 사용자가 요청하지 않은 무거운 작업을 추가하지 말 것. 반드시 {"cmd": "명령어"} JSON 형식으로 응답.`;
};

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

// OpenAI-style few-shot messages for command generation. The platform context lives in
// the system prompt (nudges BSD vs GNU); the few-shot pairs pin the "bare command" format
// that small models otherwise ignore.
export const buildMessages = (req: NLRequest): ChatMessage[] => {
  const system = `You translate a natural-language request into ONE shell command for this environment: ${req.env}. Reply with only the command line: no prose, no markdown, no code fences, no alternatives. Exactly one line.`;
  return [
    { role: "system", content: system },
    { role: "user", content: "list files by size" },
    { role: "assistant", content: "ls -lhS" },
    { role: "user", content: "깊이1 파일크기 탐색" },
    { role: "assistant", content: "du -sh * | sort -rh" },
    { role: "user", content: "find folders named cc without recursion" },
    { role: "assistant", content: "find . -maxdepth 1 -type d -name '*cc*'" },
    { role: "user", content: `[cwd: ${req.cwd}] ${req.input}` },
  ];
};

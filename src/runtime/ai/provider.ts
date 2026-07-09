// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Provider-agnostic contract for natural-language -> shell command generation.
// Intentionally minimal: "natural language in, one command out". This shape is
// driven by the most dissimilar backend (Gemini's native API) so that later
// OpenAI-compatible providers (GLM/Kimi/Alibaba/ollama/mlx) can implement it
// without leaking their request format into the interface.

export type NLRequest = {
  input: string; // natural language, or a malformed command to correct
  cwd: string; // current working directory
  env: string; // platform context, e.g. "darwin/arm64 | zsh 5.9"
  shell: string; // active shell name, e.g. "zsh"
};

export interface AIProvider {
  readonly name: string;
  // Returns a single shell command line. Must honor the abort signal.
  generateCommand(req: NLRequest, signal: AbortSignal): Promise<string>;
}

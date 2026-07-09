// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { AIProvider, NLRequest } from "./provider.js";
import { buildMessages } from "./prompt.js";

// One adapter for every OpenAI-compatible /chat/completions endpoint:
// ollama (local, no key), GLM, Kimi, Alibaba, mlx. Only baseUrl/model/apiKey differ.
export type OpenAICompatibleOptions = {
  baseUrl: string; // e.g. "http://localhost:11434/v1"
  model: string;
  apiKey?: string; // omitted for local providers
};

type ChatResponse = {
  choices?: { message?: { content?: string } }[];
};

export class OpenAICompatibleProvider implements AIProvider {
  readonly name: string;
  readonly #baseUrl: string;
  readonly #model: string;
  readonly #apiKey?: string;

  constructor(name: string, opts: OpenAICompatibleOptions) {
    this.name = name;
    this.#baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.#model = opts.model;
    this.#apiKey = opts.apiKey;
  }

  async generateCommand(req: NLRequest, signal: AbortSignal): Promise<string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.#apiKey) {
      headers["Authorization"] = `Bearer ${this.#apiKey}`;
    }
    const res = await fetch(`${this.#baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      // temperature 0 for deterministic commands; messages carry the few-shot prompt.
      body: JSON.stringify({ model: this.#model, messages: buildMessages(req), stream: false, temperature: 0 }),
      signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`${this.name} request failed (${res.status}): ${errText.slice(0, 200) || "unknown"}`);
    }

    const data = (await res.json()) as ChatResponse;
    const content = data?.choices?.at(0)?.message?.content;
    if (!content) {
      throw new Error(`${this.name} returned an empty response`);
    }
    return parseCommand(content);
  }
}

// Few-shot prompts ask for the bare command, but models may still wrap it in a code
// fence or add a trailing line. Strip fences and take the first non-empty line.
const parseCommand = (text: string): string => {
  let s = text.trim();
  s = s
    .replace(/^```[a-zA-Z]*\n?/, "")
    .replace(/\n?```$/, "")
    .trim();
  const firstLine = s
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!firstLine) {
    throw new Error("could not parse a command from the model response");
  }
  return firstLine;
};

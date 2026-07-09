// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { AIProvider, NLRequest } from "./provider.js";
import { buildPrompt } from "./prompt.js";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export type GeminiOptions = {
  model: string;
  apiKey: string;
  maxOutputTokens?: number;
};

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
};

// Gemini's native generateContent API is not OpenAI-compatible; it uses its own
// generationConfig with responseJsonSchema to force {"cmd": "..."} output.
// Ported from autocorrect.zsh:41-71.
export class GeminiProvider implements AIProvider {
  readonly name = "gemini";
  readonly #model: string;
  readonly #apiKey: string;
  readonly #maxOutputTokens: number;

  constructor(opts: GeminiOptions) {
    this.#model = opts.model;
    this.#apiKey = opts.apiKey;
    this.#maxOutputTokens = opts.maxOutputTokens ?? 100;
  }

  async generateCommand(req: NLRequest, signal: AbortSignal): Promise<string> {
    const url = `${ENDPOINT}/${this.#model}:generateContent?key=${this.#apiKey}`;
    const body = {
      contents: [{ parts: [{ text: buildPrompt(req) }] }],
      generationConfig: {
        maxOutputTokens: this.#maxOutputTokens,
        // Gemini 2.5 uses thinkingBudget (token count, 0 disables thinking).
        // NL->command is a short task, so thinking is off for speed/cost.
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: "application/json",
        responseJsonSchema: {
          type: "object",
          properties: { cmd: { type: "string" } },
          required: ["cmd"],
        },
      },
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`gemini request failed (${res.status}): ${extractError(errText)}`);
    }

    const data = (await res.json()) as GeminiResponse;
    const text = data?.candidates?.at(0)?.content?.parts?.at(-1)?.text;
    if (!text) {
      throw new Error("gemini returned an empty response");
    }
    return parseCommand(text);
  }
}

// The response text should be JSON {"cmd": "..."}, but local/older models may wrap
// it in code fences or add prose. Strip fences, try a direct parse, then fall back
// to extracting the first {...} block.
const parseCommand = (text: string): string => {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  let parsed: { cmd?: string };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error(`could not parse gemini response as JSON: ${text}`);
    }
    parsed = JSON.parse(match[0]);
  }
  const cmd = parsed.cmd?.trim();
  if (!cmd) {
    throw new Error(`gemini response missing 'cmd' field: ${text}`);
  }
  return cmd;
};

const extractError = (raw: string): string => {
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string; status?: string } };
    return parsed?.error?.message ?? parsed?.error?.status ?? "unknown";
  } catch {
    return raw.slice(0, 200) || "unknown";
  }
};

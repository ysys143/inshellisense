// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { AIProvider, NLRequest } from "./provider.js";

// Deterministic provider for e2e tests, selected via ISTERM_AI_PROVIDER=stub.
// Returns ISTERM_AI_STUB verbatim (or echoes the input); throws when
// ISTERM_AI_STUB_ERROR is set, to exercise the error UI. No network.
export class StubProvider implements AIProvider {
  readonly name = "stub";

  async generateCommand(req: NLRequest): Promise<string> {
    if (process.env.ISTERM_AI_STUB_ERROR != null) {
      throw new Error("stub AI error");
    }
    return process.env.ISTERM_AI_STUB ?? `echo ${req.input}`;
  }
}

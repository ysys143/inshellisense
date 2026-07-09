// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { test, expect } from "@microsoft/tui-test";

// Uses the `is` binary on PATH. The e2e runner symlinks the local build to `is`
// so this exercises the current tree. StubProvider (selected via ISTERM_AI_PROVIDER)
// makes the AI result deterministic and network-free.
test.describe("[ai] success", () => {
  test.use({
    program: { file: "is", args: ["-V", "-T", "-s", "bash"] },
    env: { ...process.env, ISTERM_AI_PROVIDER: "stub", ISTERM_AI_STUB: "du -sh *" },
  });

  test("ctrl+g translates natural language into a command suggestion", async ({ terminal }) => {
    await expect(terminal.getByText(">  ")).toBeVisible();
    // ASCII input: full-width CJK renders with per-cell gaps in the test terminal,
    // so getByText can't match a contiguous Korean string. Korean input is verified
    // manually via tmux; here we assert the trigger + result path with ASCII.
    terminal.write("list files by size");
    await expect(terminal.getByText("list files by size", { strict: false })).toBeVisible(); // wait for the line to register

    terminal.keyPress("g", { ctrl: true }); // Ctrl+G
    await expect(terminal.getByText("du -sh *", { strict: false })).toBeVisible();
  });
});

test.describe("[ai] error", () => {
  test.use({
    program: { file: "is", args: ["-V", "-T", "-s", "bash"] },
    env: { ...process.env, ISTERM_AI_PROVIDER: "stub", ISTERM_AI_STUB_ERROR: "1" },
  });

  test("ctrl+g shows an error in the suggestion box on failure", async ({ terminal }) => {
    await expect(terminal.getByText(">  ")).toBeVisible();
    terminal.write("bad input");
    await expect(terminal.getByText("bad input", { strict: false })).toBeVisible(); // wait for the line to register

    terminal.keyPress("g", { ctrl: true }); // Ctrl+G
    await expect(terminal.getByText("[AI] error", { strict: false })).toBeVisible();
  });
});

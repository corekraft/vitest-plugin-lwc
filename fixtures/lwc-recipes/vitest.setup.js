import { vi } from "vitest";
import { defaultRuleset } from "@sa11y/preset-rules";
import { fakeTimerErrMsg, formatOptions, runA11yCheck } from "@sa11y/matcher";

globalThis.jest = vi;

expect.extend({
  async toBeAccessible(received = document, config = defaultRuleset) {
    if (vi.isFakeTimers()) {
      throw new Error(fakeTimerErrMsg);
    }

    const { isAccessible, a11yError, receivedMsg } = await runA11yCheck(received, config);

    return {
      pass: isAccessible,
      message: () =>
        `Expected: no accessibility violations\nReceived: ${receivedMsg}\n\n${a11yError.format({
          ...formatOptions,
          highlighter: (text) => text
        })}`
    };
  }
});

await import("jest-canvas-mock");

import { describe, it, expect, vi, afterEach } from "vitest";
import { info, warn, error, success, step, dryRun, title } from "../../src/utils/logger.js";

describe("info", () => {
  it("does not throw when called with a message", () => {
    expect(() => info("test info message")).not.toThrow();
  });

  it("writes to stdout (console.log)", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      info("informational message");
      expect(spy).toHaveBeenCalled();
      const output = spy.mock.calls[0]?.[0];
      expect(output).toContain("informational message");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("warn", () => {
  it("does not throw when called with a message", () => {
    expect(() => warn("test warning")).not.toThrow();
  });

  it("includes the warning prefix", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      warn("something happened");
      expect(spy).toHaveBeenCalled();
      const output = spy.mock.calls[0]?.[0];
      expect(output).toContain("⚠");
      expect(output).toContain("something happened");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("error", () => {
  it("does not throw when called with a message", () => {
    expect(() => error("test error")).not.toThrow();
  });

  it("writes to stderr (console.error) and includes cross prefix", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      error("failure occurred");
      expect(spy).toHaveBeenCalled();
      const output = spy.mock.calls[0]?.[0];
      expect(output).toContain("✗");
      expect(output).toContain("failure occurred");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("success", () => {
  it("does not throw when called with a message", () => {
    expect(() => success("done")).not.toThrow();
  });

  it("includes the checkmark prefix", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      success("operation complete");
      expect(spy).toHaveBeenCalled();
      const output = spy.mock.calls[0]?.[0];
      expect(output).toContain("✓");
      expect(output).toContain("operation complete");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("step", () => {
  it("does not throw when called with a message", () => {
    expect(() => step("step 1")).not.toThrow();
  });

  it("writes to stdout", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      step("initializing...");
      expect(spy).toHaveBeenCalled();
      const output = spy.mock.calls[0]?.[0];
      expect(output).toContain("initializing...");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("dryRun", () => {
  it("does not throw when called with a message", () => {
    expect(() => dryRun("would delete file")).not.toThrow();
  });

  it("includes the [DRY RUN] prefix", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      dryRun("creating file");
      expect(spy).toHaveBeenCalled();
      const output = spy.mock.calls[0]?.[0];
      expect(output).toContain("[DRY RUN]");
      expect(output).toContain("creating file");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("title", () => {
  it("does not throw when called with a message", () => {
    expect(() => title("Setup")).not.toThrow();
  });

  it("writes to stdout", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      title("My Title");
      expect(spy).toHaveBeenCalled();
      const output = spy.mock.calls[0]?.[0];
      expect(output).toContain("My Title");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("output stream routing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("info, warn, success, step, dryRun, title use console.log (stdout)", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      info("a");
      warn("b");
      success("c");
      step("d");
      dryRun("e");
      title("f");

      expect(logSpy).toHaveBeenCalledTimes(6);
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it("error uses console.error (stderr)", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      error("critical failure");

      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});

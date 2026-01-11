import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.OPENROUTER_API_KEY = "test-key";

import { generateSummary } from "../openrouter";

describe("generateSummary", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns parsed content from valid response", async () => {
    const mockResponse = {
      choices: [{
        message: {
          content: "SUMMARY: Added login feature\nFILES: 2 (auth.ts, login.tsx)\nIMPACT: Medium - Adds authentication"
        }
      }]
    };

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: () => Promise.resolve(mockResponse)
    }));

    const result = await generateSummary("diff content", false);
    expect(result).toContain("SUMMARY:");
    expect(result).toContain("FILES:");
    expect(result).toContain("IMPACT:");
  });

  it("includes truncation note in prompt when truncated", async () => {
    let capturedBody = "";
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url, options) => {
      capturedBody = options.body;
      return Promise.resolve({
        json: () => Promise.resolve({ choices: [{ message: { content: "test" } }] })
      });
    }));

    await generateSummary("diff", true);
    expect(capturedBody).toContain("NOTE: This is a large PR");
  });

  it("returns fallback on empty response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ choices: [] })
    }));

    const result = await generateSummary("diff", false);
    expect(result).toBe("Unable to generate summary");
  });

  it("returns fallback on missing content", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ choices: [{ message: {} }] })
    }));

    const result = await generateSummary("diff", false);
    expect(result).toBe("Unable to generate summary");
  });
});

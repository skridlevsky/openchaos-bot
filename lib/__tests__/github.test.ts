import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

// Set env before importing module
process.env.GITHUB_WEBHOOK_SECRET = "test-secret";

import { verifyWebhookSignature } from "../github";

describe("verifyWebhookSignature", () => {
  const secret = "test-secret";

  function createSignature(payload: string): string {
    return "sha256=" + crypto.createHmac("sha256", secret).update(payload).digest("hex");
  }

  it("returns true for valid signature", async () => {
    const payload = '{"action":"opened"}';
    const signature = createSignature(payload);
    expect(await verifyWebhookSignature(payload, signature)).toBe(true);
  });

  it("returns false for invalid signature", async () => {
    const payload = '{"action":"opened"}';
    const signature = "sha256=invalid";
    expect(await verifyWebhookSignature(payload, signature)).toBe(false);
  });

  it("returns false for tampered payload", async () => {
    const payload = '{"action":"opened"}';
    const signature = createSignature(payload);
    const tamperedPayload = '{"action":"closed"}';
    expect(await verifyWebhookSignature(tamperedPayload, signature)).toBe(false);
  });

  it("handles empty payload", async () => {
    const payload = "";
    const signature = createSignature(payload);
    expect(await verifyWebhookSignature(payload, signature)).toBe(true);
  });
});

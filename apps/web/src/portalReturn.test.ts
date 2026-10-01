import { describe, expect, it } from "vitest";
import { portalReturnHref } from "./portalReturn";

describe("portal return", () => {
  it("accepts an http(s) gateway and strips a trailing slash", () => {
    expect(portalReturnHref("https://gunnchos.com/")).toBe("https://gunnchos.com");
    expect(portalReturnHref(undefined)).toBeNull();
    expect(portalReturnHref("javascript:alert(1)")).toBeNull();
  });
});

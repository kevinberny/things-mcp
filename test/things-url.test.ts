import { describe, it, expect } from "vitest";
import { thingsQuery } from "../src/things-url.js";

describe("thingsQuery", () => {
  it("encodes spaces as %20, not as +", () => {
    const params = new URLSearchParams();
    params.set("title", "Buy oat milk");
    params.set("notes", "Line one\nLine two");
    const query = thingsQuery(params);
    expect(query).toBe("title=Buy%20oat%20milk&notes=Line%20one%0ALine%20two");
    expect(query).not.toContain("+");
  });

  it("keeps a literal plus sign as %2B", () => {
    const params = new URLSearchParams();
    params.set("title", "Learn C++");
    expect(thingsQuery(params)).toBe("title=Learn%20C%2B%2B");
  });

  it("decodes back to the original text", () => {
    const params = new URLSearchParams();
    const title = "Invoice: 1+2 items · Monday & more";
    params.set("title", title);
    const value = thingsQuery(params).slice("title=".length);
    expect(decodeURIComponent(value)).toBe(title);
  });
});

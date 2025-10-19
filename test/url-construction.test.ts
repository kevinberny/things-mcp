import { describe, it, expect } from "vitest";

describe("URL Construction", () => {
  describe("URLSearchParams encoding", () => {
    it("should properly encode special characters", () => {
      const params = new URLSearchParams();
      params.set("title", 'Test "with" quotes');
      params.set("notes", "Line 1\nLine 2");

      const url = `things:///add?${params.toString()}`;

      expect(url).toContain("title=Test+%22with%22+quotes");
      expect(url).toContain("notes=Line+1%0ALine+2");
    });

    it("should handle array values with join", () => {
      const params = new URLSearchParams();
      const tags = ["work", "urgent", "follow-up"];
      params.set("tags", tags.join(","));

      expect(params.toString()).toBe("tags=work%2Curgent%2Cfollow-up");
    });

    it("should handle newline-separated values", () => {
      const params = new URLSearchParams();
      const todos = ["Buy milk", "Call dentist", "Review PR"];
      params.set("to-dos", todos.join("\n"));

      const result = params.toString();
      expect(result).toContain("to-dos=Buy+milk%0ACall+dentist%0AReview+PR");
    });

    it("should handle boolean values", () => {
      const params = new URLSearchParams();
      params.set("completed", "true");
      params.set("reveal", "false");

      expect(params.toString()).toBe("completed=true&reveal=false");
    });

    it("should handle empty and undefined values correctly", () => {
      const params = new URLSearchParams();
      const title = "Test";
      const notes = undefined;
      const when = "";

      params.set("title", title);
      if (notes !== undefined) params.set("notes", notes);
      if (when) params.set("when", when);

      expect(params.toString()).toBe("title=Test");
    });
  });

  describe("Things URL scheme format", () => {
    it("should construct valid add-todo URL", () => {
      const params = new URLSearchParams();
      params.set("title", "Test Todo");
      params.set("when", "today");

      const url = `things:///add?${params.toString()}`;

      expect(url).toMatch(/^things:\/\/\/add\?/);
      expect(url).toContain("title=Test+Todo");
      expect(url).toContain("when=today");
    });

    it("should construct valid add-project URL", () => {
      const params = new URLSearchParams();
      params.set("title", "Test Project");
      params.set("area", "Work");

      const url = `things:///add-project?${params.toString()}`;

      expect(url).toMatch(/^things:\/\/\/add-project\?/);
      expect(url).toContain("title=Test+Project");
      expect(url).toContain("area=Work");
    });

    it("should construct valid update URL with auth token", () => {
      const params = new URLSearchParams();
      params.set("id", "ABC123");
      params.set("auth-token", "test-token-123");
      params.set("title", "Updated Title");

      const url = `things:///update?${params.toString()}`;

      expect(url).toMatch(/^things:\/\/\/update\?/);
      expect(url).toContain("id=ABC123");
      expect(url).toContain("auth-token=test-token-123");
    });

    it("should construct valid JSON URL", () => {
      const data = JSON.stringify([
        {
          type: "to-do",
          attributes: { title: "Test" },
        },
      ]);
      const params = new URLSearchParams();
      params.set("data", data);

      const url = `things:///json?${params.toString()}`;

      expect(url).toMatch(/^things:\/\/\/json\?/);
      expect(url).toContain("data=");
    });
  });

  describe("Security - URL injection prevention", () => {
    it("should safely encode malicious input", () => {
      const params = new URLSearchParams();
      const maliciousInput = '"; rm -rf / #';
      params.set("title", maliciousInput);

      const encoded = params.toString();

      expect(encoded).not.toContain('"; rm -rf / #');
      expect(encoded).toContain("%22%3B+rm+-rf+%2F+%23");
    });

    it("should handle URL with semicolons", () => {
      const params = new URLSearchParams();
      params.set("notes", "Step 1; Step 2; Step 3");

      const encoded = params.toString();

      expect(encoded).toContain("%3B");
      expect(encoded).not.toContain(";");
    });

    it("should escape quotes properly", () => {
      const params = new URLSearchParams();
      params.set("title", 'Test "quoted" text');

      const url = `things:///add?${params.toString()}`;

      // URLSearchParams should encode quotes
      expect(url).not.toContain('"quoted"');
      expect(url).toContain("%22quoted%22");
    });
  });
});

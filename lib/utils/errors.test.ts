import { describe, expect, it } from "vitest";
import { cleanStored, userMessage } from "./errors";

describe("userMessage", () => {
  it("never leaks internal errors", () => {
    expect(userMessage(new TypeError("x is not a function"))).toMatch(/Something went wrong/);
    expect(userMessage(new Error("(0 , __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$ai.courseInfoUserPrompt) is not a function"))).toMatch(/Something went wrong/);
    expect(userMessage(new Error('relation "foo" does not exist'))).toMatch(/Something went wrong/);
    expect(userMessage(new Error("Cannot read properties of undefined (reading 'x')"))).toMatch(/Something went wrong/);
    expect(userMessage("not even an error")).toMatch(/Something went wrong/);
    expect(userMessage(new Error("x".repeat(400)))).toMatch(/Something went wrong/);
    expect(userMessage(new Error(""), "custom fallback")).toBe("custom fallback");
  });
  it("hides raw API error payloads", () => {
    expect(userMessage(new Error('{"error":{"code":400,"message":"Request contains an invalid argument.","status":"INVALID_ARGUMENT"}}'))).toMatch(/Something went wrong/);
    expect(cleanStored('{"error":{"code":500}}', "fb")).toBe("fb");
    expect(userMessage(new Error("ApiError: PERMISSION_DENIED"))).toMatch(/Something went wrong/);
  });
  it("keeps plain-language errors we raised on purpose", () => {
    expect(userMessage(new Error("That page needs a login, so CoursePilot can't read it."))).toBe("That page needs a login, so CoursePilot can't read it.");
    expect(userMessage(new Error("GEMINI_MODEL is not set. Set it in .env.local."))).toContain("GEMINI_MODEL");
  });
  it("turns rate limits into a friendly line", () => {
    expect(userMessage(new Error("429 RESOURCE_EXHAUSTED quota"))).toMatch(/busy right now/);
  });
  it("cleans messages already stored in the database", () => {
    expect(cleanStored("(0 , __TURBOPACK__imported__module__x.fn) is not a function", "fallback")).toBe("fallback");
    expect(cleanStored(null, "fallback")).toBe("fallback");
    expect(cleanStored("The site returned an error (500).")).toBe("The site returned an error (500).");
  });
});

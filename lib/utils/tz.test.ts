import { describe, expect, it } from "vitest";
import { zonedToUtcIso } from "./tz";

describe("zonedToUtcIso", () => {
  it("handles standard time", () => {
    expect(zonedToUtcIso("2026-12-10", "23:59", "America/Detroit")).toBe("2026-12-11T04:59:00.000Z");
  });
  it("handles daylight time", () => {
    expect(zonedToUtcIso("2026-09-15", "09:00", "America/Detroit")).toBe("2026-09-15T13:00:00.000Z");
  });
  it("defaults to end of day and tolerates bad zones", () => {
    expect(zonedToUtcIso("2026-01-05", null, "UTC")).toBe("2026-01-05T23:59:00.000Z");
    expect(zonedToUtcIso("2026-01-05", "10:00", "Not/AZone")).toBe("2026-01-05T10:00:00.000Z");
  });
});

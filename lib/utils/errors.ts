/**
 * Turn any thrown value into something safe to show a student. Errors we raise on purpose (config problems, rate
 * limits, "site needs a login") are plain language already and pass through. Internal failures (TypeErrors, bundler
 * names, stack-y text, database internals) never reach the screen: they become a calm generic message.
 */
/** Same cleaning for a message that was stored earlier (so old internal errors in the database never show). */
export function cleanStored(msg: string | null | undefined, fallback = "We couldn't finish this. Please try again."): string {
  return userMessage(new Error(msg ?? ""), fallback);
}

export function userMessage(e: unknown, fallback = "Something went wrong. Please try again in a moment."): string {
  if (!(e instanceof Error)) return fallback;
  const m = e.message ?? "";
  const internal = e.name === "TypeError" || e.name === "ReferenceError" || e.name === "SyntaxError" || e.name === "RangeError"
    || /TURBOPACK|__webpack|is not a function|is not defined|Cannot read propert|undefined is not|\bat \S+ \(|ECONN|ETIMEDOUT|ENOTFOUND|violates|syntax error at|relation "|column "|JSON\.parse|Unexpected token|\$[0-9a-f]{2}\$|^\s*[{[]|"error"\s*:|INVALID_ARGUMENT|PERMISSION_DENIED|UNAVAILABLE|ApiError|"code"\s*:\s*\d{3}/.test(m);
  if (internal || m.length > 300 || !m.trim()) return fallback;
  if (/rate limit|429|RESOURCE_EXHAUSTED/i.test(m)) return "The AI service is busy right now. Please try again in a minute.";
  return m;
}

import "server-only";
import { GoogleGenAI } from "@google/genai";
import type { z } from "zod";
import { toGeminiJsonSchema } from "./schemas";

export class GeminiConfigError extends Error {}
export class GeminiOutputError extends Error {}

/**
 * The model is chosen ONLY through GEMINI_MODEL. We never silently substitute another model.
 * Recommended (verified 2026-11-07 against Google's model list): gemini-3.5-flash-lite
 */
export function getGeminiModel(): string {
  const model = process.env.GEMINI_MODEL?.trim();
  if (!model) throw new GeminiConfigError("GEMINI_MODEL is not set. Set it in .env.local (e.g. gemini-3.5-flash-lite).");
  return model;
}

function client() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiConfigError("GEMINI_API_KEY is not set. Add it to .env.local.");
  return new GoogleGenAI({ apiKey: key });
}

export interface InlineFile { mimeType: string; data: Buffer }

function friendlyError(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  if (/404|not found|NOT_FOUND/i.test(msg)) return new GeminiConfigError(`The Gemini model "${process.env.GEMINI_MODEL}" was not found by the API. Check GEMINI_MODEL. (${msg.slice(0, 160)})`);
  if (/API key|PERMISSION_DENIED|UNAUTHENTICATED|401|403/i.test(msg)) return new GeminiConfigError("Gemini rejected the API key. Check GEMINI_API_KEY.");
  if (/429|RESOURCE_EXHAUSTED/i.test(msg)) return new Error("Gemini rate limit reached. Please wait a minute and try again.");
  return e instanceof Error ? e : new Error(msg);
}

/** Generate JSON validated against a Zod schema. Retries once if the output fails validation. */
export async function generateStructured<S extends z.ZodType>(opts: {
  schema: S; system: string; prompt: string; files?: InlineFile[]; temperature?: number;
}): Promise<{ data: z.infer<S>; model: string }> {
  const ai = client();
  const model = getGeminiModel();
  const jsonSchema = toGeminiJsonSchema(opts.schema);
  const parts: Record<string, unknown>[] = [{ text: opts.prompt }];
  for (const f of opts.files ?? []) parts.push({ inlineData: { mimeType: f.mimeType, data: f.data.toString("base64") } });

  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    let text: string | undefined;
    try {
      const res = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: attempt === 0 ? parts : [...parts, { text: `Your previous output was invalid (${lastError}). Return valid JSON matching the schema.` }] }] as never,
        config: {
          systemInstruction: opts.system,
          responseMimeType: "application/json",
          responseJsonSchema: jsonSchema,
          temperature: opts.temperature ?? 0.1,
        },
      });
      text = res.text;
    } catch (e) {
      throw friendlyError(e);
    }
    if (!text) { lastError = "empty response"; continue; }
    try {
      const parsed = opts.schema.safeParse(JSON.parse(text));
      if (parsed.success) return { data: parsed.data, model };
      lastError = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    } catch {
      lastError = "not valid JSON";
    }
  }
  throw new GeminiOutputError(`Gemini returned output that could not be validated (${lastError}). Try again, or enter the details manually.`);
}

import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function extractJson(raw) {
  if (!raw || typeof raw !== "string") return "";

  let s = raw.trim();

  // Remove ```json ... ``` or ``` ... ``` fences
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  // If model added extra text, slice from first { to last }
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    s = s.slice(first, last + 1);
  }

  return s.trim();
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  try {
    const { text, tone = "short" } = req.body || {};
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Missing text" });
    }

    const trimmed = text.trim();
    if (trimmed.length < 30) return res.status(400).json({ error: "Text too short" });
    if (trimmed.length > 12000) return res.status(400).json({ error: "Text too long" });

    // Keep output predictable + reduce "helpful extra text"
    const schemaHint =
      "Return ONLY valid JSON with keys: " +
      "likelihood, summary, red_flags, what_to_do, safe_next_steps. " +
      "All values must be strings (bullets allowed as \\n- ...). " +
      "Use likelihood exactly as one of: Low, Medium, High.";

    const system =
      "You help users assess whether a message might be a scam. " +
      "You do not make definitive claims. You assess risk based on common scam patterns. " +
      "Be calm, factual, and non-alarmist. Do not add any text outside the JSON.";

    const user = `
${schemaHint}

Tone: ${tone} (short = concise, detailed = more detail)

Rules:
- Do NOT invent facts.
- If information is missing, say so.
- This is a risk assessment, not a guarantee.
- If the content appears benign, you may still mention basic safety steps.

TEXT:
"""${trimmed}"""
`;

    const resp = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      temperature: 0.2
    });

    const raw = resp.choices?.[0]?.message?.content?.trim() || "";

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      const cleaned = extractJson(raw);
      try {
        data = JSON.parse(cleaned);
      } catch {
        return res.status(500).json({
          error: "Model did not return valid JSON",
          raw,
          cleaned
        });
      }
    }

    return res.status(200).json({ ok: true, data });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
}

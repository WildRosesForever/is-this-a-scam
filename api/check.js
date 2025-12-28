import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  try {
    const { text } = req.body || {};
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Missing text" });
    }

    const trimmed = text.trim();
    if (trimmed.length < 30) {
      return res.status(400).json({ error: "Text too short" });
    }

    const system =
      "You help users assess whether a message might be a scam. " +
      "You do NOT make definitive claims. You assess risk based on common scam patterns. " +
      "Be calm, factual, and non-alarmist.";

    const user = `
Return ONLY valid JSON with these keys:
- likelihood (Low / Medium / High)
- summary (1–2 sentences)
- red_flags (bullet list as text, or 'None detected')
- what_to_do (bullet list)
- safe_next_steps (bullet list)

Rules:
- Do NOT invent facts.
- If information is missing, say so.
- This is a risk assessment, not a guarantee.

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
      return res.status(500).json({ error: "Invalid JSON from model", raw });
    }

    return res.status(200).json({ ok: true, data });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
}

import { AI_API_KEY_STORAGE_KEY } from "./app.js";

const RECURRING_DETECTION_PROMPT = `You are analyzing a user's personal transaction history to find recurring
monthly charges that may use different labels for the same underlying
service (e.g. "Netflix", "NETFLIX.COM", "Netflix Subscription" are the
same charge).

You will be given a JSON array of transactions, each with id, label,
category, amount, and date. Group transactions that you believe represent
the same recurring monthly charge, even if their labels differ, as long as
the amounts are close and the dates are roughly a month apart.

Respond with ONLY valid JSON, no other text, no markdown code fences, in
exactly this shape:
{
  "suggestions": [
    {
      "normalizedLabel": "a clean human-readable name for this charge",
      "matchedTransactionIds": ["id1", "id2", ...],
      "confidence": 0.0 to 1.0
    }
  ]
}

Only include a group if you have at least 2 matching transactions. If no
transactions appear to be recurring, return {"suggestions": []}.`;

const MIN_SUGGESTION_CONFIDENCE = 0.7;

/**
 * Sends leftover (non-rule-matched) transactions to the Groq API to
 * detect recurring charges the strict rule-based algorithm couldn't
 * group due to label differences. Returns { suggestions: [] } if no
 * API key is set, the request fails, or the response can't be parsed
 * — this function's contract is that it always resolves successfully
 * with this shape, never throws, and never leaves the caller needing
 * to handle failure separately.
 *
 * @param {Array<{id: string, label: string, category: string,
 *   amount: number, date: string}>} leftoverTransactions
 * @returns {Promise<{suggestions: Array<{normalizedLabel: string,
 *   matchedTransactionIds: string[], confidence: number}>}>}
 */
async function detectRecurringWithAI(leftoverTransactions) {
  const apiKey = localStorage.getItem(AI_API_KEY_STORAGE_KEY);
  if (!apiKey) return { suggestions: [] };

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        messages: [
          { role: "system", content: RECURRING_DETECTION_PROMPT },
          { role: "user", content: JSON.stringify(leftoverTransactions) },
        ],
      }),
    });

    if (!response.ok) {
      console.error("Groq API request failed:", response.status, await response.text());
      return { suggestions: [] };
    }

    const data = await response.json();
    const rawText = data.choices[0].message.content;
    const cleanText = rawText.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleanText);

    const validSuggestions = (parsed.suggestions || []).filter(
      (s) => s.matchedTransactionIds?.length >= 2 && s.confidence >= MIN_SUGGESTION_CONFIDENCE
    );

    return { suggestions: validSuggestions };
  } catch (err) {
    console.error("AI recurring-detection failed:", err);
    return { suggestions: [] };
  }
}

export { detectRecurringWithAI };

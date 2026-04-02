const DEFAULT_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 7000);
const DEFAULT_RETRIES = Number(process.env.AI_RETRIES || 1);

function isAiEnabled() {
  return process.env.AI_ENABLED === '1';
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function callOpenAi(prompt, model) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is missing');

  const response = await fetchWithTimeout(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        max_tokens: 120,
        messages: [{ role: 'user', content: prompt }],
      }),
    },
    DEFAULT_TIMEOUT_MS
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`AI request failed: ${response.status} ${body}`);
  }

  const json = await response.json();
  const text = json?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('AI response is empty');
  return text;
}

async function generateAiText({ prompt, fallbackText, model = process.env.OPENAI_MODEL || 'gpt-4o-mini' }) {
  if (!isAiEnabled()) return { text: fallbackText, source: 'fallback_disabled' };

  for (let attempt = 0; attempt <= DEFAULT_RETRIES; attempt += 1) {
    try {
      const text = await callOpenAi(prompt, model);
      return { text, source: 'ai' };
    } catch (error) {
      if (attempt === DEFAULT_RETRIES) {
        console.error('[AI] Fallback:', error.message);
        return { text: fallbackText, source: 'fallback_error' };
      }
    }
  }

  return { text: fallbackText, source: 'fallback_unknown' };
}

module.exports = { isAiEnabled, generateAiText };

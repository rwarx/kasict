// Cloudflare Worker: прокси для OpenRouter (бесплатные модели).
// Хранит API ключ в переменных окружения.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS })
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS })
    }

    try {
      const { messages } = await request.json()

      if (!messages || !Array.isArray(messages)) {
        return new Response('Invalid request: messages array required', {
          status: 400,
          headers: CORS_HEADERS,
        })
      }

      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://kasict.github.io',
          'X-Title': 'KASICT Schedule',
        },
        body: JSON.stringify({
          model: 'minimax/minimax-m3:free',
          messages,
          max_tokens: 1024,
          stream: true,
        }),
      })

      if (!resp.ok) {
        const err = await resp.text()
        return new Response(err, { status: resp.status, headers: CORS_HEADERS })
      }

      return new Response(resp.body, {
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
      })
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }
  },
}

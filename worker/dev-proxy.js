// Локальный прокси-сервер для тестирования чата.
// Запуск: node worker/dev-proxy.js
// Порт: 8787

const http = require('node:http')

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || 'YOUR_KEY_HERE'
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(`<h1>Chat Proxy ✓</h1><p>OpenRouter · <code>POST /api/chat</code></p>`)
    return
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS)
    res.end()
    return
  }

  if (req.method === 'POST' && req.url === '/api/chat') {
    let body = ''
    for await (const chunk of req) body += chunk

    try {
      const { messages } = JSON.parse(body)

      const orResp = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
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

      if (!orResp.ok) {
        const err = await orResp.text()
        console.error('OpenRouter error:', err)
        res.writeHead(orResp.status, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
        res.end(err)
        return
      }

      res.writeHead(200, {
        ...CORS_HEADERS,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      })

      const reader = orResp.body.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        res.write(value)
      }
      res.end()
    } catch (e) {
      console.error('Proxy error:', e)
      res.writeHead(500, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e.message }))
    }
    return
  }

  res.writeHead(404)
  res.end('Not found')
})

server.listen(8787, () => {
  console.log('🚀 Chat proxy → OpenRouter (gemini-2.0-flash-exp:free)')
  console.log('   http://localhost:8787/api/chat')
})

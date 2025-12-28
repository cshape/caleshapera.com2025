/**
 * Cloudflare Worker - Chat API with OpenAI GPT-4.1
 * 
 * Local: npm run dev (uses .dev.vars for OPENAI_API_KEY)
 * Production: wrangler secret put OPENAI_API_KEY
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const SYSTEM_PROMPT = `You are Cale's AI assistant on caleshapera.com. You're helpful, friendly, and concise.

About Cale:
- Software engineer and builder
- Interested in AI, web development, and creative technology
- This website showcases his work and projects

Formatting:
- Use markdown for formatting your responses
- Use **bold** for emphasis and key terms
- Use *italics* for subtle emphasis
- Format links as [text](url) - always include full URLs
- Use \`inline code\` for technical terms, commands, or code snippets
- Use code blocks with language specification for multi-line code
- Use bullet points and numbered lists when appropriate
- Keep responses brief and conversational

If asked about something you don't know about Cale specifically, be honest and helpful anyway.`;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // Route handling
    if (url.pathname === '/chat' || url.pathname === '/') {
      if (request.method === 'POST') {
        return handleChat(request, env);
      }
      return new Response('Chat API is running. Send POST requests to interact.', {
        headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain' },
      });
    }

    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ 
        status: 'ok', 
        timestamp: Date.now(),
        hasApiKey: !!env.OPENAI_API_KEY 
      }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // 404 for unknown routes
    return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
  },
};

/**
 * Handle chat requests using OpenAI GPT-4.1
 */
async function handleChat(request, env) {
  try {
    const body = await request.json();
    const { messages } = body;

    if (!messages || !Array.isArray(messages)) {
      return jsonResponse({ error: 'Invalid request: messages array required' }, 400);
    }

    // Check for API key
    if (!env.OPENAI_API_KEY) {
      return jsonResponse({ 
        error: 'OpenAI API key not configured',
        response: 'The AI is not configured yet. Please set up the OPENAI_API_KEY secret.'
      }, 500);
    }

    // Prepare messages with system prompt
    const openaiMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    ];

    // Call OpenAI API
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-nano',
        messages: openaiMessages,
        max_tokens: 1024,
        temperature: 0.7,
      }),
    });

    if (!openaiResponse.ok) {
      const errorData = await openaiResponse.json().catch(() => ({}));
      console.error('OpenAI API error:', openaiResponse.status, errorData);
      
      // Handle specific error cases
      if (openaiResponse.status === 401) {
        return jsonResponse({ error: 'Invalid API key' }, 500);
      }
      if (openaiResponse.status === 429) {
        return jsonResponse({ 
          error: 'Rate limited',
          response: 'Too many requests. Please try again in a moment.'
        }, 429);
      }
      
      return jsonResponse({ 
        error: 'OpenAI API error',
        response: 'Something went wrong with the AI. Please try again.'
      }, 500);
    }

    const data = await openaiResponse.json();
    const assistantMessage = data.choices?.[0]?.message?.content;

    if (!assistantMessage) {
      return jsonResponse({ error: 'No response from AI' }, 500);
    }

    return jsonResponse({ response: assistantMessage });

  } catch (error) {
    console.error('Chat error:', error);
    return jsonResponse({ 
      error: 'Failed to process chat request',
      response: 'Something went wrong. Please try again.'
    }, 500);
  }
}

/**
 * Helper to create JSON responses with CORS headers
 */
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    },
  });
}

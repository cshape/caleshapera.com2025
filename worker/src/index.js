/**
 * Cloudflare Worker - Chat API with Inworld LLM Service
 * 
 * Local: npm run dev (uses .dev.vars for INWORLD_API_KEY)
 * Production: wrangler secret put INWORLD_API_KEY
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Available models organized by provider
const AVAILABLE_MODELS = {
  anthropic: {
    provider: 'SERVICE_PROVIDER_ANTHROPIC',
    models: [
      { id: 'claude-opus-4-1', name: 'Claude Opus 4.1' },
      { id: 'claude-sonnet-4-0', name: 'Claude Sonnet 4.0' },
      { id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku' },
    ],
  },
  openai: {
    provider: 'SERVICE_PROVIDER_OPENAI',
    models: [
      { id: 'gpt-4.1', name: 'GPT-4.1' },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini' },
      { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano' },
    ],
  },
  google: {
    provider: 'SERVICE_PROVIDER_GOOGLE',
    models: [
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite' },
    ],
  },
  fireworks: {
    provider: 'SERVICE_PROVIDER_FIREWORKS',
    models: [
      { id: 'accounts/fireworks/models/deepseek-v3-0324', name: 'DeepSeek V3' },
      { id: 'accounts/fireworks/models/llama4-maverick-instruct-basic', name: 'Llama 4 Maverick' },
    ],
  },
  groq: {
    provider: 'SERVICE_PROVIDER_GROQ',
    models: [
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant' },
      { id: 'gemma2-9b-it', name: 'Gemma 2 9B' },
    ],
  },
  mistral: {
    provider: 'SERVICE_PROVIDER_MISTRAL',
    models: [
      { id: 'mistral-small-latest', name: 'Mistral Small' },
      { id: 'ministral-8b-latest', name: 'Ministral 8B' },
    ],
  },
};

// Default model
const DEFAULT_MODEL = { 
  provider: 'SERVICE_PROVIDER_OPENAI', 
  model: 'gpt-4.1-nano' 
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

// Map simple role names to Inworld's enum values
const ROLE_MAP = {
  'system': 'MESSAGE_ROLE_SYSTEM',
  'user': 'MESSAGE_ROLE_USER',
  'assistant': 'MESSAGE_ROLE_ASSISTANT',
};

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

    // Models endpoint - returns available models for frontend dropdown
    if (url.pathname === '/models') {
      const models = [];
      for (const [providerKey, providerData] of Object.entries(AVAILABLE_MODELS)) {
        for (const model of providerData.models) {
          models.push({
            id: `${providerKey}:${model.id}`,
            name: model.name,
            provider: providerKey,
          });
        }
      }
      return jsonResponse({ models, default: `openai:${DEFAULT_MODEL.model}` });
    }

    // Health check endpoint
    if (url.pathname === '/health') {
      return jsonResponse({ 
        status: 'ok', 
        timestamp: Date.now(),
        hasApiKey: !!env.INWORLD_API_KEY 
      });
    }

    // 404 for unknown routes
    return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
  },
};

/**
 * Parse model string (e.g., "openai:gpt-4.1") into provider and model
 */
function parseModelString(modelString) {
  if (!modelString) return DEFAULT_MODEL;
  
  const [providerKey, ...modelParts] = modelString.split(':');
  const modelId = modelParts.join(':'); // Rejoin in case model ID contains colons
  
  const providerData = AVAILABLE_MODELS[providerKey];
  if (!providerData) return DEFAULT_MODEL;
  
  const modelExists = providerData.models.some(m => m.id === modelId);
  if (!modelExists) return DEFAULT_MODEL;
  
  return {
    provider: providerData.provider,
    model: modelId,
  };
}

/**
 * Handle chat requests using Inworld LLM API
 */
async function handleChat(request, env) {
  try {
    const body = await request.json();
    const { messages, model: modelString } = body;

    if (!messages || !Array.isArray(messages)) {
      return jsonResponse({ error: 'Invalid request: messages array required' }, 400);
    }

    // Check for API key
    if (!env.INWORLD_API_KEY) {
      return jsonResponse({ 
        error: 'Inworld API key not configured',
        response: 'The AI is not configured yet. Please set up the INWORLD_API_KEY secret.'
      }, 500);
    }

    // Parse model selection
    const { provider, model } = parseModelString(modelString);

    // Generate a simple user ID (in production, you might want something more persistent)
    const userId = 'web-user-' + Math.random().toString(36).substring(7);

    // Prepare messages with system prompt for Inworld format
    const inworldMessages = [
      { 
        role: ROLE_MAP['system'], 
        content: SYSTEM_PROMPT 
      },
      ...messages.map(m => ({
        role: ROLE_MAP[m.role] || 'MESSAGE_ROLE_USER',
        content: m.content,
      })),
    ];

    // Build request body for Inworld API
    const requestBody = {
      servingId: {
        modelId: {
          model: model,
          serviceProvider: provider,
        },
        userId: userId,
      },
      messages: inworldMessages,
      textGenerationConfig: {
        maxTokens: 1024,
        temperature: 0.7,
      },
    };

    // Call Inworld API
    const inworldResponse = await fetch('https://api.inworld.ai/llm/v1alpha/completions:completeChat', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${env.INWORLD_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!inworldResponse.ok) {
      const errorData = await inworldResponse.json().catch(() => ({}));
      console.error('Inworld API error:', inworldResponse.status, errorData);
      
      // Handle specific error cases
      if (inworldResponse.status === 401) {
        return jsonResponse({ error: 'Invalid API key' }, 500);
      }
      if (inworldResponse.status === 429) {
        return jsonResponse({ 
          error: 'Rate limited',
          response: 'Too many requests. Please try again in a moment.'
        }, 429);
      }
      
      return jsonResponse({ 
        error: 'Inworld API error',
        details: errorData.message || errorData,
        response: 'Something went wrong with the AI. Please try again.'
      }, 500);
    }

    const data = await inworldResponse.json();
    
    // Extract message from Inworld response format
    const assistantMessage = data.result?.choices?.[0]?.message?.content 
      || data.choices?.[0]?.message?.content;

    if (!assistantMessage) {
      console.error('Unexpected response format:', data);
      return jsonResponse({ error: 'No response from AI', debug: data }, 500);
    }

    return jsonResponse({ 
      response: assistantMessage,
      model: `${model}`,
    });

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

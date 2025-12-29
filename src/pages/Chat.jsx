import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Button, Spinner, Select, SelectItem } from '@heroui/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Use local worker in development, production worker in production
const isDev = import.meta.env.DEV
const WORKER_URL = isDev 
  ? 'http://localhost:8787'
  : 'https://empty-sky-58f0.caleshapera.workers.dev'

const MAX_INPUT_LENGTH = 200
const MAX_TURNS = 20 // Each turn = 1 user + 1 assistant message

function Chat() {
  const [mounted, setMounted] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [models, setModels] = useState([])
  const [selectedModel, setSelectedModel] = useState('')
  const [modelsLoading, setModelsLoading] = useState(true)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    setMounted(true)
    document.title = 'Chat — Cale Shapera'
    // Focus input on mount
    inputRef.current?.focus()
    
    // Fetch available models
    fetchModels()
  }, [])

  const fetchModels = async () => {
    try {
      const response = await fetch(`${WORKER_URL}/models`)
      if (response.ok) {
        const data = await response.json()
        setModels(data.models || [])
        setSelectedModel(data.default || '')
      }
    } catch (error) {
      console.error('Failed to fetch models:', error)
      // Set a fallback default
      setSelectedModel('openai:gpt-4.1-nano')
    } finally {
      setModelsLoading(false)
    }
  }

  useEffect(() => {
    // Scroll to bottom when messages change
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    // Keep focus on input
    if (!isLoading) {
      inputRef.current?.focus()
    }
  }, [messages, isLoading])

  // Trim conversation to last N turns to stay within limits
  const trimConversation = (msgs) => {
    const maxMessages = MAX_TURNS * 2 // user + assistant pairs
    if (msgs.length <= maxMessages) return msgs
    return msgs.slice(-maxMessages)
  }

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return

    const userMessage = { role: 'user', content: input.trim().slice(0, MAX_INPUT_LENGTH) }
    setMessages(prev => trimConversation([...prev, userMessage]))
    setInput('')
    setIsLoading(true)

    // Get trimmed history for API call
    const conversationHistory = trimConversation([...messages, userMessage])

    try {
      const response = await fetch(WORKER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: conversationHistory,
          model: selectedModel,
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      // Check if response is streaming (SSE) or regular JSON
      const contentType = response.headers.get('content-type')
      
      if (contentType?.includes('text/event-stream')) {
        // Handle streaming response
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let assistantMessage = { role: 'assistant', content: '' }
        setMessages(prev => [...prev, assistantMessage])

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          
          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split('\n')
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6)
              if (data === '[DONE]') continue
              try {
                const parsed = JSON.parse(data)
                const content = parsed.choices?.[0]?.delta?.content || parsed.response || ''
                assistantMessage.content += content
                setMessages(prev => {
                  const newMessages = [...prev]
                  newMessages[newMessages.length - 1] = { ...assistantMessage }
                  return newMessages
                })
              } catch {
                // Not JSON, treat as raw text
                assistantMessage.content += data
                setMessages(prev => {
                  const newMessages = [...prev]
                  newMessages[newMessages.length - 1] = { ...assistantMessage }
                  return newMessages
                })
              }
            }
          }
        }
      } else {
        // Handle regular JSON response
        const data = await response.json().catch(() => response.text())
        const content = typeof data === 'string' 
          ? data 
          : data.choices?.[0]?.message?.content || data.response || data.message || JSON.stringify(data)
        
        setMessages(prev => [...prev, { role: 'assistant', content }])
      }
    } catch (error) {
      console.error('Chat error:', error)
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `Connection error: ${error.message}. The worker may need to be configured to handle chat requests.`
      }])
    } finally {
      setIsLoading(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // Group models by provider for the dropdown
  const groupedModels = models.reduce((acc, model) => {
    if (!acc[model.provider]) {
      acc[model.provider] = []
    }
    acc[model.provider].push(model)
    return acc
  }, {})

  const providerLabels = {
    anthropic: 'Anthropic',
    openai: 'OpenAI',
    google: 'Google',
    fireworks: 'Fireworks',
    groq: 'Groq',
    mistral: 'Mistral',
  }

  return (
    <div 
      className={`chat-page min-h-screen flex flex-col transition-opacity duration-300 ${mounted ? 'opacity-100' : 'opacity-0'}`}
    >
      {/* Header */}
      <header className="chat-header">
        <Link to="/about" className="back-link">
          <span className="bracket">[</span>
          <span>←</span>
          <span className="bracket">]</span>
        </Link>
        <h1>Chat</h1>
        <div className="model-selector">
          {modelsLoading ? (
            <Spinner size="sm" color="current" />
          ) : (
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="model-dropdown"
              disabled={isLoading}
            >
              {Object.entries(groupedModels).map(([provider, providerModels]) => (
                <optgroup key={provider} label={providerLabels[provider] || provider}>
                  {providerModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
        </div>
      </header>

      {/* Messages */}
      <main className="chat-messages">
        <div className="chat-messages-inner">
          {messages.length === 0 && (
            <div className="chat-empty">
              <p>Start a conversation</p>
            </div>
          )}
          
          {messages.map((msg, i) => (
            <div 
              key={i} 
              className={`chat-message ${msg.role}`}
            >
              <div className="message-avatar">
                {msg.role === 'user' ? '→' : '←'}
              </div>
              <div className="message-content">
                <span className="message-role">
                  {msg.role === 'user' ? 'You' : 'Assistant'}
                </span>
                <div className="message-text">
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ href, children }) => (
                        <a href={href} target="_blank" rel="noopener noreferrer">
                          {children}
                        </a>
                      ),
                      code: ({ inline, className, children, ...props }) => (
                        inline 
                          ? <code className="inline-code" {...props}>{children}</code>
                          : <pre className="code-block"><code className={className} {...props}>{children}</code></pre>
                      ),
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          ))}
          
          {isLoading && messages[messages.length - 1]?.role === 'user' && (
            <div className="chat-message assistant">
              <div className="message-avatar">←</div>
              <div className="message-content">
                <span className="message-role">Assistant</span>
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input */}
      <footer className="chat-input-container">
        <div className="chat-input-wrapper">
          <div className="chat-input-row">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, MAX_INPUT_LENGTH))}
              onKeyDown={handleKeyDown}
              placeholder="Send a message..."
              disabled={isLoading}
              maxLength={MAX_INPUT_LENGTH}
              className="chat-input-field"
              autoFocus
            />
            <span className={`char-count ${input.length >= MAX_INPUT_LENGTH ? 'at-limit' : ''}`}>
              {input.length}/{MAX_INPUT_LENGTH}
            </span>
            <Button
              isIconOnly
              variant="light"
              onPress={sendMessage}
              isDisabled={!input.trim() || isLoading}
              className="send-button"
            >
              {isLoading ? (
                <Spinner size="sm" color="current" />
              ) : (
                <svg 
                  width="20" 
                  height="20" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2"
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                >
                  <path d="M22 2L11 13" />
                  <path d="M22 2L15 22L11 13L2 9L22 2Z" />
                </svg>
              )}
            </Button>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default Chat

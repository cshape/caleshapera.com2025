import { useEffect, useState, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Button, Spinner } from '@heroui/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Use local worker in development, production worker in production
const isDev = import.meta.env.DEV
const WORKER_URL = isDev 
  ? 'http://localhost:8787'
  : 'https://empty-sky-58f0.caleshapera.workers.dev'

const MAX_INPUT_LENGTH = 200
const MAX_TURNS = 20 // Each turn = 1 user + 1 assistant message
const CHARS_PER_FRAME = 2 // Characters to add per animation frame

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
  
  // Typewriter effect state
  const [displayedContent, setDisplayedContent] = useState('')
  const [isAnimating, setIsAnimating] = useState(false)
  const bufferRef = useRef('')
  const streamDoneRef = useRef(false) // Track if API stream is complete
  const animationRef = useRef(null)

  useEffect(() => {
    setMounted(true)
    document.title = 'Chat — Cale Shapera'
    inputRef.current?.focus()
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
      setSelectedModel('openai:gpt-4.1-nano')
    } finally {
      setModelsLoading(false)
    }
  }

  // Typewriter animation - multiple characters per frame for speed
  const animateTypewriter = useCallback(() => {
    const buffer = bufferRef.current
    const streamDone = streamDoneRef.current
    
    setDisplayedContent(current => {
      // Check if we've caught up with the buffer
      if (current.length >= buffer.length) {
        // If stream is done and we've caught up, stop animating
        if (streamDone) {
          // Use setTimeout to avoid state update during render
          setTimeout(() => {
            setIsAnimating(false)
            // Finalize the message
            setMessages(prev => {
              const newMessages = [...prev]
              if (newMessages.length > 0 && newMessages[newMessages.length - 1].isAnimating) {
                newMessages[newMessages.length - 1] = { 
                  role: 'assistant', 
                  content: buffer,
                  isAnimating: false
                }
              }
              return newMessages
            })
          }, 0)
        }
        return current
      }
      
      // Add multiple characters per frame
      const nextLength = Math.min(current.length + CHARS_PER_FRAME, buffer.length)
      return buffer.slice(0, nextLength)
    })
    
    // Continue animation
    animationRef.current = requestAnimationFrame(animateTypewriter)
  }, [])

  // Start/stop animation based on isAnimating state
  useEffect(() => {
    if (isAnimating) {
      animationRef.current = requestAnimationFrame(animateTypewriter)
    } else {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
    }
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
    }
  }, [isAnimating, animateTypewriter])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    if (!isLoading && !isAnimating) {
      inputRef.current?.focus()
    }
  }, [messages, displayedContent, isLoading, isAnimating])

  const trimConversation = (msgs) => {
    const maxMessages = MAX_TURNS * 2
    if (msgs.length <= maxMessages) return msgs
    return msgs.slice(-maxMessages)
  }

  const sendMessage = async () => {
    if (!input.trim() || isLoading || isAnimating) return

    const userMessage = { role: 'user', content: input.trim().slice(0, MAX_INPUT_LENGTH) }
    setMessages(prev => trimConversation([...prev, userMessage]))
    setInput('')
    setIsLoading(true)
    
    // Reset typewriter state
    bufferRef.current = ''
    streamDoneRef.current = false
    setDisplayedContent('')

    const conversationHistory = trimConversation([...messages, userMessage])

    try {
      const response = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: conversationHistory,
          model: selectedModel,
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const contentType = response.headers.get('content-type')
      
      if (contentType?.includes('text/event-stream')) {
        setIsLoading(false)
        setIsAnimating(true)
        
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        
        // Add assistant message that we'll animate
        setMessages(prev => [...prev, { role: 'assistant', content: '', isAnimating: true }])

        let sseBuffer = ''
        
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          
          sseBuffer += decoder.decode(value, { stream: true })
          const lines = sseBuffer.split('\n')
          sseBuffer = lines.pop() || ''
          
          for (const line of lines) {
            const trimmedLine = line.trim()
            if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue
            
            const data = trimmedLine.slice(6)
            if (data === '[DONE]') continue
            
            try {
              const parsed = JSON.parse(data)
              const content = parsed.choices?.[0]?.delta?.content || parsed.response || ''
              if (content) {
                bufferRef.current += content
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
        
        // Mark stream as done - animation will continue until caught up
        streamDoneRef.current = true
        
      } else {
        // Handle regular JSON response - animate it too
        const data = await response.json().catch(() => response.text())
        const content = typeof data === 'string' 
          ? data 
          : data.choices?.[0]?.message?.content || data.response || data.message || JSON.stringify(data)
        
        setIsLoading(false)
        bufferRef.current = content
        streamDoneRef.current = true
        setIsAnimating(true)
        setMessages(prev => [...prev, { role: 'assistant', content: '', isAnimating: true }])
      }
    } catch (error) {
      console.error('Chat error:', error)
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `Connection error: ${error.message}. The worker may need to be configured to handle chat requests.`
      }])
      setIsLoading(false)
      setIsAnimating(false)
    } finally {
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const groupedModels = models.reduce((acc, model) => {
    if (!acc[model.provider]) acc[model.provider] = []
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

  const isBusy = isLoading || isAnimating

  const getMessageContent = (msg, isLastMessage) => {
    if (isLastMessage && msg.isAnimating) return displayedContent
    return msg.content
  }

  return (
    <div className={`chat-page min-h-screen flex flex-col transition-opacity duration-300 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
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
              disabled={isBusy}
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

      <main className="chat-messages">
        <div className="chat-messages-inner">
          {messages.length === 0 && (
            <div className="chat-empty">
              <p>Start a conversation</p>
            </div>
          )}
          
          {messages.map((msg, i) => {
            const isLastMessage = i === messages.length - 1
            const content = getMessageContent(msg, isLastMessage)
            const showCursor = isLastMessage && msg.isAnimating
            
            return (
              <div key={i} className={`chat-message ${msg.role}`}>
                <div className="message-avatar">
                  {msg.role === 'user' ? '→' : '←'}
                </div>
                <div className="message-content">
                  <span className="message-role">
                    {msg.role === 'user' ? 'You' : 'Assistant'}
                  </span>
                  <div className="message-text">
                    {content ? (
                      <>
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
                          {content}
                        </ReactMarkdown>
                        {showCursor && <span className="streaming-cursor">▊</span>}
                      </>
                    ) : showCursor ? (
                      <span className="streaming-cursor">▊</span>
                    ) : null}
                  </div>
                </div>
              </div>
            )
          })}
          
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
              disabled={isBusy}
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
              isDisabled={!input.trim() || isBusy}
              className="send-button"
            >
              {isBusy ? (
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

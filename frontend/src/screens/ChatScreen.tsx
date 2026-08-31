// Экран чата-помощника (GPT).

import { useEffect, useRef, useState } from 'react'
import {
  type ChatMessage,
  type ContentPart,
  loadChatHistory,
  saveChatHistory,
  clearChatHistory,
  sendMessage,
  fileToDataURL,
} from '../services/chatService'
import { CloseIcon } from '../components/Icons'

const QUICK_QUESTIONS = [
  'Что у меня сегодня?',
  'Какая неделя — чётная или нет?',
  'Кто преподаватель по математике?',
  'Какое расписание на завтра?',
]

export function ChatScreen({ group }: { group: string | null }) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadChatHistory())
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  const send = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    let userContent: string | ContentPart[]
    if (imageFile) {
      const dataURL = await fileToDataURL(imageFile)
      userContent = [
        { type: 'text', text: trimmed },
        { type: 'image_url', image_url: { url: dataURL } },
      ]
    } else {
      userContent = trimmed
    }

    const userMsg: ChatMessage = { role: 'user', content: userContent }
    const botMsg: ChatMessage = { role: 'assistant', content: '' }
    const newMessages = [...messages, userMsg]

    setMessages([...newMessages, botMsg])
    setInput('')
    setImagePreview(null)
    setImageFile(null)
    setLoading(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const result = await sendMessage(
        newMessages,
        group,
        (partial) => {
          setMessages(prev => {
            const updated = [...prev]
            updated[updated.length - 1] = { role: 'assistant', content: partial }
            return updated
          })
        },
        controller.signal,
      )

      const final = [...newMessages, { role: 'assistant' as const, content: result }]
      setMessages(final)
      saveChatHistory(final)
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      const errorMsg = `Ошибка: ${(e as Error).message || 'не удалось получить ответ'}`
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = { role: 'assistant', content: errorMsg }
        return updated
      })
    } finally {
      setLoading(false)
      abortRef.current = null
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  const handleClear = () => {
    clearChatHistory()
    setMessages([])
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return
    setImageFile(file)
    const url = URL.createObjectURL(file)
    setImagePreview(url)
  }

  const removeImage = () => {
    setImagePreview(null)
    setImageFile(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const showWelcome = messages.length === 0

  return (
    <div className="chat-container">
      <section className="chat-header">
        <div className="chat-header-info">
          <h1 className="date-title">Помощник</h1>
          <div className="chat-header-sub">
            {group ? `${group} · AI` : 'AI-помощник'}
          </div>
        </div>
        {messages.length > 0 && (
          <button type="button" className="icon-btn lg" onClick={handleClear} aria-label="Очистить чат">
            <CloseIcon size={18} />
          </button>
        )}
      </section>

      <div className="chat-list" ref={listRef}>
        {showWelcome && (
          <div className="chat-welcome">
            <div className="chat-welcome-icon">💬</div>
            <h2 className="chat-welcome-title">Привет!</h2>
            <p className="chat-welcome-text">
              Я помогу с расписанием. Спроси что-нибудь!
            </p>
            <div className="chat-quick">
              {QUICK_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  className="chat-quick-btn"
                  onClick={() => send(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`chat-msg ${msg.role}`}>
            <div className="chat-bubble">
              {typeof msg.content === 'string' ? (
                msg.content || (loading && i === messages.length - 1 ? '•••' : '')
              ) : (
                msg.content.map((part, j) => {
                  if (part.type === 'text') return <span key={j}>{part.text}</span>
                  if (part.type === 'image_url' && part.image_url) {
                    return <img key={j} src={part.image_url.url} alt="" className="chat-image" />
                  }
                  return null
                })
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="chat-input-bar">
        {imagePreview && (
          <div className="chat-image-preview">
            <img src={imagePreview} alt="" />
            <button type="button" className="chat-image-remove" onClick={removeImage} aria-label="Удалить фото">×</button>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="chat-file-input"
          onChange={handleFile}
        />
        <button
          type="button"
          className="icon-btn"
          onClick={() => fileRef.current?.click()}
          aria-label="Прикрепить фото"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
          </svg>
        </button>
        <input
          ref={inputRef}
          type="text"
          className="chat-input"
          placeholder="Напиши сообщение..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          autoFocus
        />
        <button
          type="button"
          className="chat-send"
          onClick={() => send(input)}
          disabled={(!input.trim() && !imageFile) || loading}
          aria-label="Отправить"
        >
          {loading ? (
            <span className="chat-spinner" />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}

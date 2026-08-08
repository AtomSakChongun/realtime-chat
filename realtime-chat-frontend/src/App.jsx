import { useEffect, useRef, useState } from 'react'
import { socket } from './socket'
import './App.css'

function App() {
  const [username, setUsername] = useState(
    () => localStorage.getItem('chat-username') || ''
  )
  const [joined, setJoined] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [connected, setConnected] = useState(socket.connected)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [toasts, setToasts] = useState([])
  const messagesEndRef = useRef(null)

  function pushToast(text) {
    const id = `${Date.now()}-${Math.random()}`
    setToasts((prev) => [...prev, { id, text }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3000)
  }

  useEffect(() => {
    socket.connect()

    function onConnect() {
      setConnected(true)
    }
    function onDisconnect() {
      setConnected(false)
    }
    function onChatMessage(msg) {
      setMessages((prev) => [...prev, msg])
    }
    function onChatHistory(history) {
      setMessages(history)
    }
    function onUserJoined(user) {
      pushToast(`${user} เข้าร่วมห้องแชท`)
    }
    function onUserLeft(user) {
      pushToast(`${user} ออกจากห้องแชท`)
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('chat message', onChatMessage)
    socket.on('chat history', onChatHistory)
    socket.on('user joined', onUserJoined)
    socket.on('user left', onUserLeft)

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('chat message', onChatMessage)
      socket.off('chat history', onChatHistory)
      socket.off('user joined', onUserJoined)
      socket.off('user left', onUserLeft)
      socket.disconnect()
    }
  }, [])

  useEffect(() => {
    if (connected && joined && username) {
      socket.emit('join', username)
    }
  }, [connected, joined, username])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleJoin(e) {
    e.preventDefault()
    const trimmed = nameInput.trim()
    if (!trimmed) return
    localStorage.setItem('chat-username', trimmed)
    setUsername(trimmed)
    setJoined(true)
  }

  function handleSend(e) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || !connected) return
    socket.emit('chat message', {
      id: `${socket.id}-${Date.now()}`,
      user: username,
      text,
      ts: Date.now(),
    })
    setDraft('')
  }

  const toastContainer = (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          {t.text}
        </div>
      ))}
    </div>
  )

  if (!joined) {
    return (
      <>
        {toastContainer}
        <section id="join">
          <form className="join-form" onSubmit={handleJoin}>
            <h1>Realtime Chat</h1>
            <p>Pick a display name to join the room</p>
            <input
              type="text"
              placeholder="Your name"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              autoFocus
              maxLength={30}
            />
            <button type="submit" disabled={!nameInput.trim()}>
              Join chat
            </button>
          </form>
        </section>
      </>
    )
  }

  return (
    <>
      {toastContainer}
      <section id="chat">
        <header className="chat-header">
          <h1>Realtime Chat</h1>
          <span className={`status ${connected ? 'online' : 'offline'}`}>
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </header>

        <ul className="message-list">
          {messages.map((msg) => (
            <li
              key={msg.id}
              className={`message ${msg.user === username ? 'own' : ''}`}
            >
              <span className="message-user">{msg.user}</span>
              <p className="message-text">{msg.text}</p>
            </li>
          ))}
          <div ref={messagesEndRef} />
        </ul>

        <form className="composer" onSubmit={handleSend}>
          <input
            type="text"
            placeholder="Type a message"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={!connected}
          />
          <button type="submit" disabled={!connected || !draft.trim()}>
            Send
          </button>
        </form>
      </section>
    </>
  )
}

export default App

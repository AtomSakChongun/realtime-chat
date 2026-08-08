# Realtime Chat — Frontend

Client ฝั่ง frontend ของโปรเจกต์แชทเรียลไทม์ เขียนด้วย **React 19 + Vite** และคุยกับ server ผ่าน **socket.io-client**

เอกสารนี้อธิบายทุกฟังก์ชัน/hook ใน `src/` แบบละเอียด เหมาะสำหรับคนที่กำลังเรียน WebSocket/Socket.IO อยู่

> อยากดูภาพรวมทั้งระบบ (front + back ทำงานร่วมกันยังไง) ดูที่ [README หลักของโปรเจกต์](../README.md)
> อยากดูฝั่ง server ดูที่ [realtime-chat-backend/README.md](../realtime-chat-backend/README.md)

---

## แนวคิดสำคัญก่อนอ่านโค้ด

Socket.IO ฝั่ง client ทำงานแบบ **event-based** เหมือนฝั่ง server:

- `socket.emit('ชื่อ event', data)` → ส่งข้อมูลไปหา server
- `socket.on('ชื่อ event', callback)` → ดักฟัง event ที่ server ส่งมา แล้วรับ `data` ผ่าน callback
- `socket.off('ชื่อ event', callback)` → **เลิกฟัง** (สำคัญมากใน React ต้องเลิกฟังตอน component unmount ไม่งั้น callback จะค้างซ้อนกันเรื่อย ๆ)

`socket` instance ในโปรเจกต์นี้ถูกสร้าง**ครั้งเดียว**ที่ `src/socket.js` แล้ว import ไปใช้ที่ไหนก็ได้ — ทุกที่ที่ import จะได้ instance ตัวเดียวกัน (module ของ JS ถูก cache ไว้) ไม่ใช่สร้างใหม่ทุกครั้ง

---

## Setup & Run

```bash
npm install
npm run dev       # vite dev server ที่ http://localhost:5173
npm run build      # build production
npm run preview    # preview build
npm run lint        # oxlint
```

ตัวแปรแวดล้อมที่รองรับ (ใส่ในไฟล์ `.env` ถ้าต้องการเปลี่ยนจาก default):

| ตัวแปร | ค่า default | ใช้ทำอะไร |
|---|---|---|
| `VITE_SERVER_URL` | `http://localhost:3000` | URL ของ backend server ที่จะเชื่อมต่อด้วย Socket.IO |

---

## โครงสร้างไฟล์

```
src/
├── main.jsx    # จุดเริ่มของแอป React (render App ลง DOM)
├── App.jsx     # UI + logic ทั้งหมดของแชท (component เดียว)
└── socket.js   # สร้าง socket.io-client instance ตัวเดียวที่ใช้ทั้งแอป
```

---

## `src/socket.js` — สร้าง client instance

```js
import { io } from 'socket.io-client'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000'

export const socket = io(SERVER_URL, {
  autoConnect: false,
})
```

- `io(url, options)` สร้าง **client instance** ที่จะคุยกับ Socket.IO server ที่ `url` นั้น
- `import.meta.env.VITE_SERVER_URL` คือวิธีอ่าน environment variable ของ Vite (ต้องขึ้นต้นด้วย `VITE_` ถึงจะถูกฝังเข้า client bundle ได้)
- `autoConnect: false` คือกำหนดว่า **ยังไม่เชื่อมต่อทันทีตอน import ไฟล์นี้** — ถ้าไม่ตั้งค่านี้ ค่า default ของ Socket.IO คือ connect ทันที ซึ่งจะควบคุมจังหวะการเชื่อมต่อจาก component ไม่ได้ (เช่น เผลอ connect ตั้งแต่แอปยังไม่ mount เสร็จ, หรือ connect ซ้ำตอน Hot Module Reload) — โปรเจกต์นี้เลยปิดไว้แล้วไปสั่ง `socket.connect()` เองใน `App.jsx`
- ไฟล์นี้ `export` ตัวแปร `socket` ออกไปเป็น **singleton** — import จากไฟล์ไหนก็ได้ instance เดียวกันเสมอ

---

## `src/main.jsx` — จุดเข้าแอป

```js
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

ไฟล์มาตรฐานของ Vite+React ไม่มีอะไรเกี่ยวกับ Socket.IO โดยตรง แต่มีจุดที่ควรรู้: **`<StrictMode>`** ทำให้ React (เฉพาะตอน dev) รัน effect บาง component **ซ้ำสองครั้ง** โดยตั้งใจ เพื่อช่วยจับบั๊ก — เป็นเหตุผลที่ `App.jsx` ต้องเขียน cleanup function ของ `useEffect` ให้ถูกต้อง (ดูหัวข้อ `useEffect` ด้านล่าง) ไม่งั้นจะเจอปัญหา event listener ซ้อนกันตอน dev

---

## `src/App.jsx` — เดินโค้ดทีละส่วน

### State ที่ใช้

```js
const [username, setUsername] = useState(() => localStorage.getItem('chat-username') || '')
const [joined, setJoined] = useState(false)
const [nameInput, setNameInput] = useState('')
const [connected, setConnected] = useState(socket.connected)
const [messages, setMessages] = useState([])
const [draft, setDraft] = useState('')
const [toasts, setToasts] = useState([])
const messagesEndRef = useRef(null)
```

| ตัวแปร | เก็บอะไร |
|---|---|
| `username` | ชื่อที่ผู้ใช้ตั้ง (จำไว้ใน `localStorage` เพื่อไม่ต้องพิมพ์ใหม่ทุกครั้งที่เปิดแอป) |
| `joined` | true หลังกดปุ่ม "Join chat" แล้ว ใช้สลับหน้าจอ (หน้ากรอกชื่อ ↔ หน้าแชท) |
| `nameInput` | ค่าที่พิมพ์อยู่ในช่อง input ตอนกรอกชื่อ (controlled input) |
| `connected` | สถานะการเชื่อมต่อ socket ปัจจุบัน — เริ่มต้นจาก `socket.connected` (ไม่ใช่ hardcode `false`) เพื่อให้ตรงกับสถานะจริงของ socket ตั้งแต่ render แรก |
| `messages` | array ของข้อความแชททั้งหมดที่แสดงอยู่บนจอ |
| `draft` | ข้อความที่กำลังพิมพ์อยู่ในช่อง composer |
| `toasts` | รายการ toast แจ้งเตือน (เช่น "X เข้าร่วมห้องแชท") ที่กำลังแสดงอยู่ |
| `messagesEndRef` | ref ไปยัง element ว่าง ๆ ที่ท้าย list ข้อความ ใช้ scroll ลงล่างสุดอัตโนมัติ |

### `pushToast(text)` — เพิ่ม toast แจ้งเตือนแล้วลบทิ้งเองหลัง 3 วิ

```js
function pushToast(text) {
  const id = `${Date.now()}-${Math.random()}`
  setToasts((prev) => [...prev, { id, text }])
  setTimeout(() => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, 3000)
}
```

- สร้าง `id` ไม่ซ้ำแบบง่าย ๆ จาก timestamp + random number
- เพิ่ม toast ใหม่เข้า array ด้วย functional update (`(prev) => [...prev, ...]`) เพื่อความปลอดภัยเวลามีการเรียกซ้อนกันเร็ว ๆ
- ตั้ง `setTimeout` ให้ลบ toast นี้ทิ้งเองอัตโนมัติหลัง 3 วินาที โดย filter เอาเฉพาะ `id` ที่ไม่ตรง

### `useEffect` #1 — วงจรชีวิตของ socket connection (หัวใจของไฟล์นี้)

```js
useEffect(() => {
  socket.connect()

  function onConnect() { setConnected(true) }
  function onDisconnect() { setConnected(false) }
  function onChatMessage(msg) { setMessages((prev) => [...prev, msg]) }
  function onChatHistory(history) { setMessages(history) }
  function onUserJoined(user) { pushToast(`${user} เข้าร่วมห้องแชท`) }
  function onUserLeft(user) { pushToast(`${user} ออกจากห้องแชท`) }

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
```

- dependency array เป็น `[]` แปลว่า effect นี้ทำงาน**ครั้งเดียวตอน component mount** และ cleanup function ทำงานตอน **unmount**
- `socket.connect()` — สั่งเชื่อมต่อจริง (จำได้ว่า `socket.js` ปิด `autoConnect` ไว้ จุดนี้แหละที่มาเปิดการเชื่อมต่อ)
- ประกาศ named function สำหรับแต่ละ event แล้วค่อย `socket.on(...)` ผูกทีละตัว — เหตุผลที่ตั้งชื่อฟังก์ชันแยกไว้ (ไม่ inline arrow function ใน `.on()` ตรง ๆ) คือ **ต้องมี reference เดิมส่งเข้า `socket.off()` ตอน cleanup** ถ้า inline ไว้ `socket.off()` จะหา listener ตัวเดิมไม่เจอ (เพราะ arrow function ใหม่ทุกครั้งที่ effect รัน ถือเป็นคนละ reference กัน) แล้ว listener จะไม่ถูกถอดออกจริง เกิด memory leak
- แต่ละ handler ผูกกับ event ที่ฝั่ง server เป็นคน `emit`:
  - `'connect'` / `'disconnect'` — event สงวนของ Socket.IO ยิงอัตโนมัติเมื่อสถานะเชื่อมต่อเปลี่ยน → อัปเดต `connected` เพื่อโชว์ badge "Connected"/"Disconnected"
  - `'chat message'` — เมื่อ server กระจายข้อความใหม่มา (`io.emit`) → append เข้า `messages`
  - `'chat history'` — เมื่อ server ส่งประวัติแชทมาให้ตอนเพิ่ง join (`socket.emit`) → set ทับ `messages` ทั้งก้อน
  - `'user joined'` / `'user left'` — เมื่อ server แจ้งว่ามีคนเข้า/ออกห้อง (`socket.broadcast.emit`) → แสดง toast
- **cleanup function** (return จาก useEffect) สำคัญมาก: `socket.off(...)` ถอด listener ทุกตัวออก แล้ว `socket.disconnect()` ตัดการเชื่อมต่อ — ทำงานตอน component unmount (หรือใน dev mode ที่ `StrictMode` รัน effect ซ้ำ ก็จะ mount→cleanup→mount อีกรอบ ถ้า cleanup ไม่ครบ จะเจอ listener ซ้อน หรือ event ยิงซ้ำสองเท่า)

### `useEffect` #2 — ส่ง event `'join'` ให้ server เมื่อพร้อม

```js
useEffect(() => {
  if (connected && joined && username) {
    socket.emit('join', username)
  }
}, [connected, joined, username])
```

- รอ 3 เงื่อนไขพร้อมกัน: **เชื่อมต่อ socket สำเร็จแล้ว** (`connected`), **ผู้ใช้กดปุ่ม join แล้ว** (`joined`), และ **มีชื่อผู้ใช้** (`username`)
- เหตุผลที่ต้องรอ `connected` ด้วย ไม่ใช่แค่ `joined`: ถ้า component mount เสร็จแต่ socket ยังเชื่อมต่อไม่สำเร็จ (เช่น server ช้า) แล้วรีบ `emit('join', ...)` ไปเลย ข้อความนั้นจะหายไปเฉย ๆ เพราะยังไม่มีการเชื่อมต่อจริงให้ส่งผ่าน
- dependency array ใส่ทั้งสามตัว เพราะ effect นี้ต้องรันใหม่ทุกครั้งที่ตัวใดตัวหนึ่งเปลี่ยน (เช่น ตอนแรก `connected` เป็น false แล้วค่อยเปลี่ยนเป็น true ทีหลังจาก event `'connect'`)

### `useEffect` #3 — scroll ไปข้อความล่าสุดอัตโนมัติ

```js
useEffect(() => {
  messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
}, [messages])
```

- ทำงานทุกครั้งที่ `messages` เปลี่ยน (มีข้อความใหม่ หรือ history ถูก set)
- `messagesEndRef` ชี้ไปที่ `<div>` ว่าง ๆ ที่วางไว้ท้ายสุดของ list ข้อความใน JSX — เรียก `scrollIntoView` เพื่อเลื่อนจอลงมาให้เห็น div นั้น (ซึ่งอยู่ล่างสุด) ทำให้ผู้ใช้เห็นข้อความล่าสุดเสมอ
- ไม่เกี่ยวกับ Socket.IO โดยตรง แต่เป็นผลลัพธ์จากข้อมูลที่ socket นำเข้ามา

### `handleJoin(e)` — submit ฟอร์มตั้งชื่อ

```js
function handleJoin(e) {
  e.preventDefault()
  const trimmed = nameInput.trim()
  if (!trimmed) return
  localStorage.setItem('chat-username', trimmed)
  setUsername(trimmed)
  setJoined(true)
}
```

- `e.preventDefault()` กัน browser ไม่ให้ submit form แบบ default (reload หน้า)
- ตัดช่องว่างหน้า-หลัง (`trim()`) แล้วเช็คว่าไม่ว่างเปล่า
- บันทึกชื่อลง `localStorage` (จำไว้ข้ามการรีเฟรช/เปิดแอปครั้งหน้า) แล้ว set `username` และ `joined` — การ set สองตัวนี้จะไป trigger `useEffect` #2 ด้านบนให้ทำงาน (ถ้า `connected` เป็น true อยู่แล้ว) ส่ง `emit('join', ...)` ออกไปจริง

### `handleSend(e)` — submit ฟอร์มส่งข้อความ

```js
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
```

- กัน submit ข้อความว่าง หรือส่งตอนที่ socket ไม่ได้เชื่อมต่ออยู่ (`!connected`)
- `socket.emit('chat message', payload)` — ส่ง event ไปหา server โดยตรง (ดู [backend README](../realtime-chat-backend/README.md#6-socketonchat-message-callback--รับข้อความแชท) ว่า server รับแล้วทำอะไรต่อ)
- `id` ใช้ `socket.id` (id ของการเชื่อมต่อปัจจุบัน) ผสมกับ timestamp เพื่อให้ไม่ซ้ำกัน — ใช้เป็น React `key` ตอน render list
- **หมายเหตุ:** UI จะไม่ขึ้นข้อความทันทีตอนกด Send — ต้องรอ server กระจาย `'chat message'` กลับมาผ่าน `io.emit(...)` แล้ว `onChatMessage` handler ใน useEffect #1 ถึงจะ append เข้า `messages` (แม้แต่คนส่งเองก็ต้องรอ round-trip นี้เหมือนกัน เพราะ server ใช้ `io.emit` ไม่ใช่ให้ client เพิ่ม message เข้า state เอง — เป็นการยืนยันว่า “server เห็นข้อความนี้แล้วจริง ๆ”)
- เคลียร์ `draft` ให้ช่อง input ว่างหลังส่ง

### ส่วน JSX (render)

- ถ้ายัง `!joined` → แสดงฟอร์มกรอกชื่อ (`#join`)
- ถ้า `joined` แล้ว → แสดงหน้าห้องแชท (`#chat`): header พร้อม badge สถานะเชื่อมต่อ, list ข้อความ (`msg.user === username` ใช้เช็คว่าเป็นข้อความของตัวเองไหมเพื่อจัด style ต่างกัน), และฟอร์ม composer พิมพ์ข้อความ
- `toastContainer` render แยกไว้ด้านบนสุด แสดงทับทั้งสองหน้าจอ (ใช้ `.map()` render ทุก toast ใน `toasts` โดยใช้ `t.id` เป็น key)

---

## สรุปตาราง: event ที่ใช้ในฝั่ง client

| Event | ทิศทาง | Handler / จุดที่ emit |
|---|---|---|
| `'connect'` | รับจาก server (สงวนของ Socket.IO) | `onConnect` → `setConnected(true)` |
| `'disconnect'` | รับจาก server (สงวนของ Socket.IO) | `onDisconnect` → `setConnected(false)` |
| `'join'` | ส่งไป server | `useEffect` #2 → `socket.emit('join', username)` |
| `'chat history'` | รับจาก server | `onChatHistory` → `setMessages(history)` |
| `'chat message'` | ส่งไป/รับจาก server | ส่ง: `handleSend` / รับ: `onChatMessage` |
| `'user joined'` | รับจาก server | `onUserJoined` → `pushToast(...)` |
| `'user left'` | รับจาก server | `onUserLeft` → `pushToast(...)` |

---

## จุดที่เป็น "gotcha" เวลาเรียน Socket.IO + React (คุ้มค่าจะจำไว้)

1. **`socket.off()` ต้องได้ reference เดิมของฟังก์ชัน** — ถ้า inline arrow function ตรง ๆ ใน `.on()` จะ off ไม่ได้จริง ต้องประกาศฟังก์ชันแยกไว้ก่อนแบบในโค้ดนี้
2. **`StrictMode` รัน effect ซ้ำตอน dev** — ทำให้เห็น `connect → cleanup(disconnect) → connect` ใน console สองรอบตอนโหลดหน้าแรก เป็นเรื่องปกติ ไม่ใช่บั๊ก แต่ก็เป็นเหตุผลที่ cleanup function ต้อง "สมมาตร" กับ setup เสมอ (on ครบ ต้อง off ครบ)
3. **`autoConnect: false` + เรียก `.connect()` เองใน `useEffect`** คือ pattern แนะนำสำหรับ React — ให้ lifecycle ของ socket ผูกกับ lifecycle ของ component ที่ใช้งานมันจริง ไม่ใช่ผูกกับตอน import module
4. **การ emit แล้วไม่เห็นผลทันที** — เพราะ UI ที่เห็นมาจาก event ที่ server ส่งกลับมา ไม่ใช่จาก state เปลี่ยนตรง ๆ ตอน emit (design แบบนี้ทำให้ทุกคนเห็นข้อมูลตรงกันเสมอ เป็น "single source of truth" ที่ server)

## ถ้าอยากต่อยอด

- แสดง loading/error state ตอน `socket.io.on('reconnect_attempt', ...)`, `'connect_error'`
- ใช้ acknowledgement callback (`socket.emit('chat message', payload, (ack) => {...})`) เพื่อรู้ว่า server รับข้อความแล้วจริง ก่อนเคลียร์ draft
- แยก logic ของ socket ออกจาก `App.jsx` เป็น custom hook (เช่น `useChatSocket()`) เมื่อโค้ดเริ่มใหญ่ขึ้น

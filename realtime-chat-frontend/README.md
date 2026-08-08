# Realtime Chat

โปรเจกต์แชทแบบเรียลไทม์ ใช้ **Socket.IO** เป็นแกนหลักในการสื่อสารระหว่าง client (React) กับ server (Express) โดยไม่ต้อง refresh หน้าเว็บ

- `realtime-chat-backend/` — Express + Socket.IO server
- `realtime-chat-frontend/` — React + Vite client (socket.io-client)

เอกสารนี้สรุปฟังก์ชัน/concept ของ Socket.IO ที่ใช้จริงในโปรเจกต์นี้ พร้อมอธิบายว่าแต่ละตัวทำอะไร

## Run โปรเจกต์

```bash
# backend
cd realtime-chat-backend
npm install
npm run dev        # http://localhost:3000

# frontend (อีก terminal)
cd realtime-chat-frontend
npm install
npm run dev         # http://localhost:5173
```

## แนวคิดหลักของ Socket.IO: Event-based

Socket.IO ไม่ได้ทำงานแบบ REST (ไม่มี route ให้ `fetch`) แต่ทำงานแบบ **ยิง event ชื่อหนึ่ง แล้วอีกฝั่งฟัง event ชื่อนั้น**:

- ฝั่งหนึ่ง `emit('ชื่อ event', data)` → ส่งข้อมูลออกไป
- อีกฝั่ง `on('ชื่อ event', callback)` → ดักฟัง แล้วรับ `data` มาใช้

ชื่อ event ตั้งเองได้ (ในโปรเจกต์นี้ใช้ `'chat message'`, `'join'`, `'chat history'`, `'user joined'`, `'user left'`) ยกเว้น event ที่ Socket.IO สงวนไว้ให้เอง เช่น `'connect'`, `'disconnect'`

---

## ฝั่ง Backend (`realtime-chat-backend/index.js`)

### `new Server(server, options)`
สร้าง Socket.IO server ผูกเข้ากับ HTTP server ของ Express

```js
const io = new Server(server, {
  cors: { origin: process.env.CLIENT_URL || 'http://localhost:5173' },
});
```
`cors.origin` ต้องระบุ เพราะ frontend (`:5173`) กับ backend (`:3000`) อยู่คนละ origin ถ้าไม่เปิด CORS เบราว์เซอร์จะบล็อกการเชื่อมต่อ

### `io.on('connection', (socket) => {...})`
รันทุกครั้งที่มี **client ใหม่เชื่อมต่อเข้ามา** — `socket` คือ "ตัวแทน" ของ client คนนั้นคนเดียว ใช้แยกแยะว่าใครส่งอะไรมา

```js
io.on('connection', (socket) => {
  console.log('A user connected');
  ...
});
```

### `socket.on('ชื่อ event', callback)`
**รับ**ข้อมูลจาก client คนนั้นโดยเฉพาะ เวลา client `emit()` event นี้มา ฝั่ง server จะได้ค่าที่ส่งมาผ่าน callback

```js
socket.on('chat message', (msg) => {
  messageHistory.push(msg);
  io.emit('chat message', msg);
});
```

### `socket.data`
ที่เก็บข้อมูลชั่วคราวผูกกับ socket แต่ละตัว (มีชีวิตอยู่ตราบเท่าที่ยัง connect อยู่) ใช้เก็บ username ของ client คนนั้นไว้ใช้ตอน disconnect

```js
socket.on('join', (user) => {
  socket.data.user = user;   // จำชื่อผู้ใช้ไว้กับ socket นี้
});
```

### `socket.emit(...)` — ส่งกลับไปหา "ตัวเอง" คนเดียว
ใช้ตอนอยากส่งข้อมูลกลับไปหา client ที่เพิ่ง emit เข้ามา **เฉพาะคนนั้น** ไม่กระจายให้คนอื่น

```js
socket.on('join', (user) => {
  socket.emit('chat history', messageHistory);  // ส่งประวัติแชทให้เฉพาะคนที่เพิ่ง join
});
```

### `io.emit(...)` — Broadcast ให้ "ทุกคน" รวมตัวเองด้วย
ส่งไปหา client **ทุกคนที่เชื่อมต่ออยู่** รวมถึงคนที่ส่ง event มาด้วย เหมาะกับข้อความแชทที่ทุกคนต้องเห็นเหมือนกันหมด

```js
socket.on('chat message', (msg) => {
  io.emit('chat message', msg);  // ทุกคนในห้องเห็นข้อความนี้ รวมคนส่งเอง
});
```

### `socket.broadcast.emit(...)` — Broadcast ให้ "ทุกคนยกเว้นตัวเอง"
ต่างจาก `io.emit` ตรงที่ **ไม่ส่งกลับไปหาตัวเอง** เหมาะกับการแจ้งเตือนแบบ "มีคนอื่นทำอะไรสักอย่าง" ที่ตัวเองไม่จำเป็นต้องเห็นแจ้งเตือนของตัวเอง

```js
socket.broadcast.emit('user joined', user);  // แจ้งคนอื่นว่ามีคนเข้าห้อง (ไม่ต้องแจ้งตัวเอง)
```

### `socket.on('disconnect', callback)`
event พิเศษที่ Socket.IO ยิงให้อัตโนมัติเมื่อ client หลุดการเชื่อมต่อ (ปิดแท็บ, เน็ตหลุด, ฯลฯ)

```js
socket.on('disconnect', () => {
  if (socket.data.user) {
    socket.broadcast.emit('user left', socket.data.user);
  }
});
```

### สรุปตาราง: `emit` แบบไหนส่งไปหาใคร

| คำสั่ง | ส่งไปหาใคร |
|---|---|
| `socket.emit(...)` | ตัวเองคนเดียว (คนที่ trigger event) |
| `io.emit(...)` | ทุกคน รวมตัวเอง |
| `socket.broadcast.emit(...)` | ทุกคน **ยกเว้น**ตัวเอง |

---

## ฝั่ง Frontend (`realtime-chat-frontend/src`)

### `io(url, options)` — สร้าง client instance (`socket.js`)

```js
export const socket = io(SERVER_URL, { autoConnect: false });
```
`autoConnect: false` แปลว่ายังไม่เชื่อมต่อทันทีตอน import — ต้องเรียก `socket.connect()` เองทีหลัง (เพื่อคุมจังหวะการเชื่อมต่อจาก component)

### `socket.connect()` / `socket.disconnect()`
สั่งเชื่อมต่อ/ตัดการเชื่อมต่อด้วยตัวเอง ใช้ใน `useEffect` ตอน component mount/unmount

```js
useEffect(() => {
  socket.connect();
  return () => socket.disconnect();
}, []);
```

### `socket.on(...)` / `socket.off(...)`
เหมือนฝั่ง backend คือ "ฟัง" event — แต่เพิ่ม `socket.off()` เพื่อ **เลิกฟัง** ตอน component unmount (ป้องกัน memory leak / callback ค้าง)

```js
socket.on('chat message', onChatMessage);
// ...
return () => socket.off('chat message', onChatMessage);
```

### `socket.emit(...)` — ส่งข้อมูลไปหา server
```js
socket.emit('chat message', { id, user: username, text, ts: Date.now() });
socket.emit('join', username);
```

### `socket.connected` / event `'connect'` / `'disconnect'`
`'connect'` และ `'disconnect'` เป็น event ที่ Socket.IO สงวนไว้ ยิงอัตโนมัติเมื่อสถานะการเชื่อมต่อเปลี่ยน ใช้อัปเดต UI (เช่น badge "Connected"/"Disconnected")

```js
socket.on('connect', () => setConnected(true));
socket.on('disconnect', () => setConnected(false));
```

---

## Flow การทำงานทั้งระบบ (event ที่ใช้ในโปรเจกต์นี้)

1. **client เปิดเว็บ** → `socket.connect()`
2. **user กรอกชื่อ กด Join** → client `emit('join', username)`
3. **server รับ `'join'`** → เก็บชื่อไว้ที่ `socket.data.user`, `emit` (เฉพาะคนนั้น) ส่ง `'chat history'` กลับไป, แล้ว `broadcast.emit('user joined', ...)` แจ้งคนอื่น
4. **client รับ `'chat history'`** → set ข้อความเก่าทั้งหมดขึ้นจอ (คนที่เข้าห้องทีหลังเห็นข้อความก่อนหน้าได้)
5. **client รับ `'user joined'`** → แสดง toast แจ้งเตือนว่ามีคนเข้าห้อง
6. **user พิมพ์ข้อความ ส่ง** → client `emit('chat message', msg)`
7. **server รับ `'chat message'`** → เก็บลง `messageHistory`, แล้ว `io.emit('chat message', msg)` กระจายให้ทุกคนรวมคนส่งเอง
8. **user ปิดแท็บ/เน็ตหลุด** → server ได้ event `'disconnect'` อัตโนมัติ → `broadcast.emit('user left', ...)` แจ้งคนอื่น

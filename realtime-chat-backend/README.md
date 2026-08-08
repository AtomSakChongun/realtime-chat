# Realtime Chat — Backend

Server ฝั่ง backend ของโปรเจกต์แชทเรียลไทม์ เขียนด้วย **Express** (จัดการ HTTP) + **Socket.IO** (จัดการการเชื่อมต่อแบบเรียลไทม์)

เอกสารนี้อธิบายทุกฟังก์ชัน/statement ใน `index.js` แบบละเอียด เหมาะสำหรับคนที่กำลังเรียน WebSocket/Socket.IO อยู่

> อยากดูภาพรวมทั้งระบบ (front + back ทำงานร่วมกันยังไง) ดูที่ [README หลักของโปรเจกต์](../README.md)
> อยากดูฝั่ง client ดูที่ [realtime-chat-frontend/README.md](../realtime-chat-frontend/README.md)

---

## ก่อนอ่านโค้ด: HTTP vs WebSocket คืออะไร

- **HTTP** ปกติ: client ขอ (request) → server ตอบ (response) → จบการเชื่อมต่อ ถ้า client อยากรู้ข้อมูลใหม่ต้องขอใหม่อีกครั้ง (polling)
- **WebSocket**: เปิดการเชื่อมต่อ (connection) ค้างไว้เส้นเดียว แล้ว **ทั้งสองฝั่งส่งข้อมูลหากันได้ตลอดเวลา** โดยไม่ต้องขอใหม่ทุกครั้ง — เหมาะกับแชท, notification, game แบบเรียลไทม์
- **Socket.IO** คือ library ที่ห่อ WebSocket ไว้อีกที ทำให้ใช้งานง่ายขึ้น (มี auto-reconnect, fallback ไปใช้ HTTP long-polling ถ้า WebSocket เชื่อมต่อไม่ได้, และให้เราสื่อสารกันด้วย **event ที่ตั้งชื่อเอง** แทนที่จะเป็นแค่ raw message)

โมเดลของ Socket.IO คือ **event-based**: ฝั่งหนึ่ง `emit('ชื่อ event', data)` → อีกฝั่ง `on('ชื่อ event', callback)` ดักฟังแล้วรับ `data` มาใช้

---

## Setup & Run

```bash
npm install
npm run dev     # nodemon index.js — auto restart เมื่อแก้โค้ด, รันที่ http://localhost:3000
# หรือ
npm start       # node index.js — รันปกติไม่ auto restart
```

ตัวแปรแวดล้อมที่รองรับ:

| ตัวแปร | ค่า default | ใช้ทำอะไร |
|---|---|---|
| `PORT` | `3000` | port ที่ server จะ listen |
| `CLIENT_URL` | `http://localhost:5173` | origin ของ frontend ที่อนุญาตให้เชื่อมต่อเข้ามาได้ (CORS) |

---

## เดินโค้ดทีละส่วน (`index.js`)

### 1. Import และสร้าง server

```js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
  },
});
```

- `express()` สร้าง Express app ปกติ ไว้จัดการ HTTP route (เช่น `GET /`)
- `http.createServer(app)` สร้าง **raw HTTP server** ของ Node โดยเอา Express app ไปผูกด้วย — จุดนี้สำคัญ เพราะ **Socket.IO ต้องการ HTTP server ตัวจริงมา "แนบ" (attach) ตัวเองเข้าไป** เพื่อดัก request ที่เป็นการขอ upgrade เป็น WebSocket (ถ้าใช้ `app.listen()` ตรง ๆ แบบ Express เฉย ๆ จะไม่มี server object ให้ Socket.IO เกาะ)
- `new Server(server, options)` สร้าง Socket.IO server ผูกเข้ากับ `server` ตัวเดียวกัน ทำให้ HTTP request ปกติ (route ของ Express) กับ WebSocket connection (ของ Socket.IO) วิ่งอยู่บน port เดียวกันได้
- `cors.origin` ต้องระบุ เพราะ frontend (`:5173`) กับ backend (`:3000`) คนละ origin (คนละ port ก็ถือว่าคนละ origin แล้ว) ถ้าไม่เปิด CORS เบราว์เซอร์จะบล็อกการเชื่อมต่อจาก client

### 2. Route ปกติของ Express (ไม่เกี่ยวกับ Socket.IO)

```js
app.use(express.static(__dirname + '/public'));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});
```

- `express.static(...)` ให้ Express เสิร์ฟไฟล์ static (css/js/รูป) จากโฟลเดอร์ `public/` ถ้ามีการขอ URL ที่ตรงกับชื่อไฟล์
- `app.get('/')` ตอบ `index.html` เวลามีคนเข้าหน้าแรกของ server ตรง ๆ

> **หมายเหตุ:** ในโปรเจกต์นี้ frontend รันแยกเป็นแอป Vite ต่างหาก (`:5173`) ไม่ได้พึ่งสอง route นี้ และปัจจุบันไม่มีทั้งโฟลเดอร์ `public/` และไฟล์ `index.html` อยู่จริง — สองบรรทัดนี้จึงยังไม่ได้ถูกใช้งาน (เผื่อไว้ในกรณีอยากรวม build ของ frontend มาเสิร์ฟจาก server เดียวกันในอนาคต)

### 3. State เก็บประวัติแชท (ในหน่วยความจำ)

```js
const MAX_HISTORY = 50;
const messageHistory = [];
```

- เก็บข้อความล่าสุดไว้ใน array ธรรมดาบน RAM ของ process — **ไม่ใช่ database**
- ข้อจำกัดที่ควรรู้ (เป็นจุดเรียนรู้ที่ดี):
  - รีสตาร์ท server เมื่อไหร่ ข้อความหายหมด
  - ถ้ารัน server หลาย instance (scale out) แต่ละ instance จะมีประวัติคนละชุด ไม่ sync กัน (ต้องใช้ Redis หรือ DB กลางถ้าจะทำจริงจัง)
  - เก็บแค่ `MAX_HISTORY` (50) ข้อความล่าสุด ข้อความเก่ากว่านั้นจะถูกลบทิ้ง

### 4. `io.on('connection', callback)` — จุดเริ่มของทุกการเชื่อมต่อ

```js
io.on('connection', (socket) => {
  console.log('A user connected');
  // ...
});
```

- Callback นี้ทำงาน **ทุกครั้งที่มี client ใหม่เชื่อมต่อเข้ามา** (เปิดหน้าเว็บ แล้วฝั่ง client เรียก `socket.connect()` สำเร็จ)
- พารามิเตอร์ `socket` คือ object ที่เป็น **"ตัวแทน" ของ client คนนั้นคนเดียว** — แต่ละ client ที่ต่อเข้ามาจะได้ `socket` object คนละตัว มี `socket.id` ไม่ซ้ำกัน ใช้แยกแยะว่าใครส่งอะไรมา
- โค้ดทุกอย่างที่ผูกกับ `socket` นี้ (event listener ต่าง ๆ ด้านล่าง) จะเป็นของ client คนนี้เท่านั้น

### 5. `socket.on('join', callback)` — client แจ้งชื่อและขอเข้าห้อง

```js
socket.on('join', (user) => {
  socket.data.user = user;
  socket.emit('chat history', messageHistory);
  socket.broadcast.emit('user joined', user);
});
```

- ดักฟัง event ชื่อ `'join'` ที่ client เป็นคน `emit` มา (ตอนกดปุ่ม "Join chat" ฝั่ง frontend)
- `socket.data` เป็นที่เก็บข้อมูลชั่วคราวที่ผูกกับ socket ตัวนี้โดยเฉพาะ (มีชีวิตอยู่ตราบเท่าที่ client ยัง connect อยู่) ใช้เก็บ username ไว้ใช้ตอน disconnect ทีหลัง
- `socket.emit('chat history', messageHistory)` — ส่งประวัติแชททั้งหมดกลับไปหา **เฉพาะ client ที่เพิ่ง join คนนี้** (ไม่กระจายให้คนอื่น เพราะคนอื่นมีประวัติอยู่แล้ว)
- `socket.broadcast.emit('user joined', user)` — แจ้งเตือน **client คนอื่นทุกคนยกเว้นตัวเอง** ว่ามีคนใหม่เข้าห้อง

### 6. `socket.on('chat message', callback)` — รับข้อความแชท

```js
socket.on('chat message', (msg) => {
  messageHistory.push(msg);
  if (messageHistory.length > MAX_HISTORY) messageHistory.shift();
  io.emit('chat message', msg);
});
```

- ดักฟัง event `'chat message'` ที่ client ส่งมาตอนพิมพ์แล้วกด Send
- เก็บข้อความลง `messageHistory` แล้วถ้าเกิน 50 ข้อความ ก็ `shift()` ตัวเก่าสุดออก (คิวแบบ FIFO ขนาดจำกัด)
- `io.emit('chat message', msg)` — กระจายข้อความนี้ไปหา **ทุก client ที่เชื่อมต่ออยู่ รวมถึงคนที่ส่งเองด้วย** (ต่างจาก `socket.broadcast.emit` ตรงที่อันนี้รวมตัวเองด้วย) เหมาะกับแชทเพราะทุกคนต้องเห็นข้อความเหมือนกันหมดรวมถึงคนพิมพ์เอง

### 7. `socket.on('disconnect', callback)` — client หลุดการเชื่อมต่อ

```js
socket.on('disconnect', () => {
  console.log('A user disconnected');
  if (socket.data.user) {
    socket.broadcast.emit('user left', socket.data.user);
  }
});
```

- `'disconnect'` เป็น **event สงวน** ที่ Socket.IO ยิงให้อัตโนมัติ ไม่ต้องเขียนโค้ด emit เอง — เกิดขึ้นเมื่อ client ปิดแท็บ, เน็ตหลุด, หรือเรียก `socket.disconnect()` เอง
- เช็ค `socket.data.user` ก่อน เผื่อกรณี client หลุดการเชื่อมต่อ**ก่อน**ที่จะ join (ยังไม่เคยตั้งชื่อ) จะได้ไม่ broadcast ค่า `undefined`
- `socket.broadcast.emit('user left', ...)` แจ้งคนอื่นว่ามีคนออกจากห้อง (ไม่ต้องแจ้งตัวเอง เพราะตัวเองหลุดไปแล้ว ฟังอะไรไม่ได้อยู่แล้ว)

### 8. เริ่ม listen

```js
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
```

- สั่งให้ `server` (raw HTTP server ที่ผูก Express + Socket.IO ไว้แล้ว) เริ่มรอรับ connection ที่ port ที่กำหนด — **ต้อง listen ที่ `server` ไม่ใช่ `app`** เพราะถ้า listen ที่ `app.listen()` เฉย ๆ Socket.IO ที่ผูกกับ `server` จะไม่ทำงาน

---

## สรุปตาราง: `emit` แบบไหนส่งไปหาใคร

| คำสั่ง | ส่งไปหาใคร | ใช้ตอนไหนในโปรเจกต์นี้ |
|---|---|---|
| `socket.emit(...)` | ตัวเองคนเดียว (คนที่ trigger event) | ส่ง `'chat history'` กลับให้คนที่เพิ่ง join |
| `io.emit(...)` | ทุกคนที่เชื่อมต่ออยู่ รวมตัวเอง | กระจาย `'chat message'` |
| `socket.broadcast.emit(...)` | ทุกคน **ยกเว้น**ตัวเอง | แจ้ง `'user joined'` / `'user left'` |

> Socket.IO ยังมี `io.to(roomName).emit(...)` สำหรับส่งเฉพาะคนในห้อง (room) — โปรเจกต์นี้ยังไม่ได้ใช้ rooms (ทุกคนอยู่ห้องเดียวกันหมด) ถ้าอยากต่อยอดทำหลายห้องแชท นี่คือจุดที่ควรไปอ่านต่อ

---

## Sequence: อะไรเกิดขึ้นบ้างเมื่อ client คนหนึ่งเข้ามาแชท

```
Client A                    Server                     Client B (อยู่ก่อนแล้ว)
   |                          |                              |
   |--- connect (WS) -------->|                              |
   |                          | io.on('connection') ทำงาน    |
   |--- emit 'join' --------->|                              |
   |                          | socket.data.user = 'A'       |
   |<-- emit 'chat history' --|                              |
   |                          |--- broadcast 'user joined' ->|  (B เห็น toast "A เข้าร่วม")
   |                          |                              |
   |--- emit 'chat message' ->|                              |
   |                          | เก็บลง messageHistory        |
   |<== io.emit 'chat message' (ทุกคนรวม A) ==================>|
   |                          |                              |
   |--- ปิดแท็บ (disconnect) ->|                              |
   |                          |--- broadcast 'user left' --->|  (B เห็น toast "A ออกจากห้อง")
```

---

## ถ้าอยากต่อยอด (จุดที่ยังไม่ได้ทำ เหมาะกับตอนเรียนรู้เพิ่ม)

- **Rooms/Namespaces** — แยกห้องแชทหลายห้อง (`socket.join(room)`, `io.to(room).emit(...)`)
- **Persistence** — เก็บข้อความลง database จริงแทน array ในหน่วยความจำ
- **Authentication** — ตอนนี้ใครก็ตั้งชื่ออะไรก็ได้ ไม่มีการยืนยันตัวตน
- **Acknowledgement callback** — `socket.emit('event', data, (response) => {...})` ให้ฝั่งที่ส่งรู้ว่าอีกฝั่งได้รับ/ประมวลผลแล้ว
- **Error/reconnect handling ฝั่ง server** — เช่น `io.engine.on('connection_error', ...)`

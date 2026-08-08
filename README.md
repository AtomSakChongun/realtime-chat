# Realtime Chat

โปรเจกต์แชทแบบเรียลไทม์ ใช้ **Socket.IO** เป็นแกนหลักในการสื่อสารระหว่าง client (React) กับ server (Express) โดยไม่ต้อง refresh หน้าเว็บ ทำไว้เป็นตัวอย่างสำหรับเรียนรู้ WebSocket/Socket.IO

- `realtime-chat-backend/` — Express + Socket.IO server → อธิบายละเอียดที่ **[realtime-chat-backend/README.md](./realtime-chat-backend/README.md)**
- `realtime-chat-frontend/` — React + Vite client (socket.io-client) → อธิบายละเอียดที่ **[realtime-chat-frontend/README.md](./realtime-chat-frontend/README.md)**

เอกสารนี้เป็นแค่ภาพรวม ถ้าอยากรู้ว่าแต่ละฟังก์ชันในโค้ดทำอะไรบ้าง ดูใน README ของแต่ละฝั่งด้านบน

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

## Flow การทำงานทั้งระบบ

1. **client เปิดเว็บ** → `socket.connect()`
2. **user กรอกชื่อ กด Join** → client `emit('join', username)`
3. **server รับ `'join'`** → เก็บชื่อไว้ที่ `socket.data.user`, `emit` (เฉพาะคนนั้น) ส่ง `'chat history'` กลับไป, แล้ว `broadcast.emit('user joined', ...)` แจ้งคนอื่น
4. **client รับ `'chat history'`** → set ข้อความเก่าทั้งหมดขึ้นจอ (คนที่เข้าห้องทีหลังเห็นข้อความก่อนหน้าได้)
5. **client รับ `'user joined'`** → แสดง toast แจ้งเตือนว่ามีคนเข้าห้อง
6. **user พิมพ์ข้อความ ส่ง** → client `emit('chat message', msg)`
7. **server รับ `'chat message'`** → เก็บลง `messageHistory`, แล้ว `io.emit('chat message', msg)` กระจายให้ทุกคนรวมคนส่งเอง
8. **user ปิดแท็บ/เน็ตหลุด** → server ได้ event `'disconnect'` อัตโนมัติ → `broadcast.emit('user left', ...)` แจ้งคนอื่น

## สรุปตาราง: `emit` แบบไหนส่งไปหาใคร (ฝั่ง server)

| คำสั่ง | ส่งไปหาใคร |
|---|---|
| `socket.emit(...)` | ตัวเองคนเดียว (คนที่ trigger event) |
| `io.emit(...)` | ทุกคน รวมตัวเอง |
| `socket.broadcast.emit(...)` | ทุกคน **ยกเว้น**ตัวเอง |

รายละเอียดฟังก์ชันแบบเจาะลึก (พร้อมโค้ดจริงทุกบรรทัด) อยู่ใน README ของแต่ละฝั่ง: [backend](./realtime-chat-backend/README.md) / [frontend](./realtime-chat-frontend/README.md)

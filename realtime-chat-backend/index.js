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

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname + '/public'));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

const MAX_HISTORY = 50;
const messageHistory = [];

io.on('connection', (socket) => {
  console.log('A user connected');

  socket.on('join', (user) => {
    socket.data.user = user;
    socket.emit('chat history', messageHistory);
    socket.broadcast.emit('user joined', user);
  });

  socket.on('chat message', (msg) => {
    messageHistory.push(msg);
    if (messageHistory.length > MAX_HISTORY) messageHistory.shift();
    io.emit('chat message', msg);
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected');
    if (socket.data.user) {
      socket.broadcast.emit('user left', socket.data.user);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
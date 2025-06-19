require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const authRoutes = require('./routes/auth');
const messageRoutes = require('./routes/messages');
const User = require('./models/User');

const app = express();
const PORT = 5000;

// Create HTTP server and Socket.IO server
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(bodyParser.json());

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Auth (OTP, login)
app.use('/', authRoutes);

app.post('/check-contacts', async (req, res) => {
  const { phoneNumbers } = req.body;
  const users = await User.find({ phone: { $in: phoneNumbers } });
  const registered = users.map(u => u.phone);
  res.json({ registered });
});

// Contacts (all users except self)
app.get('/contacts/:phone', async (req, res) => {
  const users = await User.find().sort({ name: 1 }); // No filter!
  const contacts = users.map(u => ({
    id: u._id,
    name: u.name,
    phoneNumbers: [{ number: u.phone }]
  }));
  res.json(contacts);
});

// Messages
app.use('/messages', messageRoutes);
app.get('/', (req, res) => {
  res.send('Chatbot server is running!');
});

// --- Socket.IO logic ---
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Listen for send-message event from clients
  socket.on('send-message', (msg) => {
    // Broadcast to all clients (or use rooms for private chats)
    io.emit('receive-message', msg);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Start both HTTP and Socket.IO server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// app.listen(PORT, '0.0.0.0', () => {
//   console.log(`Server running on http://localhost:${PORT}`);
// });
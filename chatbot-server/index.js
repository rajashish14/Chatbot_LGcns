require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const socketio = require('socket.io');
const path = require('path');
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
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.set('io', io);
app.use('/messages', messageRoutes);

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
  try {
    const users = await User.find().sort({ name: 1 });
    const contacts = users.map(u => ({
      id: u._id,
      name: u.name,
      phoneNumbers: [{ number: u.phone }],
      online: u.online,
      lastSeen: u.lastSeen,
    }));
    res.json(contacts);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

// Messages
app.use('/messages', messageRoutes);
app.get('/', (req, res) => {
  res.send('Chatbot server is running!');
});

// Socket.io logic
const onlineUsers = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Enhanced online status handlers
  socket.on('user-online', (userId) => {
    console.log(`Setting user ${userId} online`);
    onlineUsers.set(userId, {
      socketId: socket.id,
      lastSeen: new Date(),
      isOnline: true
    });
    
    // Update database
    User.findOneAndUpdate(
      { phone: userId }, 
      { online: true, lastSeen: new Date() }
    ).catch(err => console.error('Error updating user online status:', err));
    
    socket.broadcast.emit('user-online', { userId });
  });

  socket.on('user-offline', (userId) => {
    console.log(`Setting user ${userId} offline`);
    const user = onlineUsers.get(userId);
    const lastSeenTime = new Date();
    
    if (user) {
      user.isOnline = false;
      user.lastSeen = lastSeenTime;
      onlineUsers.set(userId, user);
    } else {
      // Create entry if doesn't exist
      onlineUsers.set(userId, {
        socketId: socket.id,
        lastSeen: lastSeenTime,
        isOnline: false
      });
    }
    
    // Update database
    User.findOneAndUpdate(
      { phone: userId }, 
      { online: false, lastSeen: lastSeenTime }
    ).catch(err => console.error('Error updating user offline status:', err));
    
    socket.broadcast.emit('user-offline', { 
      userId, 
      lastSeen: lastSeenTime.toISOString() 
    });
  });

  socket.on('user-heartbeat', (userId) => {
    const user = onlineUsers.get(userId);
    if (user) {
      user.lastSeen = new Date();
      user.isOnline = true;
      onlineUsers.set(userId, user);
    } else {
      // Create entry if doesn't exist
      onlineUsers.set(userId, {
        socketId: socket.id,
        lastSeen: new Date(),
        isOnline: true
      });
    }
  });

  socket.on('get-online-users', () => {
    const onlineUserIds = Array.from(onlineUsers.entries())
      .filter(([_, user]) => user && user.isOnline)
      .map(([userId, _]) => userId);
    
    socket.emit('online-users', { users: onlineUserIds });
  });

  socket.on('get-user-last-seen', async (userId) => {
    console.log(`Getting last seen for user: ${userId}`);
    
    let user = onlineUsers.get(userId);
    
    // If not in memory, try to get from database
    if (!user) {
      try {
        const dbUser = await User.findOne({ phone: userId });
        if (dbUser) {
          user = {
            socketId: null,
            lastSeen: dbUser.lastSeen || new Date(),
            isOnline: dbUser.online || false
          };
          // Cache in memory
          onlineUsers.set(userId, user);
        }
      } catch (err) {
        console.error('Error fetching user from database:', err);
      }
    }
    
    if (user && user.lastSeen) {
      socket.emit('user-last-seen', { 
        userId, 
        lastSeen: user.lastSeen.toISOString(),
        isOnline: user.isOnline || false
      });
    } else {
      // Fallback - send current time as last seen
      socket.emit('user-last-seen', { 
        userId, 
        lastSeen: new Date().toISOString(),
        isOnline: false
      });
    }
  });

  // Join user to their own room
  socket.on('join-room', (phoneNumber) => {
    socket.join(phoneNumber);
    console.log(`User ${phoneNumber} joined room`);
    
    // Set user online in memory
    onlineUsers.set(phoneNumber, {
      socketId: socket.id,
      lastSeen: new Date(),
      isOnline: true
    });
    
    // Update user online status in database
    User.findOneAndUpdate(
      { phone: phoneNumber }, 
      { online: true, lastSeen: new Date() }
    )
    .then(() => {
      socket.broadcast.emit('user-online', { userId: phoneNumber });
    })
    .catch(err => console.error('Error updating user online status:', err));
  });

  // Legacy join event (for backward compatibility)
  socket.on('join', async userId => {
    socket.join(userId);
    onlineUsers.set(userId, {
      socketId: socket.id,
      lastSeen: new Date(),
      isOnline: true
    });
    
    try {
      await User.findOneAndUpdate({ phone: userId }, { online: true, lastSeen: new Date() });
      socket.broadcast.emit('user-online', { userId });
    } catch (err) {
      console.error('Error in legacy join:', err);
    }
  });

  // Typing indicator
  socket.on('typing', ({ from, to }) => {
    console.log(`Typing: ${from} -> ${to}`);
    io.to(to).emit('typing', { from });
  });

  // Stop typing indicator
  socket.on('stop-typing', ({ from, to }) => {
    console.log(`Stop typing: ${from} -> ${to}`);
    io.to(to).emit('stop-typing', { from });
  });

  // Handle disconnect
  socket.on('disconnect', async () => {
    console.log('User disconnected:', socket.id);
    
    try {
      // Find user by socket ID and mark offline
      for (let [userId, userInfo] of onlineUsers.entries()) {
        if (userInfo && userInfo.socketId === socket.id) {
          const lastSeenTime = new Date();
          
          // Update memory
          userInfo.isOnline = false;
          userInfo.lastSeen = lastSeenTime;
          onlineUsers.set(userId, userInfo);
          
          // Update database
          await User.findOneAndUpdate(
            { phone: userId },
            { online: false, lastSeen: lastSeenTime }
          );
          
          // Broadcast offline status
          socket.broadcast.emit('user-offline', { 
            userId, 
            lastSeen: lastSeenTime.toISOString() 
          });
          
          console.log(`User ${userId} went offline`);
          break;
        }
      }
    } catch (err) {
      console.error('Error handling disconnect:', err);
    }
  });
});

// Start both HTTP and Socket.IO server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
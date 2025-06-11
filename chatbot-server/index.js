require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const app = express();
const PORT = 5000;

app.use(cors());
app.use(bodyParser.json());

// MongoDB connection
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

const userSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  name: { type: String, required: true }
});

const messageSchema = new mongoose.Schema({
  from: String,
  to: String,
  text: String,
  timestamp: Number,
  editableUntil: Number,
  deletedBy: [String],
});

const User = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);


// Register/Login
app.post('/login', async (req, res) => {
  const { phone, name } = req.body;
  let user = await User.findOne({ phone });
  if (!user) {
    user = await User.create({ phone, name });
  }
  res.json({ success: true, user });
});
app.get('/', (req, res) => {
  res.send('Chatbot server is running!');
});

// Get contacts (all users except self)
app.get('/contacts/:phone', async (req, res) => {
  const { phone } = req.params;
  const users = await User.find({ phone: { $ne: phone } }).sort({ name: 1 });
  res.json(users);
});

// Get chat history between two users
app.get('/messages/:from/:to', async (req, res) => {
  const { from, to } = req.params;
  const chat = await Message.find({
    $or: [
      { from, to },
      { from: to, to: from }
    ]
  }).sort({ timestamp: 1 });
  // Exclude messages deleted by requester
  const filtered = chat.filter(msg => !(msg.deletedBy && msg.deletedBy.includes(from)));
  res.json(filtered);
});

// Send message
app.post('/messages', async (req, res) => {
  const { from, to, text } = req.body;
  const now = Date.now();
  await Message.create({
    from,
    to,
    text,
    timestamp: now,
    editableUntil: now + 60 * 1000,
    deletedBy: [],
  });
  res.json({ success: true });
});

// Edit message (only within 1 minute, only by sender)
app.put('/messages/edit', async (req, res) => {
  const { from, to, timestamp, newText } = req.body;
  const msg = await Message.findOne({ from, to, timestamp });
  if (!msg) return res.status(404).json({ error: 'Message not found' });
  if (Date.now() > msg.editableUntil) return res.status(403).json({ error: 'Edit time expired' });
  msg.text = newText;
  await msg.save();
  res.json({ success: true });
});

// Delete message for self (any time)
app.put('/messages/delete-for-me', async (req, res) => {
  const { from, to, timestamp, user } = req.body;
  const msg = await Message.findOne({ 
    $or: [
      { from, to, timestamp },
      { from: to, to: from, timestamp }
    ]
  });
  if (!msg) return res.status(404).json({ error: 'Message not found' });
  if (!msg.deletedBy.includes(user)) {
    msg.deletedBy.push(user);
    await msg.save();
  }
  res.json({ success: true });
});
// Delete message for everyone (within 30 minutes, only by sender)
app.put('/messages/delete-for-everyone', async (req, res) => {
  const { from, to, timestamp } = req.body;
  // Find the message sent by 'from' at the given timestamp
  const msg = await Message.findOne({ from, to, timestamp });
  if (!msg) return res.status(404).json({ error: 'Message not found' });
  if (Date.now() - msg.timestamp > 30 * 60 * 1000) {
    return res.status(403).json({ error: 'Delete for everyone expired' });
  }
  await Message.deleteOne({ _id: msg._id });
  res.json({ success: true });
});
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
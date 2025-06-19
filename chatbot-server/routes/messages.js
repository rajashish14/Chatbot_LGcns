const express = require('express');
const router = express.Router();
const Message = require('../models/Message');

// Get chat history between two users
router.get('/:from/:to', async (req, res) => {
  try {
    const { from, to } = req.params;
    const chat = await Message.find({
      $or: [
        { from, to },
        { from: to, to: from }
      ]
    }).sort({ timestamp: 1 });
    const filtered = chat.filter(msg => !(msg.deletedBy && msg.deletedBy.includes(from)));
    res.json(filtered);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Send message
router.post('/', async (req, res) => {
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
router.put('/edit', async (req, res) => {
  const { from, to, timestamp, newText } = req.body;
  const msg = await Message.findOne({ from, to, timestamp });
  if (!msg) return res.status(404).json({ error: 'Message not found' });
  if (Date.now() > msg.editableUntil) return res.status(403).json({ error: 'Edit time expired' });
  msg.text = newText;
  await msg.save();
  res.json({ success: true });
});

// Delete message for self (any time)
router.put('/delete-for-me', async (req, res) => {
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
router.put('/delete-for-everyone', async (req, res) => {
  const { from, to, timestamp } = req.body;
  const msg = await Message.findOne({ from, to, timestamp });
  if (!msg) return res.status(404).json({ error: 'Message not found' });
  if (Date.now() - msg.timestamp > 30 * 60 * 1000) {
    return res.status(403).json({ error: 'Delete for everyone expired' });
  }
  await Message.deleteOne({ _id: msg._id });
  res.json({ success: true });
});

module.exports = router;
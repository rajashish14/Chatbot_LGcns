const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const Message = require('../models/Message');
const User = require('../models/User');
const upload = multer({ dest: 'uploads/' });

// Send a message
router.post('/', upload.single('media'), async (req, res) => {
  try {
    const { from, to, text, replyTo, groupId, forwardOf } = req.body;
    const mediaUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const newMsg = new Message({
      from,
      to,
      text,
      replyTo,
      groupId,
      forwardOf,
      mediaUrl,
      timestamp: Date.now(),
      status: 'sent'
    });

    await newMsg.save();

    const io = req.app.get('io');
    if (groupId) {
      io.to(groupId).emit('receive-message', newMsg);
    } else {
      // Check if receiver is online for delivery status
      const receiverSocket = io.sockets.adapter.rooms.get(to);
      if (receiverSocket && receiverSocket.size > 0) {
        newMsg.status = 'delivered';
        await newMsg.save();
      }
      
      // Only emit to receiver (sender will get it from their own UI update)
      io.to(to).emit('receive-message', newMsg);
      
       // Send delivery status to sender if receiver is online
      if (receiverSocket && receiverSocket.size > 0) {
        io.to(from).emit('message-status-update', { 
          _id: newMsg._id,
          timestamp: newMsg.timestamp, 
          status: 'delivered' 
        });
      }
    }

    res.json(newMsg);
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ error: 'Send failed' });
  }
});

// Update message to seen
router.post('/seen', async (req, res) => {
  const { messageIds, user } = req.body;
  
  try {
    await Message.updateMany(
      { _id: { $in: messageIds }, to: user },
      { $set: { status: 'seen' } }
    );
    
    // Notify sender(s) - get updated messages
    const msgs = await Message.find({ _id: { $in: messageIds } });
    const io = req.app.get('io');
    
    msgs.forEach(msg => {
      io.to(msg.from).emit('message-status-update', { 
        _id: msg._id,
        timestamp: msg.timestamp, 
        status: 'seen' 
      });
    });
    
    res.json({ ok: true });
  } catch (error) {
    console.error('Error updating seen status:', error);
    res.status(500).json({ error: 'Failed to update seen status' });
  }
});

// Typing Indicator
router.post('/typing', (req, res) => {
  const { from, to } = req.body;
  req.app.get('io').to(to).emit('typing', { from });
  res.json({ ok: true });
});

// Edit message
router.put('/edit', async (req, res) => {
  const { from, to, timestamp, newText } = req.body;
  const msg = await Message.findOneAndUpdate(
    { from, to, timestamp },
    { $set: { text: newText, edited: true } },
    { new: true }
  );
  if (msg) {
    req.app.get('io').to(to).emit('message-edited', msg);
    res.json(msg);
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// Delete for me
router.put('/delete-for-me', async (req, res) => {
  const { user, timestamp } = req.body;
  const msg = await Message.findOne({ timestamp });
  if (msg && !msg.hiddenFor.includes(user)) {
    msg.hiddenFor.push(user);
    await msg.save();
  }
  res.json({ ok: true });
});

// Delete for everyone
router.put('/delete-for-everyone', async (req, res) => {
  const { timestamp } = req.body;
  const msg = await Message.findOneAndUpdate(
    { timestamp },
    { $set: { text: 'This message was deleted', deletedForEveryone: true } },
    { new: true }
  );
  if (msg) {
    req.app.get('io').to(msg.to).emit('message-deleted', msg);
    res.json({ ok: true });
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// Get all messages (1-1 or group)
router.get('/:user1/:user2', async (req, res) => {
  const { user1, user2 } = req.params;
  try {
    const messages = await Message.find({
      $or: [
        { from: user1, to: user2 },
        { from: user2, to: user1 },
        { groupId: user2 },
      ],
    }).sort({ timestamp: 1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Fetch failed' });
  }
});

module.exports = router;

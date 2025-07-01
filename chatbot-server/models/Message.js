const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  from: { type: String, required: true },
  to: { type: String }, // for 1-1 chat
  groupId: { type: String }, // for group chat
  text: { type: String },
  timestamp: { type: Number, default: Date.now },
  mediaUrl: { type: String, default: null },
  status: { type: String, enum: ['sent', 'delivered', 'seen'], default: 'sent' },
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
  forwardOf: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
  deletedForEveryone: { type: Boolean, default: false },
  hiddenFor: { type: [String], default: [] }, // "delete for me" users
  edited: { type: Boolean, default: false },
});

module.exports = mongoose.model('Message', messageSchema);
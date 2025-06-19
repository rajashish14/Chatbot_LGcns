const mongoose = require('mongoose');
const messageSchema = new mongoose.Schema({
  from: String,
  to: String,
  text: String,
  timestamp: Number,
  editableUntil: Number,
  deletedBy: [String],
});
module.exports = mongoose.model('Message', messageSchema);
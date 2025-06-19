const mongoose = require('mongoose');
const userSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email:{ type: String, unique: true, sparse: true },
});
module.exports = mongoose.model('User', userSchema);
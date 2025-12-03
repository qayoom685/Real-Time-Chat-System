// models/Message.js
const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  from: { type: String, required: true },      // sender user id
  to: { type: String, default: null },         // recipient user id (null for room)
  room: { type: String, default: null },       // room name (null for private)
  content: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Message", messageSchema);

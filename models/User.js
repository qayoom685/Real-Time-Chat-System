// models/User.js
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  socketId: { type: String }, // last active socket
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("User", userSchema);

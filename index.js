// server.js
require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const path = require("path");

const User = require("./models/User");
const Message = require("./models/Message");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --- REST APIs (history) ---

// get room history
app.get("/api/rooms/:room/messages", async (req, res) => {
  const { room } = req.params;
  const messages = await Message.find({ room })
    .sort({ createdAt: 1 })
    .limit(100);
  res.json(messages);
});

// get private history between two users (userA,userB are user ids)
app.get("/api/private/:userA/:userB/messages", async (req, res) => {
  const { userA, userB } = req.params;
  const messages = await Message.find({
    $or: [
      { from: userA, to: userB },
      { from: userB, to: userA },
    ],
  })
    .sort({ createdAt: 1 })
    .limit(200);
  res.json(messages);
});

// --- Socket.IO real-time logic ---

// keep in-memory map: userId -> socketId (for demo). In prod use Redis for scaling.
const onlineUsers = new Map();

io.on("connection", (socket) => {
  console.log("socket connected:", socket.id);

  // Register user (client should emit 'register' with { userId, name })
  socket.on("register", async ({ userId, name }) => {
    // save or update user
    let user = null;
    if (userId) {
      user = await User.findByIdAndUpdate(
        userId,
        { socketId: socket.id, name },
        { new: true }
      );
    }
    if (!user) {
      user = await User.create({ name, socketId: socket.id });
    }
    onlineUsers.set(user._id.toString(), socket.id);
    socket.userId = user._id.toString();
    socket.emit("registered", { userId: user._id.toString(), name: user.name });
    io.emit("presence", Array.from(onlineUsers.keys())); // broadcast presence
  });

  // Join a room
  socket.on("joinRoom", (room) => {
    socket.join(room);
    socket.currentRoom = room;
    socket.emit("joinedRoom", room);
  });

  // Leave a room
  socket.on("leaveRoom", (room) => {
    socket.leave(room);
    if (socket.currentRoom === room) socket.currentRoom = null;
  });

  // Room message (broadcast to room)
  socket.on("roomMessage", async ({ room, content }) => {
    if (!socket.userId) return socket.emit("error", "Not registered");
    const msg = await Message.create({ from: socket.userId, room, content });
    io.to(room).emit("newRoomMessage", msg);
  });

  // Private message (to specific userId)
  socket.on("privateMessage", async ({ toUserId, content }) => {
    if (!socket.userId) return socket.emit("error", "Not registered");
    const msg = await Message.create({
      from: socket.userId,
      to: toUserId,
      content,
    });
    // send to recipient if online
    const targetSocketId = onlineUsers.get(toUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit("newPrivateMessage", msg);
    }
    // also send to sender
    socket.emit("newPrivateMessage", msg);
  });

  socket.on("disconnect", async () => {
    const uid = socket.userId;
    if (uid) {
      onlineUsers.delete(uid);
      // optionally clear socketId in DB
      await User.findByIdAndUpdate(uid, { socketId: null });
      io.emit("presence", Array.from(onlineUsers.keys()));
    }
    console.log("socket disconnected:", socket.id);
  });
});

// --- connect to MongoDB and start server --
const PORT = process.env.PORT || 3000;
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
    server.listen(PORT, () => console.log(`Server running on ${PORT}`));
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
  });

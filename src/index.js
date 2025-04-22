const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

const generateText = () =>
  "Typing speed is the measurement of how fast someone can type words accurately in a given period.";

const rooms = {};

io.on("connection", (socket) => {
  console.log("🔌 New user connected:", socket.id);

  // Create a new room
  socket.on("create_game", (username, callback) => {
    const roomId = Math.random().toString(36).substring(2, 8);
    const text = generateText();
    rooms[roomId] = {
      players: {},
      text,
      startTime: null,
    };
    callback(roomId); // send room ID to client
  });

  // Join existing room
  socket.on("join_game", ({ username, roomId }) => {
    const room = rooms[roomId];
    if (!room) return;

    socket.join(roomId);
    room.players[socket.id] = {
      username,
      progress: 0,
      typedText: "",
      finished: false,
      startTypingTime: null,
      wpm: 0,
    };
    socket.roomId = roomId;

    socket.emit("text", room.text);
    io.to(roomId).emit("players_update", room.players);

    // Start countdown when 2+ players
    if (Object.keys(room.players).length >= 2 && !room.startTime) {
      room.startTime = Date.now();
      io.to(roomId).emit("start_timer", room.startTime);
    }
  });

  // Handle player progress
  socket.on("progress", ({ typedText }) => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room || !room.players[socket.id]) return;

    const player = room.players[socket.id];
    const correctText = room.text;

    // WPM calculation
    if (!player.startTypingTime) {
      player.startTypingTime = Date.now();
    }

    player.typedText = typedText;
    player.progress = typedText.length / correctText.length;

    const timeSpentMin = (Date.now() - player.startTypingTime) / 60000;
    const wordsTyped = typedText.trim().split(/\s+/).length;
    player.wpm = Math.floor(wordsTyped / timeSpentMin);

    const isCorrect = correctText.startsWith(typedText);
    socket.emit("typing_feedback", { isCorrect });

    io.to(roomId).emit("players_update", room.players);

    // If finished
    if (typedText === correctText && !player.finished) {
      player.finished = true;
      io.to(roomId).emit("game_finished", {
        winner: player.username,
        wpm: player.wpm,
      });
    }
  });

  // Restart game
  socket.on("restart_game", (roomId) => {
    const room = rooms[roomId];
    if (!room) return;

    room.text = generateText();
    room.startTime = null;

    for (const id in room.players) {
      room.players[id].progress = 0;
      room.players[id].typedText = "";
      room.players[id].finished = false;
      room.players[id].startTypingTime = null;
      room.players[id].wpm = 0;
    }

    io.to(roomId).emit("text", room.text);
    io.to(roomId).emit("restart");
    io.to(roomId).emit("players_update", room.players);
  });

  socket.on("disconnect", () => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (room) {
      delete room.players[socket.id];
      io.to(roomId).emit("players_update", room.players);

      if (Object.keys(room.players).length === 0) {
        delete rooms[roomId]; // cleanup
      }
    }
    console.log("❌ User disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));

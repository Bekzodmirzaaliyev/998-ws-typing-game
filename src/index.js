const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const text =
  "Typing Race is a real-time multiplayer game where users compete by typing the given text as fast and accurately as possible.";
const rooms = {};

function createRoomId() {
  return Math.random().toString(36).substring(2, 8);
}

io.on("connection", (socket) => {
  socket.on("join_game", (username) => {
    let roomId = Object.keys(rooms).find(
      (id) => Object.keys(rooms[id].players).length < 4
    );

    if (!roomId) {
      roomId = createRoomId();
      rooms[roomId] = { players: {}, text, startTime: null };
    }

    socket.join(roomId);
    rooms[roomId].players[socket.id] = {
      username,
      progress: 0,
      typedText: "",
      finished: false,
      startTypingTime: null,
      wpm: 0,
    };
    socket.roomId = roomId;

    socket.emit("text", rooms[roomId].text);
    io.to(roomId).emit("players_update", rooms[roomId].players);

    if (
      Object.keys(rooms[roomId].players).length >= 2 &&
      !rooms[roomId].startTime
    ) {
      rooms[roomId].startTime = Date.now();
      io.to(roomId).emit("start_timer", rooms[roomId].startTime);
    }
  });

  socket.on("progress", ({ typedText }) => {
    const roomId = socket.roomId;
    if (!roomId || !rooms[roomId]) return;

    const player = rooms[roomId].players[socket.id];
    if (!player) return;

    const correctText = rooms[roomId].text;

    // ✅ Запуск времени при первом вводе
    if (!player.startTypingTime && typedText.length === 1) {
      player.startTypingTime = Date.now();
    }

    // Проверка: текст должен точно совпадать
    const isCorrect = correctText.slice(0, typedText.length) === typedText;
    socket.emit("typing_feedback", { isCorrect });

    player.typedText = typedText;
    player.progress = Math.min(typedText.length / correctText.length, 1);

    // ✅ Расчёт WPM (слова/минуту)
    const minutes = (Date.now() - player.startTypingTime) / 60000;
    const wordCount = typedText.trim().split(/\s+/).length;
    player.wpm = minutes > 0 ? Math.floor(wordCount / minutes) : 0;

    io.to(roomId).emit("players_update", rooms[roomId].players);

    if (typedText === correctText && !player.finished) {
      player.finished = true;
      io.to(roomId).emit("game_finished", {
        winner: player.username,
        wpm: player.wpm,
      });
    }
  });

  socket.on("restart_game", (roomId) => {
    if (rooms[roomId]) {
      Object.keys(rooms[roomId].players).forEach((id) => {
        rooms[roomId].players[id].progress = 0;
        rooms[roomId].players[id].typedText = "";
        rooms[roomId].players[id].finished = false;
        rooms[roomId].players[id].startTypingTime = null;
        rooms[roomId].players[id].wpm = 0;
      });
      rooms[roomId].startTime = Date.now();
      io.to(roomId).emit("text", rooms[roomId].text);
      io.to(roomId).emit("players_update", rooms[roomId].players);
      io.to(roomId).emit("restart");
      io.to(roomId).emit("start_timer", rooms[roomId].startTime);
    }
  });

  socket.on("disconnect", () => {
    const roomId = socket.roomId;
    if (roomId && rooms[roomId]) {
      delete rooms[roomId].players[socket.id];
      io.to(roomId).emit("players_update", rooms[roomId].players);
      if (Object.keys(rooms[roomId].players).length === 0) {
        delete rooms[roomId];
      }
    }
  });
});

server.listen(3000, () =>
  console.log("Server running on http://localhost:3000")
);

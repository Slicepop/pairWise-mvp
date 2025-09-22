import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server } from "socket.io";

const app = express();
const server = createServer(app);

// This allows regular REST requests (optional)
const FRONTEND_URLS = [
  "http://localhost:5173", // local dev
  "https://pairwise.vercel.app", // deployed frontend
];

app.use(
  cors({
    origin: FRONTEND_URLS,
    methods: ["GET", "POST"],
    credentials: true,
  })
);

const io = new Server(server, {
  cors: {
    origin: FRONTEND_URLS,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("chat message", (msg) => {
    io.emit("chat message", msg);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

server.listen(3000, () => {
  console.log("Server running on https://pairwise-backend.onrender.com");
});

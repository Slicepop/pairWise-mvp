import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server } from "socket.io";

const app = express();
const server = createServer(app);

app.use(
  cors({
    origin: "https://pair-wise-mvp.vercel.app", // frontend URL
    methods: ["GET", "POST"],
    credentials: true,
  })
);

const io = new Server(server, {
  cors: {
    origin: "https://pair-wise-mvp.vercel.app", // frontend URL
    methods: ["GET", "POST"],
    credentials: true,
  },
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-thread", (threadId) => {
    socket.join(threadId);
  });

  socket.on("editor-change", ({ threadId, content }) => {
    // Broadcast to everyone else in the same thread
    socket.to(threadId).emit("editor-update", content);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

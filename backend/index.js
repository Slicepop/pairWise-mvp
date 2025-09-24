import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server } from "socket.io";

const app = express();
const server = createServer(app);

app.use(
  cors({
    origin: "https://pair-wise-mvp.vercel.app",
    methods: ["GET", "POST"],
    credentials: true,
  })
);

// Optional root route for testing
app.get("/", (req, res) => res.send("Socket.IO server running!"));

const io = new Server(server, {
  path: "/socket.io",
  cors: {
    origin: "https://pair-wise-mvp.vercel.app",
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
    socket.to(threadId).emit("editor-update", content);
  });

  socket.on("disconnect", () => console.log("User disconnected:", socket.id));
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

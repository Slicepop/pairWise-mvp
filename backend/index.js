import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server } from "socket.io";

const app = express();
const server = createServer(app);

app.use(
  cors({
    origin: "http://localhost:5174",
    // origin: "https://pair-wise-mvp.vercel.app",
    methods: ["GET", "POST"],
    credentials: true,
  })
);

app.get("/", (req, res) => res.send("Socket.IO server running!"));

const io = new Server(server, {
  path: "/socket.io",

  cors: {
    origin: "http://localhost:5174",
    // origin: "https://pair-wise-mvp.vercel.app",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join_session", (data) => {
    const sessionID = data.sessionUUID;

    socket.join(sessionID);
    console.log(`Socket ${socket.id} joined room ${sessionID}`);
    console.log("data changed: ", data.dataChanged);
    socket.to(sessionID).emit("user_joined", { userID: socket.id });
  });

  socket.on("disconnect", () => console.log("User disconnected:", socket.id));
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

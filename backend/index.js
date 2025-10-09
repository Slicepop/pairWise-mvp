import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server } from "socket.io";

const app = express();
const server = createServer(app);

app.use(
  cors({
    // origin: "http://localhost:5174",
    origin: "https://pair-wise.vercel.app",
    methods: ["GET", "POST"],
    credentials: true,
  })
);

app.get("/", (req, res) => res.send("Socket.IO server running!"));

const io = new Server(server, {
  path: "/socket.io",

  cors: {
    // origin: "http://localhost:5174",
    origin: "https://pair-wise.vercel.app",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join_session", (data) => {
    const sessionID = data.sessionID;

    socket.join(sessionID);
    console.log(`Socket ${socket.id} joined room ${sessionID}`);

    socket.to(sessionID).emit("user_joined", { userID: socket.id });
  });
  try {
    socket.on("editorChange", (event) => {
      const sessionID = event.sessionID;
      if (!sessionID || !socket.rooms.has(sessionID)) {
        console.error(
          `Socket ${socket.id} tried to send change without being in room ${sessionID}`
        );
        return;
      }
      socket
        .to(sessionID)
        .emit("remote_editorChange", { changedData: event.dataChanged });
      // console.log("data changed: ", event.dataChanged);
    });
    socket.on("cursorChange", (event) => {
      const sessionID = event.sessionID;
      if (!sessionID || !socket.rooms.has(sessionID)) {
        console.error(
          `Socket ${socket.id} tried to send change without being in room ${sessionID}`
        );
        return;
      }
      socket.to(sessionID).emit("remote_cursorChange", {
        lineNumber: event.lineNumber,
        column: event.column,
      });
      console.log("cursor change", event.lineNumber, event.column);
    });
  } catch (e) {
    console.log(e);
  }

  socket.on("disconnect", () => console.log("User disconnected:", socket.id));
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server } from "socket.io";

const app = express();
const server = createServer(app);
import dotenv from "dotenv";
dotenv.config();
const FRONTED_URL = "http://localhost:5173";
// const FRONTED_URL = "https://pair-wise.vercel.app";
app.use(
  cors({
    // origin: FRONTED_URL,
    origin: "http://localhost:5173",

    methods: ["GET", "POST"],
    credentials: true,
  })
);

app.get("/", (req, res) => res.send("Socket.IO server running!"));
const url =
  "https://judge0-ce.p.rapidapi.com/submissions?base64_encoded=false&wait=true";

const io = new Server(server, {
  path: "/socket.io",

  cors: {
    // origin: FRONTED_URL,
    origin: "http://localhost:5173",

    methods: ["GET", "POST"],
    credentials: true,
  },
});

async function runCode(text, language_id) {
  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-RapidAPI-Key": process.env.JUDGE0_RAPIDAPI_KEY,
      "X-RapidAPI-Host": "judge0-ce.p.rapidapi.com",
    },
    body: JSON.stringify({
      source_code: text,
      language_id: language_id,
    }),
  };
  const res = await fetch(url, options);
  const result = await res.json();
  console.log("result", result);
  if (result.stderr)
    return {
      type: "error",
      result: result.stderr,
      time: result.time,
    };
  if (result.compile_output)
    return {
      type: "return",

      result: result.compile_output,
      time: result.time,
    };
  if (result.stdout)
    return {
      type: "return",

      result: result.stdout,
      time: result.time,
    };
  return {
    result: result,
    time: result.time,
  };
}
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join_session", (data) => {
    const sessionID = data.sessionID;

    socket.join(sessionID);
    console.log(`Socket ${socket.id} joined room ${sessionID}`);

    socket.to(sessionID).emit("user_joined", { userID: socket.id });
  });
  socket.on("send_document", (event) => {
    // console.log(event.document);
    socket.to(event.sessionID).emit("update_document", {
      sessionID: event.sessionID,
      document: event.document,
    });
  });
  socket.on("sync_document", (event) => {
    // console.log(event.document);
    socket.to(event.sessionID).emit("remote_sync_document", {
      sessionID: event.sessionID,
      document: event.document,
    });
  });
  socket.on("Mentor_Show_Student_AI", (event) => {
    console.log("show student", event.message);
    socket.to(event.sessionID).emit("Student_Show_AI", {
      sessionID: event.sessionID,
      message: event.message,
    });
  });

  socket.on("initiate_code_execution", async (event) => {
    console.log("code execution initiated", event.document);
    io.to(event.sessionID).emit("code_running", {
      sessionID: event.sessionID,
    });
    console.log("code running");
    const output = await runCode(event.document, event.language_id);
    io.to(event.sessionID).emit("code_execution_output", {
      sessionID: event.sessionID,
      output: output,
    });
    console.log("code ran");
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
        startLineNumber: event.startLineNumber,
        startColumn: event.startColumn,
        endLineNumber: event.endLineNumber,
        endColumn: event.endColumn,
      });
      console.log("cursor change", event);
    });
  } catch (e) {
    console.log(e);
  }

  socket.on("disconnect", () => console.log("User disconnected:", socket.id));
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

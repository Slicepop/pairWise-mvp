import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server } from "socket.io";

const app = express();
const server = createServer(app);
import dotenv from "dotenv";
dotenv.config();
const FRONTED_URL = "http://localhost:5173";
const apiKey = process.env.OPENROUTER_API_KEY;
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

async function runCode(text, language_id, stdin) {
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
      stdin: stdin,
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
  socket.on("run_LLM", async (event) => {
    console.log("run_LLM");
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + apiKey,
          "HTTP-Referer": "<YOUR_SITE_URL>", // Optional. Site URL for rankings on openrouter.ai.
          "X-Title": "<YOUR_SITE_NAME>", // Optional. Site title for rankings on openrouter.ai.
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "meta-llama/llama-3.3-8b-instruct:free",
          messages: [
            {
              role: "system",
              content: `You are an expert, friendly coding mentor for a brand new software engineering student.

A mentor is going to give you a student's code and an error message. Your job is to create a hint for the student, and your entire response must be plain text.

CRITICAL RULES:

DO NOT use any markdown.

DO NOT use backticks (, triple backticks, or hash symbols (#).

DO NOT provide the complete, corrected code. Never fix the student's code for them.

DO NOT USE EMOJIS NOR TABLES

BE ENCOURAGING. The student is a beginner. Use a positive and helpful tone.

Format your response clearly using line breaks, not markdown headings.

YOUR RESPONSE MUST FOLLOW THIS PLAIN TEXT STRUCTURE:

What This Error Means: (In 1 simple sentence, explain the error message.)

Your Hint: (Give a small, direct hint. Point them to the right line or concept. For example, "Take a close look at the text inside your console.log() on line 2. Did you remember to close your string?") OR USE an Example of Correct Syntax: (If relevant, provide a generic example of the correct syntax. DO NOT use the student's code in this example. Just write the code example as plain text.)`,
            },
            {
              role: "user",
              content:
                "Student submitted: in the language  \n " +
                event.language +
                event.output,
            },
          ],
        }),
      }
    );
    const data = await response.json();
    if (!response.ok) {
      console.error(data);
    }
    socket.emit("LLM_Response", {
      sessionID: event.sessionID,
      response: data.choices?.[0]?.message?.content,
    });
  });
  socket.on("initiate_code_execution", async (event) => {
    console.log("code execution initiated", event.document);
    io.to(event.sessionID).emit("code_running", {
      sessionID: event.sessionID,
    });
    console.log("code running");
    const output = await runCode(
      event.document,
      event.language_id,
      event.stdin
    );
    console.log("stdin", event.stdin);
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
    socket.on("update_Input", (event) => {
      const sessionID = event.sessionID;
      console.log(event.stdinList);
      socket.to(sessionID).emit("remote_update_Input", {
        sessionID: sessionID,
        stdinList: event.stdinList,
      });
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

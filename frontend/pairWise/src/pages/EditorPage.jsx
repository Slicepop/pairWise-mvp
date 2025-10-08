import Editor from "@monaco-editor/react";
import { io, Socket } from "socket.io-client";

export default function EditorPage() {
  const sessionID = window.location.pathname.split("/")[2];

  function editorInit(editor) {
    const socket = io("http://localhost:10000");
    socket.on("connect", () => {
      console.log("Connected to Socket.IO server");
    });
    socket.io.on("error", (error) => {
      console.error(error);
    });

    editor.onDidChangeModelContent((e) => {
      socket.emit("join_session", {
        sessionUUID: sessionID,
        dataChanged: e.changes[0],
      });
    });
  }

  return (
    <>
      <div className="relative h-screen bg-gray-700">
        <div className="flex-1">
          <Editor
            width="85vw"
            height="92vh"
            defaultLanguage="javascript"
            theme="vs-dark"
            value={"editorContent"}
            // onChange={handleEditorChange}
            onMount={(editor) => {
              editorInit(editor);
            }}
            options={{
              fontSize: 14,
              scrollBeyondLastLine: false,
              wordWrap: "on",
              lineNumbers: "on",
              automaticLayout: true,
            }}
          />
        </div>
      </div>
    </>
  );
}

import Editor from "@monaco-editor/react";
import { io, Socket } from "socket.io-client";

export default function EditorPage() {
  const sessionID = window.location.pathname.split("/")[2];

  function editorInit(editor) {
    let remoteUpdating;
    const socket = io("https://pairwise-mvp.onrender.com:10000");
    socket.on("connect", () => {
      console.log("Connected to Socket.IO server");
    });
    socket.io.on("error", (error) => {
      console.error(error);
    });
    socket.emit("join_session", { sessionID: sessionID });
    socket.on("remote_editorChange", (e) => {
      remoteUpdating = true;
      console.log(e.changedData);
      editor.executeEdits("remote", e.changedData);
      remoteUpdating = false;
    });
    editor.onDidChangeModelContent((e) => {
      if (remoteUpdating) return;
      console.log("editor changed");
      socket.emit("editorChange", {
        sessionID: sessionID,
        dataChanged: e.changes,
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

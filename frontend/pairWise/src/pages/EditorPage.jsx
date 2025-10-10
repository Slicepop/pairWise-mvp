import Editor from "@monaco-editor/react";
import { io, Socket } from "socket.io-client";

export default function EditorPage() {
  const sessionID = window.location.pathname.split("/")[2];

  function editorInit(editor) {
    let remoteUpdating;
    // const socket = io("https://pairwise-mvp.onrender.com");
    const socket = io("http://localhost:10000");

    socket.on("connect", () => {
      console.log("Connected to Socket.IO server");
    });
    socket.io.on("error", (error) => {
      console.error(error);
    });
    socket.emit("join_session", { sessionID: sessionID });
    socket.on("user_joined", (e) => {
      console.log("user joinged");
      socket.emit("send_document", {
        sessionID: sessionID,
        document: editor.getValue(),
      });
    });

    socket.on("update_document", (e) => {
      remoteUpdating = true;
      editor.setValue(e.document);
      remoteUpdating = false;
    });
    socket.on("remote_editorChange", (e) => {
      remoteUpdating = true;
      console.log(e.changedData);
      editor.executeEdits("remote", e.changedData);
      remoteUpdating = false;
    });
    socket.on("remote_cursorChange", (e) => {
      console.log("remote cursor change", e.lineNumber, e.column);
      const oldDecorations = editor._remoteCursorDecorations || [];

      const newDecorations = editor.deltaDecorations(oldDecorations, [
        {
          range: {
            startLineNumber: e.startLineNumber,
            startColumn: e.startColumn,
            endLineNumber: e.endLineNumber,
            endColumn: e.endColumn,
          },
          options: {
            className: "remote-cursor-decoration",
            beforeContentClassName: "remote-cursor-indicator",
          },
        },
      ]);

      editor._remoteCursorDecorations = newDecorations;
    });

    editor.onDidChangeCursorPosition((e) => {
      if (remoteUpdating) return;
      const { startLineNumber, startColumn, endLineNumber, endColumn } =
        editor.getSelection();
      clearTimeout(editor._cursorTimer);
      editor._cursorTimer = setTimeout(() => {
        socket.emit("cursorChange", {
          sessionID: sessionID,
          startLineNumber: startLineNumber,
          startColumn: startColumn,
          endLineNumber: endLineNumber,
          endColumn: endColumn,
        });
      }, 100);
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

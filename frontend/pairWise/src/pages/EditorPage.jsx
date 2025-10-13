import Editor from "@monaco-editor/react";
import { io, Socket } from "socket.io-client";
import SplitPane from "react-split-pane";
import { useState, useRef } from "react";
export default function EditorPage() {
  const sessionID = window.location.pathname.split("/")[2];
  let socketRef = useRef(null);
  const editorRef = useRef(null);
  const [outputText, setOutputText] = useState("Output:");
  function editorInit(editor) {
    let remoteUpdating;
    // const socket = io("https://pairwise-mvp.onrender.com");
    const socket = io("http://localhost:10000");
    socketRef.current = socket;
    let doumentTimer;
    function updateDocument() {
      doumentTimer = setTimeout(() => {
        socket.emit("sync_document", {
          sessionID: sessionID,
          document: editor.getValue(),
        });
        console.log("sent Document");
        updateDocument();
      }, 15000);
    }
    updateDocument();
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
    socket.on("remote_sync_document", (e) => {
      if (editor.getValue() === e.document) return;
      console.log("document out of sync, resyncing");
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
    socket.on("code_running", (e) => {
      setOutputText("Running....");
      console.log("running");
    });
    socket.on("code_execution_output", (e) => {
      setOutputText(e.output);
      console.log(e.output);
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
  function handleRunCode() {
    console.log(editorRef.current.getValue());
    socketRef.current.emit("initiate_code_execution", {
      sessionID: sessionID,
      document: editorRef.current.getValue(),
    });
  }
  return (
    // 1. Set full height and padding on the root container
    <div className="h-screen w-screen p-4 bg-gray-800">
      <SplitPane
        split="vertical"
        defaultSize="60%"
        minSize={250}
        maxSize={-300}
        // 2. CRITICAL: Add the h-full class to the SplitPane component itself!
        className="h-full"
        // 3. Add a class for the resizer bar so it's visible and easy to grab
        resizerClassName="bg-gray-600 hover:bg-blue-500 transition-colors duration-200 w-2 cursor-col-resize"
      >
        {/* 1. Left Panel: Code Editor */}
        <div className="flex-grow h-full bg-gray-900 shadow-xl rounded-l-xl overflow-hidden p-4 border border-r-0 border-gray-700">
          <Editor
            width="100%"
            height="100%"
            defaultLanguage="javascript"
            theme="vs-dark"
            value={"editorContent"}
            onMount={(editor) => {
              editorRef.current = editor;
              editorInit(editor);
            }}
            options={{
              fontSize: 16,
              scrollBeyondLastLine: false,
              wordWrap: "on",
              lineNumbers: "on",
              automaticLayout: true,
              minimap: { enabled: false },
            }}
          />
        </div>

        <div className="h-full bg-gray-900 shadow-xl rounded-r-xl p-6 flex flex-col space-y-4 border border-l-0 border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-200">Console: </h2>
            <button
              onClick={handleRunCode}
              className="px-6 py-2 text-md font-semibold text-white bg-blue-600 rounded-lg shadow-lg hover:bg-blue-500 transition duration-200 focus:outline-none focus:ring-4 focus:ring-blue-500 focus:ring-opacity-50"
            >
              ▶ Run Code
            </button>
          </div>

          <div className="outputDiv flex-grow min-h-0 p-3 text-sm text-green-400 bg-black rounded-lg border border-gray-700 overflow-auto font-mono">
            <p className="text-gray-400 mb-2 whitespace-pre-line">
              {outputText}
            </p>
          </div>
        </div>
      </SplitPane>
    </div>
  );
}

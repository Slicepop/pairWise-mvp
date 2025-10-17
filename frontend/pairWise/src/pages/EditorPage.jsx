import Editor from "@monaco-editor/react";
import { io, Socket } from "socket.io-client";
import SplitPane from "react-split-pane";
import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

async function getLanguage() {
  const { data: postData, error: postError } = await supabase
    .from("posts")
    .select("thread_id, subject")
    .eq("id", window.location.pathname.split("/")[2])
    .single();
  if (postError) return;
  const { data: threadData, error: threadError } = await supabase
    .from("threads")
    .select("name")
    .eq("threadID", postData.thread_id)
    .single();
  if (threadError) return;
  return { threadName: threadData.name, postName: postData.subject };
}

export default function EditorPage() {
  const sessionID = window.location.pathname.split("/")[2];
  const [language, setLanguage] = useState("");
  const [postName, setPostName] = useState("");

  useEffect(() => {
    getLanguage().then((lang) => {
      console.log(lang);
      if (lang.threadName) setLanguage(lang.threadName);
      if (lang.postName) setPostName(lang.postName);
    });
  }, []);

  let socketRef = useRef(null);
  const editorRef = useRef(null);

  function getFileType() {
    let fileType;
    switch (language.toLowerCase()) {
      case "c":
        fileType = "c";
        break;
      case "c++":
        fileType = "cpp";
        break;
      case "go":
        fileType = "go";
        break;
      case "java":
        fileType = "java";
        break;
      case "javascript":
        fileType = "js";
        break;
      case "python":
        fileType = "py";
        break;
      case "rust":
        fileType = "rs";
        break;
      case "typescript":
        fileType = "ts";
        break;
      default:
        fileType = "txt";
    }
    return "." + fileType;
  }
  const [outputText, setOutputText] = useState("Output:");
  function editorInit(editor) {
    let remoteUpdating;
    const socket = io("https://pairwise-mvp.onrender.com");
    // const socket = io("http://localhost:10000");
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
      console.log("user joined");
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
      setOutputText(e.output.result + "\n  " + e.output.time + "ms");
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
    console.log(state.languageID);
    if (editorRef.current.getValue().trim() == "") {
      setOutputText("Document cannot be blank!");
      return;
    }
    socketRef.current.emit("initiate_code_execution", {
      sessionID: sessionID,
      document: editorRef.current.getValue(),
      language_id: state.languageID,
    });
  }
  function handleImport() {
    const inp = document.createElement("input");
    inp.type = "file";
    document.body.appendChild(inp);
    inp.addEventListener("change", (e) => {
      const file = inp.files[0];
      const reader = new FileReader();
      reader.addEventListener("load", (e) => {
        console.log(e);
        console.log(reader.result);
        editorRef.current.setValue(reader.result);
      });
      if (file) reader.readAsText(file);
    });
    inp.click();
    document.body.removeChild(inp);
  }
  function handleExport() {
    const file = new File(
      [editorRef.current.getValue()],
      postName + getFileType(),
      {
        type: "text/plain",
      }
    );
    const link = document.createElement("a");
    const url = URL.createObjectURL(file);

    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();

    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="h-screen w-full overflow-hidden bg-gray-800">
        <div className="bg-gray-900 shadow-xl rounded-xl p-2 mt-4 mr-8 ml-8  border border-r-0 border-gray-700">
          <h1 className="text-xl font-bold text-gray-200">
            Subject: {postName}
          </h1>
          <p className="text-gray-500">{language}</p>
        </div>
        <SplitPane
          split="vertical"
          defaultSize="60%"
          height="100px"
          style={{ height: "93vh" }}
          minSize={250}
          maxSize={-300}
          className=" p-8 mb-4  bg-gray-800"
          resizerClassName="bg-gray-600 hover:bg-blue-500 transition-colors duration-200 w-2  cursor-col-resize"
        >
          <div className="flex-grow h-full bg-gray-900 p-4 shadow-xl rounded-l-xl overflow-hidden border border-r-0 border-gray-700">
            <div className="w-full flex  mb-5 bg-gray-900">
              <button
                className="bg-gray-900 border border-gray-700 text-gray-200 p-2 rounded-xl transition duration-100 cursor-pointer hover:bg-gray-700 "
                title="Import file into editor"
                onClick={handleImport}
              >
                Import
              </button>
              <button
                className=" ml-5 bg-gray-900 border border-gray-700 text-gray-200 p-2 rounded-xl transition duration-100 cursor-pointer hover:bg-gray-700 "
                title="Export current file"
                onClick={handleExport}
              >
                Export
              </button>
            </div>
            <Editor
              width="100%"
              height="94%"
              language={language.toLowerCase()}
              theme="vs-dark"
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
          <SplitPane
            split="horizontal"
            defaultSize="70%"
            minSize={250}
            maxSize={-100}
            className="h-full w-full"
            resizerClassName="bg-gray-600 hover:bg-blue-500 transition-colors duration-200 h-2 cursor-row-resize"
          >
            <div className="h-full w-full bg-gray-900 shadow-xl rounded-tr-xl p-6 flex flex-col space-y-4 border border-l-0 border-gray-700">
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
            <div className="h-full bg-gray-900 shadow-xl rounded-br-xl p-6 flex flex-col space-y-4 border border-l-0 border-gray-700"></div>
          </SplitPane>
        </SplitPane>
      </div>
    </>
  );
}

import Editor from "@monaco-editor/react";
import { io, Socket } from "socket.io-client";
import SplitPane from "react-split-pane";
import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Button from "@mui/material/Button";
import STDIN_manager from "../components/STDIN_manager";
async function getPostDetails() {
  const { data: postData, error: postError } = await supabase
    .from("posts")
    .select("thread_id, subject, AI_Suggestions")
    .eq("id", window.location.pathname.split("/")[2])
    .single();
  if (postError) return;
  const { data: threadData, error: threadError } = await supabase
    .from("threads")
    .select("name, language_id")
    .eq("threadID", postData.thread_id)
    .single();
  if (threadError) return;
  return {
    threadName: threadData.name,
    language_id: threadData.language_id,
    postName: postData.subject,
    AI_Suggestions: postData.AI_Suggestions,
  };
}

export default function EditorPage() {
  const sessionID = window.location.pathname.split("/")[2];
  const [language_ID, setLanguage_ID] = useState("");
  const [language, setLanguage] = useState("");
  const [postName, setPostName] = useState("");
  const [AI_Suggestions, setAI_Suggestions] = useState(false);
  const AI_SuggestionsRef = useRef("");
  const userRole = useRef("");
  const [LLM_TIP, setLLM_TIP] = useState(false);
  const [LLM_Response, setLLM_Response] = useState("");
  const [stdinList, setStdinList] = useState([]);
  useEffect(() => {
    getPostDetails().then((det) => {
      if (det.threadName) setLanguage(det.threadName);
      if (det.language_id) setLanguage_ID(det.language_id);
      if (det.postName) setPostName(det.postName);
      if (det.AI_Suggestions != undefined) {
        setAI_Suggestions(det.AI_Suggestions);
      }
    });
  }, []);

  let socketRef = useRef(null);
  const editorRef = useRef(null);

  function getFileType() {
    const fileType = {
      c: "c",
      "c++": "cpp",
      go: "go",
      java: "java",
      javascript: "js",
      python: "py",
      rust: "rs",
      typescript: "ts",
    };
    if (!fileType[language.toLowerCase()]) return ".txt";
    return "." + fileType[language.toLowerCase()];
  }
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const role = session?.user?.user_metadata?.role;
      console.log(role);
      userRole.current = role;
    });
  }, []);
  useEffect(() => {
    AI_SuggestionsRef.current = AI_Suggestions;
  }, [AI_Suggestions]);

  const [outputText, setOutputText] = useState("Output:");
  function editorInit(editor) {
    let remoteUpdating;
    // const socket = io("https://pairwise-mvp.onrender.com");
    const socket = io("http://localhost:10000");
    socketRef.current = socket;
    let documentTimer;
    let cachedDocument;
    function updateDocument() {
      documentTimer = setTimeout(() => {
        if (cachedDocument != editor.getValue()) {
          cachedDocument = editor.getValue();
          socket.emit("sync_document", {
            sessionID: sessionID,
            document: editor.getValue(),
          });
          console.log("sent Document");
        } else {
          console.log("Document same as cached document, not sending document");
        }
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
    socket.on("Student_Show_AI", (e) => {
      console.log("Student_Show_AI");
      if (userRole.current === "student") {
        setLLM_Response(e.message);
        setLLM_TIP(true);
      }
    });
    socket.on("remote_update_Input", (e) => {
      setStdinList(e.stdinList);
      console.log(stdinList);
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
      setLLM_TIP(false);

      setOutputText("Running....");
    });
    socket.on("code_execution_output", async (e) => {
      setOutputText(e.output.result + "\n  " + e.output.time + "ms");
      if (e.output.type === "error") {
        console.log("suggestions?", AI_Suggestions);
        if (userRole.current === "mentor" && AI_SuggestionsRef.current) {
          socket.emit("run_LLM", {
            sessionID: sessionID,
            document: editor.getValue(),
            output: e.output.result,
            language: language,
          });
          socket.on("LLM_Response", (e) => {
            console.log(e);
            setLLM_Response(e.response);
            setLLM_TIP(true);
          });
          // await runLLM_investigation(e.output.result, language)
        }
      }
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
    setLLM_TIP(false);
    if (editorRef.current.getValue().trim() == "") {
      setOutputText("Document cannot be blank!");
      return;
    }
    let stdinString;
    if (stdinList.length > 0) {
      stdinString = stdinList.join("\n");
    }
    console.log("stdinString: ", stdinString);
    console.log("stindarr: ", stdinList);
    socketRef.current.emit("initiate_code_execution", {
      sessionID: sessionID,
      document: editorRef.current.getValue(),
      language_id: language_ID,
      stdin: stdinString,
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
  function handleShowStudent() {
    socketRef.current.emit("Mentor_Show_Student_AI", {
      message: LLM_Response,
      sessionID: sessionID,
    });
  }
  function handleAI_Toggle() {
    if (AI_Suggestions) setAI_Suggestions(false);
    if (!AI_Suggestions) setAI_Suggestions(true);
  }
  return (
    <>
      {LLM_TIP && (
        <Alert
          severity="info"
          action={
            <>
              <div style={{ paddingRight: "20px" }}>
                <div
                  style={{
                    justifyItems: "center",
                  }}
                >
                  <Button
                    onClick={() => {
                      setLLM_TIP(false);
                    }}
                    color="inherit"
                    size="large"
                  >
                    x
                  </Button>
                </div>
                <div>
                  {userRole.current === "student" || (
                    <Button
                      onClick={handleShowStudent}
                      style={{
                        margin: "5px",
                        position: "absolute",
                        bottom: "0",
                        paddingRight: "10px",
                      }}
                      color="inherit"
                      size="small"
                    >
                      Show student
                    </Button>
                  )}
                </div>
              </div>
            </>
          }
          className="h-auto z-10 w-150 absolute top-30 right-8 "
        >
          <AlertTitle>Pair-Wise AI:</AlertTitle>
          <p className="whitespace-pre-line">
            {LLM_Response || "Something went wrong"}
          </p>
        </Alert>
      )}
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
          style={{ height: "90vh" }}
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
              {userRole.current != "mentor" || (
                <button
                  title="Toggle AI suggestions on error"
                  className=" ml-5 bg-gray-900 border border-gray-700
                text-gray-200 p-2 rounded-xl transition duration-100
                cursor-pointer hover:bg-gray-700 "
                  onClick={handleAI_Toggle}
                >
                  {`AI Suggestions: ${AI_Suggestions ? "on" : "off"}`}
                </button>
              )}
            </div>
            <Editor
              width="100%"
              height="92%"
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
              }}
            />
          </div>
          <SplitPane
            split="horizontal"
            defaultSize="70%"
            minSize={250}
            maxSize={-100}
            className="h-full w-full"
            resizerClassName="bg-gray-600 hover:bg-blue-500 transition-colors duration-200 h-2 min-h-2 cursor-row-resize"
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
            <div className="h-full bg-gray-900 shadow-xl rounded-br-xl p-6 flex flex-col space-y-4 border border-l-0 border-gray-700">
              <div className="h-full min-h flex flex-col overflow-y">
                <STDIN_manager
                  stdinList={stdinList}
                  setStdinList={setStdinList}
                  socketRef={socketRef}
                  sessionID={sessionID}
                />
              </div>
            </div>
          </SplitPane>
        </SplitPane>
      </div>
    </>
  );
}

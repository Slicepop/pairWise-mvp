import Editor from "@monaco-editor/react";
import { io, Socket } from "socket.io-client";
import SplitPane from "react-split-pane";
import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Button from "@mui/material/Button";

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
const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;
async function runLLM_investigation(output, language) {
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
              "Student submitted: in the language  \n " + language + output,
          },
        ],
      }),
    }
  );
  const data = await response.json();
  if (!response.ok) {
    console.error(data);
  }
  return data.choices?.[0]?.message?.content;
}
export default function EditorPage() {
  const sessionID = window.location.pathname.split("/")[2];
  const [language_ID, setLanguage_ID] = useState("");
  const [language, setLanguage] = useState("");
  const [postName, setPostName] = useState("");
  const [AI_Suggestions, setAI_Suggestions] = useState(false);
  const userRole = useRef("");
  const [LLM_TIP, setLLM_TIP] = useState(false);
  const [LLM_Response, setLLM_Response] = useState("");
  useEffect(() => {
    getPostDetails().then((det) => {
      if (det.threadName) setLanguage(det.threadName);
      if (det.language_id) setLanguage_ID(det.language_id);
      if (det.postName) setPostName(det.postName);
      if (det.AI_Suggestions != undefined) {
        setAI_Suggestions(det.AI_Suggestions);
        console.log(det.AI_Suggestions, typeof det.AI_Suggestions);
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
      // console.log(userRoleType);
    });
  }, []);

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
      console.log("user joined");
      socket.emit("send_document", {
        sessionID: sessionID,
        document: editor.getValue(),
      });
    });
    socket.on("Student_Show_AI", (e) => {
      if (userRole.current === "student") {
        setLLM_Response(e.message);
        setLLM_TIP(true);
      }
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
    socket.on("code_execution_output", async (e) => {
      setOutputText(e.output.result + "\n  " + e.output.time + "ms");
      if (e.output.type === "error") {
        console.log(userRole.current);
        if (userRole.current === "mentor") {
          setLLM_Response(
            await runLLM_investigation(e.output.result, language)
          );
          setLLM_TIP(true);
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
    if (editorRef.current.getValue().trim() == "") {
      setOutputText("Document cannot be blank!");
      return;
    }
    socketRef.current.emit("initiate_code_execution", {
      sessionID: sessionID,
      document: editorRef.current.getValue(),
      language_id: language_ID,
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
              {userRole.current === "student" || (
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

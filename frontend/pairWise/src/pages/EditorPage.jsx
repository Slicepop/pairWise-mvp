import Editor from "@monaco-editor/react";
import { supabase } from "../lib/supabaseClient";
import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
const {
  data: { session },
  error,
} = await supabase.auth.getSession();
export default function EditorPage() {
  const sessionID = window.location.pathname.split("/")[2];
  let JWT_token = session.access_token;
  const editorRef = useRef(null);
  const [output, setOutput] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  // Right panel UI state
  const [sidebarWidth, setSidebarWidth] = useState(320); // px
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const isResizingRef = useRef(false);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(320);

  // Keep editor focused on mount and after UI actions
  useEffect(() => {
    if (editorRef.current?.focus) editorRef.current.focus();
    const onKey = (e) => {
      // Ctrl/Cmd + Enter to Run, keep focus in editor
      const isMac = navigator.platform.toLowerCase().includes("mac");
      if ((isMac ? e.metaKey : e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleRun();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleRun = () => {
    setIsRunning(true);
    try {
      const code = editorRef.current?.getValue?.() ?? "";
      // Placeholder: you will wire actual execution. We just show a stub.
      setOutput(
        (prev) =>
          `▶️ Running...\n\n${
            code ? `Code length: ${code.length} chars` : "No code loaded"
          }`
      );
    } finally {
      // Keep quick for UX; adjust once real run is wired
      setTimeout(() => setIsRunning(false), 300);
      // Restore focus to editor after click
      requestAnimationFrame(() => editorRef.current?.focus?.());
    }
  };

  const handleClearOutput = () => {
    setOutput("");
    // Keep focus on editor
    requestAnimationFrame(() => editorRef.current?.focus?.());
  };

  // Collapse/expand right panel
  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => !prev);
    // Restore focus to editor after toggle
    requestAnimationFrame(() => editorRef.current?.focus?.());
  };

  // Drag-to-resize logic
  const onMouseDownResizer = (e) => {
    e.preventDefault();
    isResizingRef.current = true;
    setIsResizing(true);
    resizeStartXRef.current = e.clientX;
    resizeStartWidthRef.current = sidebarWidth;
    // Avoid losing editor key handling
    window.addEventListener("mousemove", onMouseMoveResizer);
    window.addEventListener("mouseup", onMouseUpResizer);
  };
  const onMouseMoveResizer = (e) => {
    if (!isResizingRef.current) return;
    const min = 240;
    const max = 560;
    const delta = e.clientX - resizeStartXRef.current;
    // For a right-hand sidebar, dragging the divider LEFT increases width.
    // So invert the delta (subtract) so leftward movement (negative delta) increases width.
    const newW = Math.max(
      min,
      Math.min(max, resizeStartWidthRef.current - delta)
    );
    setSidebarWidth(newW);
  };
  const onMouseUpResizer = () => {
    if (!isResizingRef.current) return;
    isResizingRef.current = false;
    setIsResizing(false);
    window.removeEventListener("mousemove", onMouseMoveResizer);
    window.removeEventListener("mouseup", onMouseUpResizer);
    // Put focus back to editor
    requestAnimationFrame(() => editorRef.current?.focus?.());
  };
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
    socket.emit("join_session", {
      sessionID: sessionID,
      token: JWT_token,
    });
    console.log(session);
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
            startLineNumber: e.lineNumber,
            startColumn: e.column,
            endLineNumber: e.lineNumber,
            endColumn: e.column + 1,
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
      const { lineNumber, column } = e.position;
      clearTimeout(editor._cursorTimer);
      editor._cursorTimer = setTimeout(() => {
        socket.emit("cursorChange", {
          sessionID: sessionID,
          lineNumber: lineNumber,
          column: column,
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
    <div className="relative h-screen bg-gray-900 text-gray-100 select-none overflow-hidden">
      {/* Main Split Layout */}
      <div className="flex h-full w-full">
        {/* Editor Area */}
        <div className="flex-1 min-w-0">
          <div className="h-full">
            <Editor
              width="100%"
              height="100%"
              defaultLanguage="javascript"
              theme="vs-dark"
              value={"editorContent"}
              onMount={(editor) => {
                editorRef.current = editor;
                editorInit(editor);
                // Ensure focus on mount
                editor.focus();
              }}
              options={{
                fontSize: 14,
                scrollBeyondLastLine: false,
                wordWrap: "on",
                lineNumbers: "on",
                automaticLayout: true,
                minimap: { enabled: true },
              }}
            />
          </div>
        </div>

        {/* Vertical Resizer (visible only when panel is open) */}
        {!isSidebarCollapsed && (
          <div
            onMouseDown={onMouseDownResizer}
            className="w-1 cursor-col-resize bg-gray-800 hover:bg-gray-700 active:bg-gray-600"
            title="Drag to resize"
          />
        )}

        {/* Right Panel */}
        <aside
          className={`bg-gray-850 h-full z-10 border-l border-gray-800 flex flex-col`}
          style={{
            width: isSidebarCollapsed ? 0 : sidebarWidth,
            transition: isResizing ? "none" : "width 120ms ease",
          }}
        >
          <div
            className={`p-4 ${
              isSidebarCollapsed ? "hidden" : "flex"
            } flex-col gap-3 flex-1 min-h-0`}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-200">Run</h2>
              <div className="flex items-center gap-2">
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleRun}
                  disabled={isRunning}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm"
                  title="Run code (Ctrl/Cmd+Enter)"
                >
                  {isRunning ? "Running..." : "Run"}
                </button>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleClearOutput}
                  className="px-2 py-2 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm"
                  title="Clear output"
                >
                  Clear
                </button>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={toggleSidebar}
                  className="px-2 py-2 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm"
                  title="Hide panel"
                >
                  Hide
                </button>
              </div>
            </div>

            <div className="text-xs text-gray-400">Session: {sessionID}</div>

            <div className="flex-1 min-h-0">
              <label className="block text-xs text-gray-400 mb-1">Output</label>
              <div className="h-full max-h-[calc(100vh-140px)] overflow-auto rounded bg-black/90 border border-gray-800 p-3">
                <pre className="whitespace-pre-wrap text-green-300 text-sm leading-relaxed select-text">
                  {output || "# Output will appear here..."}
                </pre>
              </div>
            </div>
          </div>
        </aside>
        {/* Collapsed handle (always visible when panel hidden) */}
        {isSidebarCollapsed && (
          <div
            onClick={toggleSidebar}
            onMouseDown={(e) => e.preventDefault()}
            className="w-6 h-full bg-gray-800 hover:bg-gray-700 cursor-pointer flex items-center justify-center select-none"
            title="Show panel"
          >
            <div className="w-2 h-12 bg-gray-600 rounded" />
          </div>
        )}
      </div>
    </div>
  );
}

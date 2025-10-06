import { useEffect, useState, useCallback, useRef } from "react";
import Editor from "@monaco-editor/react";
import {
  createDataChannel,
  getUserID,
  guestAcceptConnection,
  sendDocument,
  sendChange,
  sendCursorPosition,
} from "../lib/signaling";

export default function EditorPage() {
  const sessionRef = useRef(false);
  const editorRef = useRef(null);
  const debounceTimer = useRef(null);
  const lastSentContent = useRef("");
  const isInitiator = window.location.hash === "#host";

  // Editor state
  let remoteUpdate = null;
  const [isUpdatingFromRemote, setIsUpdatingFromRemote] = useState(false);
  const [remoteCursor, setRemoteCursor] = useState(null);
  function handleChangeModelContent(e) {
    sendChange(e.changes[0]);
  }
  // Handle editor content changes with smart debouncing
  const handleEditorChange = useCallback(
    (value) => {
      if (!isUpdatingFromRemote) {
        setEditorContent(value);

        // Clear previous timer
        if (debounceTimer.current) {
          clearTimeout(debounceTimer.current);
        }

        // Check if this is a significant change (like pressing Enter or adding substantial content)
        const isSignificantChange =
          Math.abs(
            (value?.length || 0) - (lastSentContent.current?.length || 0)
          ) > 10 ||
          (value || "").includes("\n") !==
            (lastSentContent.current || "").includes("\n");

        if (isSignificantChange) {
          // Send immediately for significant changes
          sendDocument(value);
          lastSentContent.current = value;
        } else {
          // Debounce for regular typing (200ms for better responsiveness)
          debounceTimer.current = setTimeout(() => {
            sendDocument(value);
            lastSentContent.current = value;
          }, 50);
        }
      }
    },
    [isUpdatingFromRemote]
  );

  // Listen for remote editor changes
  useEffect(() => {
    // const handleRemoteChange = (event) => {
    //   console.log("Received remote editor change:", event.detail);

    //   // Clear any pending debounced sends to avoid conflicts
    //   if (debounceTimer.current) {
    //     clearTimeout(debounceTimer.current);
    //     debounceTimer.current = null;
    //   }

    //   setIsUpdatingFromRemote(true);
    //   setEditorContent(event.detail.content);

    //   // Reset the flag after a shorter delay for better responsiveness
    //   setTimeout(() => {
    //     setIsUpdatingFromRemote(false);
    //   }, 50);
    // };
    const handleRemoteChange = (event) => {
      console.log("Received remote editor change:", event.detail);

      // // Clear any pending debounced sends to avoid conflicts
      // if (debounceTimer.current) {
      //   clearTimeout(debounceTimer.current);
      //   debounceTimer.current = null;
      // }

      // setIsUpdatingFromRemote(true);
      let user = window.location.hash === "#host" ? "host" : "guest";
      if (event.detail.sender === user) return;
      console.log("edit not by self", event.detail.sender, user);
      remoteUpdate = true;
      editorRef.current.executeEdits("remote", [event.detail.content]);
      remoteUpdate = false;

      // Reset the flag after a shorter delay for better responsiveness
      // setTimeout(() => {
      //   setIsUpdatingFromRemote(false);
      // }, 50);
    };

    const handleRemoteCursor = (event) => {
      console.log("Received remote cursor position:", event.detail);
      setRemoteCursor({
        lineNumber: event.detail.lineNumber,
        column: event.detail.column,
      });

      // Clear cursor after 3 seconds of inactivity
      setTimeout(() => {
        setRemoteCursor(null);
      }, 3000);
    };

    window.addEventListener("editor-change-received", handleRemoteChange);
    window.addEventListener("cursor-position-received", handleRemoteCursor);

    return () => {
      window.removeEventListener("editor-change-received", handleRemoteChange);
      window.removeEventListener(
        "cursor-position-received",
        handleRemoteCursor
      );

      // Clean up debounce timer on unmount
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  // Initialize WebRTC connection
  useEffect(() => {
    if (sessionRef.current) return;
    sessionRef.current = true;

    async function init() {
      await getUserID();
      if (isInitiator) {
        await createDataChannel();
      } else {
        await guestAcceptConnection();
      }
    }

    init();
  }, [isInitiator]);

  // Handle cursor decorations
  useEffect(() => {
    if (editorRef.current && remoteCursor) {
      const editor = editorRef.current;

      // Remove previous decorations
      const oldDecorations = editor._remoteCursorDecorations || [];

      // Add new cursor decoration
      const newDecorations = editor.deltaDecorations(oldDecorations, [
        {
          range: {
            startLineNumber: remoteCursor.lineNumber,
            startColumn: remoteCursor.column,
            endLineNumber: remoteCursor.lineNumber,
            endColumn: remoteCursor.column + 1,
          },
          options: {
            className: "remote-cursor-decoration",
            beforeContentClassName: "remote-cursor-indicator",
          },
        },
      ]);

      editor._remoteCursorDecorations = newDecorations;
    }
  }, [remoteCursor]);

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
              editorRef.current = editor;
              editor.onDidChangeModelContent((e) => {
                if (remoteUpdate) return;
                handleChangeModelContent(e);
              });
              // Track cursor position changes
              editor.onDidChangeCursorPosition((e) => {
                if (!isUpdatingFromRemote) {
                  const { lineNumber, column } = e.position;
                  // Debounce cursor position updates
                  clearTimeout(editor._cursorTimer);
                  editor._cursorTimer = setTimeout(() => {
                    sendCursorPosition(lineNumber, column);
                  }, 100);
                }
              });
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

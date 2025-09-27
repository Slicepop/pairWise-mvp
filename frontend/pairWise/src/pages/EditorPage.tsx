import { useEffect, useState, useCallback, useRef } from "react";
import Editor from "@monaco-editor/react";

export default function EditorPage() {
  const [code, setCode] = useState<string>("");
  const [isUpdatingFromRemote, setIsUpdatingFromRemote] = useState(false);
  const [connectionStatus, setConnectionStatus] =
    useState<string>("disconnected");

  // Cursor tracking state
  const [remoteCursor, setRemoteCursor] = useState<{
    lineNumber: number;
    column: number;
  } | null>(null);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const signalRef = useRef<HTMLTextAreaElement>(null);
  const remoteRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<any>(null); // Monaco editor instance
  const isUpdatingFromRemoteRef = useRef(false); // Use ref to avoid closure issues

  // Initialize BroadcastChannel once
  useEffect(() => {
    const channel = new BroadcastChannel("testEditor");
    channelRef.current = channel;

    channel.onmessage = (e) => {
      // Use ref to get current value and avoid stale closure
      if (e.data.type === "update" && !isUpdatingFromRemoteRef.current) {
        isUpdatingFromRemoteRef.current = true;
        setIsUpdatingFromRemote(true);
        setCode(e.data.value ?? "");
        setTimeout(() => {
          isUpdatingFromRemoteRef.current = false;
          setIsUpdatingFromRemote(false);
        }, 0);
      }
    };

    return () => {
      channel.close();
    };
  }, []); // Empty dependency - BroadcastChannel should only initialize once!

  // Sync state with ref to avoid stale closures
  useEffect(() => {
    isUpdatingFromRemoteRef.current = isUpdatingFromRemote;
  }, [isUpdatingFromRemote]);

  const broadcastChange = useCallback(
    (value: string | undefined) => {
      if (channelRef.current && !isUpdatingFromRemote) {
        channelRef.current.postMessage({ type: "update", value });
      }
    },
    [isUpdatingFromRemote]
  );

  // WebRTC Peer setup with native APIs
  useEffect(() => {
    async function initPeer() {
      try {
        console.log("Initializing native WebRTC peer...");
        const isInitiator = window.location.hash === "#host";
        console.log("🔍 DEBUGGING MODE:");
        console.log("  - Current URL:", window.location.href);
        console.log("  - URL Hash:", window.location.hash);
        console.log("  - Is Host/Initiator:", isInitiator);
        setConnectionStatus("initializing");

        // Create RTCPeerConnection
        const peerConnection = new RTCPeerConnection({
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
          ],
        });
        peerConnectionRef.current = peerConnection;

        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
          if (event.candidate) {
            console.log("ICE candidate generated");
          } else {
            // All ICE candidates have been sent
            const offer = peerConnection.localDescription;
            if (offer && signalRef.current) {
              signalRef.current.value = JSON.stringify(offer);
              console.log("Signal data generated and set to textarea");
            }
          }
        };

        // Handle connection state changes
        peerConnection.onconnectionstatechange = () => {
          const state = peerConnection.connectionState;
          console.log("🔗 Connection state changed:", state);
          console.log(
            "🔍 ICE connection state:",
            peerConnection.iceConnectionState
          );
          console.log(
            "🔍 ICE gathering state:",
            peerConnection.iceGatheringState
          );
          console.log("🔍 Signaling state:", peerConnection.signalingState);

          setConnectionStatus(state);
          if (state === "connected") {
            console.log("🎉 WebRTC connection fully established!");
            console.log(
              "🔍 Data channel status:",
              dataChannelRef.current?.readyState
            );
          } else if (state === "failed") {
            console.error("❌ WebRTC connection failed!");
            console.log("🔧 Attempting to restart ICE...");
            peerConnection.restartIce();
          } else if (state === "disconnected") {
            console.warn(
              "⚠️ WebRTC connection disconnected - monitoring for reconnection..."
            );
          } else if (state === "closed") {
            console.error("❌ WebRTC connection closed!");
          }
        };

        // Add ICE connection state monitoring
        peerConnection.oniceconnectionstatechange = () => {
          const iceState = peerConnection.iceConnectionState;
          console.log("🧊 ICE connection state:", iceState);
          if (iceState === "failed") {
            console.error(
              "❌ ICE connection failed - connection may be unstable"
            );
          } else if (iceState === "disconnected") {
            console.warn("⚠️ ICE disconnected - connection may recover");
          }
        };

        if (isInitiator) {
          // Host creates data channel
          console.log("🏠 HOST MODE: Creating data channel immediately...");
          const dataChannel = peerConnection.createDataChannel("editor", {
            ordered: true,
          });
          dataChannelRef.current = dataChannel;
          console.log(
            "🏠 HOST: Data channel created and assigned:",
            dataChannel
          );
          setupDataChannel(dataChannel);

          // Create and set local description (offer)
          const offer = await peerConnection.createOffer();
          await peerConnection.setLocalDescription(offer);
          console.log("🏠 HOST: Offer created, check signal textarea");
        } else {
          // Guest waits for data channel from host
          console.log(
            "👤 GUEST MODE: Will wait for data channel from host after connection..."
          );
          console.log(
            "👤 GUEST: dataChannelRef.current is currently:",
            dataChannelRef.current
          );

          peerConnection.ondatachannel = (event) => {
            console.log("🎉 GUEST: Data channel event fired!");
            console.log("� Received channel:", event.channel);
            console.log("📡 Channel label:", event.channel.label);
            console.log("📡 Channel state:", event.channel.readyState);
            const dataChannel = event.channel;
            dataChannelRef.current = dataChannel;
            console.log("✅ GUEST: Data channel assigned to ref");
            setupDataChannel(dataChannel);
          };
        }
      } catch (error) {
        console.error("Error initializing peer:", error);
        setConnectionStatus("error");
      }
    }

    function setupDataChannel(dataChannel: RTCDataChannel) {
      console.log("🔧 Setting up data channel:", dataChannel.label);

      dataChannel.onopen = () => {
        console.log("✅ Data channel opened:", dataChannel.readyState);
        setConnectionStatus("connected");
      };

      dataChannel.onclose = () => {
        console.log("❌ Data channel closed");
        setConnectionStatus("disconnected");

        // Log additional info about why it closed
        const pc = peerConnectionRef.current;
        if (pc) {
          console.log(
            "🔍 Connection state when data channel closed:",
            pc.connectionState
          );
          console.log("🔍 ICE connection state:", pc.iceConnectionState);
          console.log("🔍 Signaling state:", pc.signalingState);
        }

        // Clean up keep-alive interval
        if ((dataChannel as any)._keepAliveInterval) {
          clearInterval((dataChannel as any)._keepAliveInterval);
        }
      };

      dataChannel.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          console.log("📨 Received peer message:", msg.type);

          if (msg.type === "update" && !isUpdatingFromRemote) {
            console.log("📝 Applying code update from peer");
            setIsUpdatingFromRemote(true);
            setCode(msg.content ?? "");
            setTimeout(() => setIsUpdatingFromRemote(false), 0);
          } else if (msg.type === "cursor") {
            console.log(
              "📍 Updating remote cursor position:",
              msg.lineNumber,
              msg.column
            );
            setRemoteCursor({
              lineNumber: msg.lineNumber,
              column: msg.column,
            });
          } else if (msg.type === "ping") {
            // Respond to ping to keep connection alive
            console.log("🏓 Received ping, sending pong");
            if (dataChannel.readyState === "open") {
              dataChannel.send(JSON.stringify({ type: "pong" }));
            }
          } else if (msg.type === "pong") {
            console.log("🏓 Received pong - connection is alive");
          }
        } catch (e) {
          console.error("❌ Invalid peer data", e);
        }
      };

      dataChannel.onerror = (error) => {
        console.error("❌ Data channel error:", error);
        setConnectionStatus("error");
      };

      // Add connection keep-alive mechanism
      const keepAliveInterval = setInterval(() => {
        if (dataChannel.readyState === "open") {
          console.log("🏓 Sending keep-alive ping");
          try {
            dataChannel.send(JSON.stringify({ type: "ping" }));
          } catch (e) {
            console.error("❌ Failed to send keep-alive ping:", e);
            clearInterval(keepAliveInterval);
          }
        } else {
          console.warn("⚠️ Data channel not open, stopping keep-alive");
          clearInterval(keepAliveInterval);
        }
      }, 30000); // Ping every 30 seconds

      // Store interval ID to clean up later
      (dataChannel as any)._keepAliveInterval = keepAliveInterval;
    }

    initPeer();

    return () => {
      console.log("🧹 Cleaning up WebRTC connections");

      if (dataChannelRef.current) {
        // Clean up keep-alive interval
        if ((dataChannelRef.current as any)._keepAliveInterval) {
          clearInterval((dataChannelRef.current as any)._keepAliveInterval);
          console.log("🧹 Cleared keep-alive interval");
        }
        dataChannelRef.current.close();
        console.log("🧹 Data channel closed");
      }

      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        console.log("🧹 Peer connection closed");
      }
    };
  }, []); // Empty dependency array - WebRTC should only initialize once!

  const broadcastPeerChange = useCallback(
    (content: string | undefined) => {
      const dataChannel = dataChannelRef.current;
      if (
        dataChannel &&
        dataChannel.readyState === "open" &&
        !isUpdatingFromRemoteRef.current // Use ref instead of state to avoid dependencies
      ) {
        console.log("Broadcasting peer change:", content?.length);
        dataChannel.send(JSON.stringify({ type: "update", content }));
      }
    },
    [] // No dependencies - function is stable
  );

  // Broadcast cursor position to peer
  const broadcastCursor = useCallback(
    (lineNumber: number, column: number) => {
      const dataChannel = dataChannelRef.current;
      if (
        dataChannel &&
        dataChannel.readyState === "open" &&
        !isUpdatingFromRemoteRef.current // Use ref instead of state
      ) {
        console.log("📍 Broadcasting cursor position:", lineNumber, column);
        dataChannel.send(
          JSON.stringify({
            type: "cursor",
            lineNumber,
            column,
          })
        );
      }
    },
    [] // No dependencies - function is stable
  );

  const handleConnect = useCallback(async () => {
    const peerConnection = peerConnectionRef.current;
    if (!peerConnection || !remoteRef.current) return;

    try {
      const remoteSignal = JSON.parse(remoteRef.current.value);
      console.log("Connecting with remote signal:", remoteSignal);

      if (remoteSignal.type === "offer") {
        // This is a guest receiving an offer
        await peerConnection.setRemoteDescription(remoteSignal);
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        // Wait for ICE gathering to complete, then show answer in signal textarea
        peerConnection.onicecandidate = (event) => {
          if (!event.candidate && signalRef.current) {
            const answer = peerConnection.localDescription;
            signalRef.current.value = JSON.stringify(answer);
            console.log("Answer generated and set to textarea");
          }
        };
      } else if (remoteSignal.type === "answer") {
        // This is a host receiving an answer
        await peerConnection.setRemoteDescription(remoteSignal);
        console.log("Answer processed, connection should be established");
      }
    } catch (e) {
      console.error("Invalid remote signal data", e);
      alert("Invalid signal data format");
    }
  }, []);

  // Generate actual WebRTC signal
  const generateSignal = useCallback(async () => {
    console.log("🔄 Generating WebRTC signal...");
    const peerConnection = peerConnectionRef.current;

    if (!peerConnection) {
      console.error("❌ No peer connection found");
      alert("Peer connection not initialized. Refresh the page and try again.");
      return;
    }

    try {
      // Create offer (this will trigger the data channel creation if we're the initiator)
      console.log("🔧 Creating offer...");
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      console.log(
        "✅ Offer created, waiting for ICE candidates to populate signal..."
      );
      // Signal will be populated by the onicecandidate callback
    } catch (error) {
      console.error("❌ Error generating signal:", error);
      alert("Failed to generate signal: " + error);
    }
  }, []);

  // Test function to check if peer and refs are working
  const testSignal = useCallback(() => {
    console.log("Testing signal generation...");
    console.log("peerConnectionRef.current:", peerConnectionRef.current);
    console.log("signalRef.current:", signalRef.current);
    console.log("connectionStatus:", connectionStatus);

    if (signalRef.current) {
      signalRef.current.value = "TEST: " + new Date().toISOString();
    }

    if (peerConnectionRef.current) {
      console.log(
        "Peer connection exists, state:",
        peerConnectionRef.current.connectionState
      );
    } else {
      console.log("No peer connection found");
    }
  }, [connectionStatus]); // Handle editor changes
  // Handle editor mount - set up cursor tracking
  const handleEditorMount = useCallback(
    (editor: any, _monaco: any) => {
      console.log("🎯 Monaco editor mounted");
      editorRef.current = editor;

      // Track cursor position changes
      editor.onDidChangeCursorPosition((e: any) => {
        if (!isUpdatingFromRemoteRef.current) {
          // Use ref instead of state
          const { lineNumber, column } = e.position;
          console.log("📍 Local cursor moved:", lineNumber, column);
          broadcastCursor(lineNumber, column);
        }
      });

      // Add a visible cursor widget class
      const remoteCursorWidget = {
        getId: () => "remote-cursor-widget",
        getDomNode: () => {
          const node = document.createElement("div");
          node.className = "remote-cursor-widget";
          node.innerHTML = "👤";
          node.style.cssText = `
          background: #FFD700;
          color: #000;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: bold;
          position: absolute;
          z-index: 1000;
          box-shadow: 0 2px 8px rgba(255,215,0,0.5);
          animation: bounce 0.5s ease-out;
        `;
          return node;
        },
        getPosition: () => null, // Will be updated when showing cursor
      };

      // Store widget reference for later use
      (editor as any)._remoteCursorWidget = remoteCursorWidget;

      // Add bounce animation to document
      if (!document.getElementById("remote-cursor-animations")) {
        const style = document.createElement("style");
        style.id = "remote-cursor-animations";
        style.textContent = `
        @keyframes bounce {
          0% { transform: scale(0.8) translateY(-10px); opacity: 0; }
          50% { transform: scale(1.1) translateY(0px); opacity: 1; }
          100% { transform: scale(1) translateY(0px); opacity: 1; }
        }
        .remote-cursor-widget:hover::after {
          content: "Remote User";
          position: absolute;
          top: -25px;
          left: 50%;
          transform: translateX(-50%);
          background: #333;
          color: white;
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 10px;
          white-space: nowrap;
        }
      `;
        document.head.appendChild(style);
      }
    },
    [broadcastCursor] // Only depend on broadcastCursor, not isUpdatingFromRemote
  );

  const [remoteDecorations, setRemoteDecorations] = useState<string[]>([]);

  // Apply remote cursor decoration AND widget
  useEffect(() => {
    if (editorRef.current && remoteCursor) {
      console.log("🎯 Applying remote cursor at:", remoteCursor);

      // Clear existing decorations
      editorRef.current.deltaDecorations(remoteDecorations, []);

      // Create new decoration for background highlight
      const newDecorations = editorRef.current.deltaDecorations(
        [],
        [
          {
            range: {
              startLineNumber: remoteCursor.lineNumber,
              startColumn: Math.max(1, remoteCursor.column),
              endLineNumber: remoteCursor.lineNumber,
              endColumn: Math.max(2, remoteCursor.column + 1),
            },
            options: {
              className: "remote-cursor-decoration",
              glyphMarginClassName: "remote-cursor-glyph",
              overviewRulerColor: "#FFD700",
              overviewRulerLane: 7,
              minimap: {
                color: "#FFD700",
                position: 2,
              },
            },
          },
        ]
      );

      // Add content widget for better visibility
      const widget = (editorRef.current as any)._remoteCursorWidget;
      if (widget) {
        // Remove existing widget if any
        try {
          editorRef.current.removeContentWidget(widget);
        } catch (e) {
          // Widget might not exist, that's ok
        }

        // Update widget position
        widget.getPosition = () => ({
          position: {
            lineNumber: remoteCursor.lineNumber,
            column: remoteCursor.column,
          },
          preference: [1, 2], // ABOVE, BELOW
        });

        // Add the widget
        editorRef.current.addContentWidget(widget);
        console.log("✅ Remote cursor widget added at:", remoteCursor);
      }

      setRemoteDecorations(newDecorations);
      console.log("✅ Remote cursor decoration applied");

      // Clean up after 10 seconds
      const timeout = setTimeout(() => {
        if (editorRef.current && newDecorations.length > 0) {
          editorRef.current.deltaDecorations(newDecorations, []);
          try {
            if (widget) {
              editorRef.current.removeContentWidget(widget);
            }
          } catch (e) {
            // Widget cleanup failed, that's ok
          }
          setRemoteDecorations([]);
          console.log("🧹 Remote cursor cleaned up");
        }
      }, 10000);

      return () => {
        clearTimeout(timeout);
      };
    }
  }, [remoteCursor, remoteDecorations]);

  // Copy signal to clipboard
  const copySignal = useCallback(() => {
    if (signalRef.current && signalRef.current.value) {
      navigator.clipboard
        .writeText(signalRef.current.value)
        .then(() => {
          console.log("📋 Signal copied to clipboard");
          // Visual feedback
          const button = document.getElementById("copy-signal-btn");
          if (button) {
            const originalText = button.textContent;
            button.textContent = "✅ Copied!";
            setTimeout(() => {
              button.textContent = originalText;
            }, 2000);
          }
        })
        .catch((err) => {
          console.error("Failed to copy signal:", err);
          alert("Failed to copy to clipboard");
        });
    } else {
      alert("No signal data to copy");
    }
  }, []);

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (isUpdatingFromRemoteRef.current) return; // Use ref instead of state

      setCode(value ?? "");
      console.log("Editor changed:", value?.length);
      broadcastChange(value);
      broadcastPeerChange(value);
    },
    [broadcastChange, broadcastPeerChange] // Remove isUpdatingFromRemote dependency
  );
  return (
    <div className="h-screen w-screen flex flex-col bg-gray-900">
      <div className="flex flex-row items-start gap-4 p-4 bg-gray-800">
        <div className="flex flex-col gap-2">
          <label htmlFor="signal" className="text-gray-300 text-sm">
            Your Signal Data{" "}
            {window.location.hash === "#host" ? "(Host)" : "(Guest)"}
          </label>
          <div className="relative">
            <textarea
              ref={signalRef}
              id="signal"
              placeholder="Your Signal Data (copy this and send to peer)"
              className="p-2 rounded bg-gray-700 text-gray-100 border border-gray-600 resize-none w-64 h-24"
              readOnly
            />
            <button
              id="copy-signal-btn"
              onClick={copySignal}
              className="absolute top-1 right-1 px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition"
              title="Copy signal to clipboard"
            >
              📋 Copy
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="remote" className="text-gray-300 text-sm">
            Paste Remote Signal Data
          </label>
          <textarea
            ref={remoteRef}
            id="remote"
            placeholder="Paste the signal data from the other peer here"
            className="p-2 rounded bg-gray-700 text-gray-100 border border-gray-600 resize-none w-64 h-24"
          />
        </div>
        <button
          onClick={handleConnect}
          className="mt-6 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
        >
          Connect
        </button>
        <button
          onClick={generateSignal}
          className="mt-6 px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition"
        >
          Generate Signal
        </button>
        <button
          onClick={testSignal}
          className="mt-6 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition"
        >
          Test Signal
        </button>

        {/* Status Panel */}
        <div className="mt-4 p-3 bg-gray-700 rounded-lg">
          <div className="text-sm">
            <p className="text-gray-300 mb-1">
              Status:{" "}
              <span
                className={`font-mono ${
                  connectionStatus === "connected"
                    ? "text-green-400"
                    : connectionStatus === "connecting"
                    ? "text-yellow-400"
                    : connectionStatus === "error"
                    ? "text-red-400"
                    : "text-gray-400"
                }`}
              >
                {connectionStatus}
              </span>
            </p>
            {remoteCursor && (
              <p className="text-yellow-400 flex items-center gap-1">
                <span>👤</span>
                <span>
                  Remote cursor: Line {remoteCursor.lineNumber}, Col{" "}
                  {remoteCursor.column}
                </span>
              </p>
            )}
          </div>
        </div>
      </div>
      <div className="flex-1">
        <Editor
          width="85vw"
          height="92vh"
          defaultLanguage="javascript"
          value={code}
          theme="vs-dark"
          onChange={handleEditorChange}
          onMount={handleEditorMount}
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
  );
}

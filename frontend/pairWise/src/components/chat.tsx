import { useEffect, useState } from "react";
import { io } from "socket.io-client";

const socket = io("https://pairwise-mvp.onrender.com"); // backend port

export default function Chat() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<string[]>([]);

  useEffect(() => {
    socket.on("chat message", (msg: string) => {
      setMessages((prev) => [...prev, msg]);
    });

    return () => {
      socket.off("chat message");
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      socket.emit("chat message", message);
      setMessage("");
    }
  };

  return (
    <div className="p-4 max-w-md mx-auto">
      <ul className="border rounded p-2 h-64 overflow-y-auto bg-gray-50 mb-2">
        {messages.map((msg, i) => (
          <li
            key={i}
            className="mb-1 px-3 py-2 rounded-lg bg-white shadow text-gray-800 break-words"
          >
            {msg}
          </li>
        ))}
      </ul>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          className="flex-1 border rounded p-2"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type a message..."
        />
        <button className="bg-blue-500 text-white px-4 rounded">Send</button>
      </form>
    </div>
  );
}

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

interface Thread {
  threadID: string;
  name: string;
}

export type { Thread };

interface ThreadsSidebarProps {
  onSelect: (thread: Thread) => void;
}

export default function threads({ onSelect }: ThreadsSidebarProps) {
  const [threads, setThreads] = useState<Thread[]>([]);

  useEffect(() => {
    async function loadThreads() {
      const { data, error } = await supabase
        .from("threads")
        .select("threadID, name")
        .order("name", { ascending: true });
      if (!error && data) setThreads(data);
      console.log(data, error);
    }
    loadThreads();
  }, []);

  return (
    <aside className="w-64 bg-gray-900 text-white h-screen p-4">
      <h2 className="text-lg font-bold mb-4">Threads</h2>
      <ul>
        {threads.map((t) => (
          <li
            key={t.threadID}
            onClick={() => onSelect(t)}
            className="p-2 hover:bg-gray-700 cursor-pointer rounded"
          >
            {t.name}
          </li>
        ))}
      </ul>
    </aside>
  );
}

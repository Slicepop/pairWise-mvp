import { useRef } from "react";
import Editor from "@monaco-editor/react";
import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";
import { MonacoBinding } from "y-monaco";
import * as monaco from "monaco-editor";

export default function EditorPage() {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  const handleEditorMount = (
    editor: monaco.editor.IStandaloneCodeEditor,
    monacoInstance: typeof monaco
  ) => {
    editorRef.current = editor;

    const doc = new Y.Doc();
    const provider = new WebrtcProvider("test1", doc);
    const type = doc.getText("This is the editor");

    new MonacoBinding(
      type,
      editorRef.current.getModel()!,
      new Set([editorRef.current]),
      provider.awareness
    );
  };

  return (
    <div style={{ height: "90vh" }}>
      <Editor
        height="100%"
        defaultLanguage="typescript"
        theme="vs-dark"
        onMount={handleEditorMount}
      />
    </div>
  );
}

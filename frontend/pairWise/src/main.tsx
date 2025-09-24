import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router";
import "./index.css";
import Dashboard from "./pages/Dashboard";
import EditorPage from "./pages/EditorPage";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/editor/:postID" element={<EditorPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);

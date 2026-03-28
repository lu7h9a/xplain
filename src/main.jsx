import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { initializeSupabaseClient } from "./supabase.js";

void initializeSupabaseClient();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);


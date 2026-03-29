import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { initializeSupabaseClient } from "./supabase.js";

void initializeSupabaseClient();

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error?.message || "Eggzy hit a frontend error while loading this page.",
    };
  }

  componentDidCatch(error) {
    console.error("Eggzy frontend error:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "24px", background: "#10261a", color: "#f3fff5", fontFamily: "Nunito, sans-serif" }}>
          <div style={{ width: "min(720px, 100%)", borderRadius: "24px", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(9, 27, 18, 0.92)", padding: "28px", boxShadow: "0 20px 60px rgba(0,0,0,0.24)" }}>
            <div style={{ fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", opacity: 0.7, fontWeight: 800 }}>Eggzy Frontend Recovery</div>
            <h1 style={{ margin: "12px 0 10px", fontSize: "42px", lineHeight: 1.05 }}>Something broke while loading the lesson</h1>
            <p style={{ margin: 0, color: "rgba(243,255,245,0.78)", lineHeight: 1.7 }}>{this.state.message}</p>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "20px" }}>
              <button type="button" onClick={() => window.location.reload()} style={{ border: 0, borderRadius: "16px", padding: "14px 18px", background: "#58cc02", color: "#fff", fontWeight: 900, cursor: "pointer" }}>
                Reload Eggzy
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
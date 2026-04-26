import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles/styles.css";
import "./styles/app-live.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

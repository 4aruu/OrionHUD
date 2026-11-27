import React from "react";
import ReactDOM from "react-dom/client";
import { APP_NAME } from "../shared/brand";
import "../shared/themeBoot";
import "../shared/tokens.css";
import "./index.css";
import App from "./App";

const root = document.getElementById("root");
if (!root) throw new Error(`${APP_NAME}: #root element missing from the panel HTML`);

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

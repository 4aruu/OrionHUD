import React from "react";
import ReactDOM from "react-dom/client";
import { APP_NAME } from "../shared/brand";
import "../shared/themeBoot";
import "../shared/tokens.css";
import "../sidepanel/index.css";
import "./welcome.css";
import WelcomeApp from "./Welcome";

const root = document.getElementById("root");
if (!root) throw new Error(`${APP_NAME}: #root element missing from the welcome page HTML`);

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <WelcomeApp />
  </React.StrictMode>
);

import React, { useState, createContext, useMemo } from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider, createTheme } from "@mui/material";
import CssBaseline from "@mui/material/CssBaseline";
import App from "./App";
import "./index.css";

export type ThemeMode = "light" | "dark";

export const ThemeModeContext = createContext<{
  mode: ThemeMode;
  toggleMode: () => void;
}>({ mode: "light", toggleMode: () => {} });

function ThemedApp() {
  const [mode, setMode] = useState<ThemeMode>("light");

  const theme = useMemo(
    () =>
      createTheme({
        palette: { mode },
      }),
    [mode],
  );

  const toggleMode = () => {
    const next = mode === "light" ? "dark" : "light";
    setMode(next);
    if (next === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  return (
    <ThemeModeContext.Provider value={{ mode, toggleMode }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <App />
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemedApp />
  </React.StrictMode>,
);

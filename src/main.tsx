import { StrictMode, useLayoutEffect } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import App from "./App"

function BootTakeover() {
  useLayoutEffect(() => { document.getElementById("boot-shell")?.remove() }, [])
  return <App />
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BootTakeover />
  </StrictMode>,
)

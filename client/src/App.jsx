import { BrowserRouter, Routes, Route } from "react-router-dom";
import DocsPage from "./components/DocsPage";
import Editor from "./components/Editor";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DocsPage />} />
        <Route path="/:id" element={<Editor />} />
      </Routes>
    </BrowserRouter>
  );
}
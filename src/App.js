
import { BrowserRouter, Routes, Route } from "react-router-dom";
import MediasoupComponent from "./MediasoupClient";

function App() {
  return (
    <>
    <MediasoupComponent/>
      {/* <BrowserRouter>
        <Routes>
          <Route path="/sfu/:room" element={<MediasoupClient />} />
        </Routes>
      </BrowserRouter> */}
    </>
  );
}

export default App;

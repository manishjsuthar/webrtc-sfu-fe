import { BrowserRouter, Routes, Route } from "react-router-dom";
// import MediasoupComponent from "./MediasoupClient";
import TutorProctoring from "./TutorProctoring";
import StudentProctoring from "./StudentProctoring";

function App() {
  return (
    <>
      {/* <MediasoupComponent/> */}
      {/* <VideoStateProvider> */}
        <BrowserRouter>
          <Routes>
            <Route path="/st/:roomName" element={<StudentProctoring />} />
            <Route path="/tr/:roomName" element={<TutorProctoring />} />
          </Routes>
        </BrowserRouter>
      {/* </VideoStateProvider> */}
    </>
  );
}

export default App;

import { Routes, Route } from 'react-router-dom'
import About from './pages/About'
import Chat from './pages/Chat'

function App() {
  return (
    <Routes>
      <Route path="/" element={<About />} />
      <Route path="/chat" element={<Chat />} />
      <Route path="*" element={<About />} />
    </Routes>
  )
}

export default App

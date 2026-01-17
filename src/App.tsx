import { Routes, Route, Link } from 'react-router-dom';
import { Home } from './pages/Home';
import { AdminConverter } from './pages/AdminConverter';

function App() {
  return (
    <div>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin" element={<AdminConverter />} />
      </Routes>

      {/* Secret link for Admin (can be removed or hidden) */}
      <div className="fixed bottom-0 right-0 p-2 opacity-10 hover:opacity-100 transition-opacity">
        <Link to="/admin" className="text-xs text-gray-500">Admin</Link>
      </div>
    </div>
  );
}

export default App;

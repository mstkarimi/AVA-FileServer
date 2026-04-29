import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Admin from './pages/Admin';
import Browse from './pages/Browse';

function PrivateRoute({ children, requireRole }: { children: React.ReactNode; requireRole?: 'admin' }) {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');
  if (!token) return <Navigate to="/login" replace />;
  if (requireRole && role !== requireRole) {
    return <Navigate to={role === 'admin' ? '/admin' : '/browse'} replace />;
  }
  return <>{children}</>;
}

function RoleHome() {
  const role = localStorage.getItem('role');
  if (!role) return <Navigate to="/login" replace />;
  return <Navigate to={role === 'admin' ? '/admin' : '/browse'} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/admin"
          element={
            <PrivateRoute requireRole="admin">
              <Admin />
            </PrivateRoute>
          }
        />
        <Route
          path="/browse"
          element={
            <PrivateRoute>
              <Browse />
            </PrivateRoute>
          }
        />
        <Route path="*" element={<RoleHome />} />
      </Routes>
    </BrowserRouter>
  );
}

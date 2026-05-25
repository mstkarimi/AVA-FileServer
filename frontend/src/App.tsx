import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Login from './pages/Login';
import Admin from './pages/Admin';
import Browse from './pages/Browse';

function PrivateRoute({ children, requireRole }: { children: React.ReactNode; requireRole?: 'admin' }) {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');
  if (!token) return <Navigate to="/login" replace />;
  if (requireRole && role !== requireRole) {
    // Wrong role — send them to their home page instead of login
    return <Navigate to={role === 'admin' ? '/admin' : '/browse'} replace />;
  }
  return <>{children}</>;
}

function RoleHome() {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');
  // Only redirect to login when truly unauthenticated; otherwise go to role home.
  // This prevents browser Back from appearing to log out the user.
  if (!token) return <Navigate to="/login" replace />;
  return <Navigate to={role === 'admin' ? '/admin' : '/browse'} replace />;
}

function LoginRoute() {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');
  const location = useLocation();
  // If already logged in and navigating to /login (e.g. Back button),
  // redirect to their home page instead.
  if (token && !(location.state as { fromLogout?: boolean })?.fromLogout) {
    return <Navigate to={role === 'admin' ? '/admin' : '/browse'} replace />;
  }
  return <Login />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
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

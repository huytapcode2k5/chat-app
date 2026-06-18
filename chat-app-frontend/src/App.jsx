// import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
// import { AuthProvider, AuthContext } from './contexts/AuthContext';
// import Login from './pages/Login';
// import Register from './pages/Register';
// import ChatPage from './pages/ChatPage';
// import AIChatPage from './pages/AIChatPage';
// import AdminDashboard from './pages/AdminDashboard';
// import { useContext } from 'react';

// function PrivateRoute({ children, adminOnly = false }) {
//   const { user } = useContext(AuthContext);
//   if (!user) return <Navigate to="/login" />;
//   if (adminOnly && !user.isAdmin) return <Navigate to="/chat" />;
//   return children;
// }

// function App() {
//   return (
//     <BrowserRouter>
//       <AuthProvider>
//         <Routes>
//           <Route path="/login" element={<Login />} />
//           <Route path="/register" element={<Register />} />
//           <Route path="/chat" element={<PrivateRoute><ChatPage /></PrivateRoute>} />
//           <Route path="/ai-chat" element={<PrivateRoute><AIChatPage /></PrivateRoute>} />
//           <Route path="/admin" element={<PrivateRoute adminOnly><AdminDashboard /></PrivateRoute>} />
//           <Route path="*" element={<Navigate to="/chat" />} />
//         </Routes>
//       </AuthProvider>
//     </BrowserRouter>

//   );
// }

// export default App;


import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useContext } from 'react';
import { Toaster } from 'react-hot-toast';
import { AuthContext, AuthProvider } from './contexts/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import ChatPage from './pages/ChatPage';

/* Lazy-loaded AdminPage - create separately */
// const AdminPage = lazy(() => import('./pages/AdminPage'));

function ProtectedRoute({ children }) {
  const { user, loading } = useContext(AuthContext);
  if (loading) return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#060610', color: '#475569', gap: 12, fontFamily: 'Sora, sans-serif'
    }}>
      <div style={{ width: 20, height: 20, border: '2px solid rgba(255,255,255,.1)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      Đang tải...
    </div>
  );
  return user ? children : <Navigate to="/login" replace />;
}

function AdminRoute({ children }) {
  const { user, isAdmin, loading } = useContext(AuthContext);
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/chat" replace />;
  return children;
}

function GuestRoute({ children }) {
  const { user, loading } = useContext(AuthContext);
  if (loading) return null;
  return user ? <Navigate to="/chat" replace /> : children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#1a1e27',
              color: '#e2e8f0',
              border: '1px solid rgba(255,255,255,.1)',
              borderRadius: 12,
              fontSize: 13,
              fontFamily: 'Sora, sans-serif',
            },
            success: { iconTheme: { primary: '#22c55e', secondary: '#1a1e27' } },
            error: { iconTheme: { primary: '#ef4444', secondary: '#1a1e27' } },
          }}
        />
        <Routes>
          <Route path="/" element={<Navigate to="/chat" replace />} />
          <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
          <Route path="/register" element={<GuestRoute><Register /></GuestRoute>} />
          <Route path="/chat" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
          {/* <Route path="/admin"    element={<AdminRoute><AdminPage /></AdminRoute>} /> */}
          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
import { useState, useEffect } from 'react';
import './App.css';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import DashboardLayout from './components/layout/DashboardLayout';
import BotPresenceControl from './components/BotPresenceControl'; // We will create this component

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/user');
        if (res.ok) {
          const userData = await res.json();
          setIsAuthenticated(true);
          setUser(userData);
        } else {
          setIsAuthenticated(false);
          setUser(null);
        }
      } catch (error) {
        console.error('Error checking auth status:', error);
        setIsAuthenticated(false);
        setUser(null);
      }
    };
    checkAuth();
  }, []);

  const handleLogout = () => {
    window.location.href = '/auth/logout';
  };

  return (
    <Router>
      <DashboardLayout isAuthenticated={isAuthenticated} user={user} onLogout={handleLogout}>
        <Routes>
          <Route
            path="/dashboard"
            element={isAuthenticated ? <BotPresenceControl /> : <Navigate to="/" replace />}
          />
          <Route
            path="/"
            element={
              isAuthenticated ? (
                <Navigate to="/dashboard" replace />
              ) : (
                <div className="text-center text-gray-600">Please log in with Discord to access the dashboard.</div>
              )
            }
          />
          {/* Add more routes here */}
        </Routes>
      </DashboardLayout>
    </Router>
  );
}

export default App;

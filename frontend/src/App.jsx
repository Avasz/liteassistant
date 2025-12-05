import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import DeviceDetail from './pages/DeviceDetail';
import Settings from './pages/Settings';
import Automations from './pages/Automations';
import Schedules from './pages/Schedules';
import Notifications from './pages/Notifications';
import Profile from './pages/Profile';
import Layout from './components/Layout';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    // Initialize from localStorage to prevent logout on refresh
    return !!localStorage.getItem('token');
  });

  useEffect(() => {
    const token = localStorage.getItem('token');
    setIsAuthenticated(!!token);
  }, []);

  const PrivateRoute = ({ children }) => {
    return isAuthenticated ? children : <Navigate to="/login" />;
  };

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login setIsAuthenticated={setIsAuthenticated} />} />
        <Route path="/" element={
          <PrivateRoute>
            <Layout>
              <Dashboard />
            </Layout>
          </PrivateRoute>
        } />
        <Route path="/devices/:id" element={
          <PrivateRoute>
            <Layout>
              <DeviceDetail />
            </Layout>
          </PrivateRoute>
        } />
        <Route path="/schedules" element={
          <PrivateRoute>
            <Layout>
              <Schedules />
            </Layout>
          </PrivateRoute>
        } />
        <Route path="/settings" element={
          <PrivateRoute>
            <Layout>
              <Settings />
            </Layout>
          </PrivateRoute>
        } />
        <Route path="/automations" element={
          <PrivateRoute>
            <Layout>
              <Automations />
            </Layout>
          </PrivateRoute>
        } />
        <Route path="/notifications" element={
          <PrivateRoute>
            <Layout>
              <Notifications />
            </Layout>
          </PrivateRoute>
        } />
        <Route path="/profile" element={
          <PrivateRoute>
            <Layout>
              <Profile />
            </Layout>
          </PrivateRoute>
        } />
      </Routes>
    </Router>
  );
}

export default App;

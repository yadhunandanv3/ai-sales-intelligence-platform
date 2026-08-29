import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { api } from './services/api.js';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Assistant from './pages/Assistant.jsx';

// Protected Route Guard Component
const ProtectedRoute = ({ children }) => {
  const isAuth = api.isAuthenticated();
  return isAuth ? children : <Navigate to="/login" replace />;
};

// Navigation Header Layout Wrapper
const Layout = ({ children }) => {
  const location = useLocation();

  const handleLogout = async () => {
    await api.logout();
    window.location.href = '/login';
  };

  return (
    <div className="min-h-full flex flex-col">
      <nav className="bg-indigo-600 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center text-white font-bold text-lg mr-8">
                🚀 SalesIntel
              </div>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                <Link
                  to="/dashboard"
                  className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                    location.pathname === '/dashboard'
                      ? 'border-white text-white'
                      : 'border-transparent text-indigo-100 hover:border-indigo-300 hover:text-white'
                  }`}
                >
                  Lead Board
                </Link>
                <Link
                  to="/assistant"
                  className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                    location.pathname === '/assistant'
                      ? 'border-white text-white'
                      : 'border-transparent text-indigo-100 hover:border-indigo-300 hover:text-white'
                  }`}
                >
                  AI Assistant
                </Link>
              </div>
            </div>
            <div className="flex items-center">
              <button
                onClick={handleLogout}
                className="ml-4 px-4 py-2 text-sm font-medium text-white bg-indigo-700 hover:bg-indigo-800 rounded-md transition"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="flex-1 flex flex-col bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 flex flex-col w-full">
          {children}
        </div>
      </main>
    </div>
  );
};

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Layout>
                <Dashboard />
              </Layout>
            </ProtectedRoute>
          }
        />
        
        <Route
          path="/assistant"
          element={
            <ProtectedRoute>
              <Layout>
                <Assistant />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Router>
  );
}

export default App;

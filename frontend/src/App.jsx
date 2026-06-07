import React, { useState, useEffect } from 'react';
import Login from './pages/Login';
import RegisterCitizen from './pages/RegisterCitizen';
import RegisterHospital from './pages/RegisterHospital';
import RegisterFireStation from './pages/RegisterFireStation';
import CitizenDashboard from './pages/CitizenDashboard';
import AdminDashboard from './pages/AdminDashboard';
import HospitalDashboard from './pages/HospitalDashboard';
import FireStationDashboard from './pages/FireStationDashboard';
import TrafficAdminDashboard from './pages/TrafficAdminDashboard';

export default function App() {
  const [user, setUser] = useState(null);
  const [currentPage, setCurrentPage] = useState('login');

  useEffect(() => {
    // Check if user session already exists in localStorage
    const savedUser = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    
    if (savedUser && token) {
      try {
        const parsed = JSON.parse(savedUser);
        setUser(parsed);
        setCurrentPage('dashboard');
      } catch (e) {
        localStorage.clear();
      }
    }
  }, []);

  const handleLoginSuccess = (loggedInUser) => {
    setUser(loggedInUser);
    setCurrentPage('dashboard');
  };

  const handleLogout = () => {
    localStorage.clear();
    setUser(null);
    setCurrentPage('login');
  };

  const navigate = (page) => {
    setCurrentPage(page);
  };

  // Select view depending on current page and user role
  const renderContent = () => {
    if (currentPage === 'login') {
      return <Login onLoginSuccess={handleLoginSuccess} navigate={navigate} />;
    }
    
    if (currentPage === 'register-citizen') {
      return <RegisterCitizen navigate={navigate} />;
    }

    if (currentPage === 'register-hospital') {
      return <RegisterHospital navigate={navigate} />;
    }

    if (currentPage === 'register-fire-station') {
      return <RegisterFireStation navigate={navigate} />;
    }

    if (currentPage === 'dashboard' && user) {
      switch (user.role) {
        case 'citizen_user':
          return <CitizenDashboard user={user} onLogout={handleLogout} />;
        
        case 'medical_admin':
        case 'fire_admin':
          return <AdminDashboard user={user} onLogout={handleLogout} />;
        
        case 'traffic_admin':
          return <TrafficAdminDashboard user={user} onLogout={handleLogout} />;

        case 'hospital_user':
          return <HospitalDashboard user={user} onLogout={handleLogout} />;

        case 'fire_station_user':
          return <FireStationDashboard user={user} onLogout={handleLogout} />;

        default:
          return <Login onLoginSuccess={handleLoginSuccess} navigate={navigate} />;
      }
    }

    return <Login onLoginSuccess={handleLoginSuccess} navigate={navigate} />;
  };

  return (
    <div className="text-white bg-[#070b13] min-h-screen">
      {renderContent()}
    </div>
  );
}

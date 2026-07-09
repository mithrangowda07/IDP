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

// Import Notifications context and components
import { NotificationProvider, useNotifications } from './context/NotificationContext';
import EmergencyAlertModal from './components/EmergencyAlertModal';
import EmergencyBanner from './components/EmergencyBanner';

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
      return <DashboardWithNotifications user={user} onLogout={handleLogout} />;
    }

    return <Login onLoginSuccess={handleLoginSuccess} navigate={navigate} />;
  };

  return (
    <div className="text-white bg-[#070b13] min-h-[100dvh] overflow-x-hidden">
      {renderContent()}
    </div>
  );
}

// Wrapper to inject Notification Context globally across all logged-in views
function DashboardWithNotifications({ user, onLogout }) {
  const renderDashboard = () => {
    switch (user.role) {
      case 'citizen_user':
        return <CitizenDashboard user={user} onLogout={onLogout} />;
      
      case 'medical_admin':
      case 'fire_admin':
        return <AdminDashboard user={user} onLogout={onLogout} />;
      
      case 'traffic_admin':
        return <TrafficAdminDashboard user={user} onLogout={onLogout} />;

      case 'hospital_user':
        return <HospitalDashboard user={user} onLogout={onLogout} />;

      case 'fire_station_user':
        return <FireStationDashboard user={user} onLogout={onLogout} />;

      default:
        return <Login onLoginSuccess={() => {}} navigate={() => {}} />;
    }
  };

  return (
    <NotificationProvider user={user}>
      <DashboardContentWrapper renderDashboard={renderDashboard} />
    </NotificationProvider>
  );
}

// Inner wrapper to consume notification context and render global alert overlays
function DashboardContentWrapper({ renderDashboard }) {
  const { currentAlert, countdownSeconds, shouldShake, viewIncident, acknowledgeAlert } = useNotifications();

  return (
    <div className="relative min-h-[100dvh] flex flex-col w-full text-white">
      {/* Blinking Emergency Banner at the very top of the screen */}
      <EmergencyBanner alert={currentAlert} />
      
      {/* Active Dashboard */}
      <div className="flex-1 flex flex-col w-full">
        {renderDashboard()}
      </div>

      {/* Hospital emergency console pop-up overlay */}
      {currentAlert && (
        <EmergencyAlertModal
          alert={currentAlert}
          countdown={countdownSeconds}
          shouldShake={shouldShake}
          onView={viewIncident}
          onAcknowledge={acknowledgeAlert}
        />
      )}
    </div>
  );
}

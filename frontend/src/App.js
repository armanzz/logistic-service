import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import LoginPage from './pages/LoginPage';

import DriverLanding from './pages/DriverLanding';
import AdminDashboard from './pages/AdminDashboard';
import AdminMonitor from './pages/AdminMonitor'; // Monitor page
import BookingsPage from './pages/BookingPage';

import BookingDetails from './pages/BookingDetails';

const App = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/driver-landing" element={<DriverLanding />} />
        <Route path="/bookings" element={<BookingsPage />} />
        <Route path="/driver-landing" element={<DriverLanding />} />
        
        {/* Admin Pages */}
        <Route path="/admin-dashboard" element={<AdminDashboard />} />
        <Route path="/admin-monitor" element={<AdminMonitor />} />  {/* Admin Monitor Page */}

        <Route path="/booking/:id" element={<BookingDetails />} />
      </Routes>
    </Router>
  );
};

export default App;

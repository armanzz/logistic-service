// src/pages/LoginPage.js

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Navbar from '../components/navbar';
import './LoginPage.css'; // Import CSS for LoginPage

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');  // Default role is 'user'
  const navigate = useNavigate();

  const handleLogin = async () => {
    try {
      const response = await axios.post('http://localhost:4000/login', {
        email,
        password,
        role,
      });

      if (response.status === 200) {
        console.log('Login successful', response.data);
        // Redirect based on role
        if (role === 'user') {
          navigate('/bookings');  // Navigate to user's bookings page
        } else if (role === 'driver') {
          localStorage.setItem('driverId', response.data.user.id);
          navigate('/driver-landing');  // Navigate to driver's landing page
        } else if (role === 'admin') {
          navigate('/admin-dashboard');  // Navigate to admin dashboard
        }
      } else {
        console.log('Login failed', response.data.message);
      }
    } catch (error) {
      console.error('Error during login:', error);
      alert(error.response?.data?.message || 'Login failed');
    }
  };

  return (
    <div>
      <Navbar />
      <div className="login-container">
        <div className="login-box">
          <img src="/logo.png" alt="Logo" className="login-logo" />
          <h2>Login</h2>
          <input 
            type="email" 
            placeholder="Email" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            className="login-input"
          />
          <input 
            type="password" 
            placeholder="Password" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            className="login-input"
          />
          <select value={role} onChange={(e) => setRole(e.target.value)} className="login-select">
            <option value="user">User</option>
            <option value="driver">Driver</option>
            <option value="admin">Admin</option>
          </select>
          <button onClick={handleLogin} className="login-button">Login</button>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;

// src/components/Navbar.js

import React from 'react';
import Clock from './clock';
import './navbar.css'; // Import CSS for Navbar

const Navbar = () => {
  return (
    <nav className="navbar">
      <div className="navbar-left">
        <img src="/logo.png" alt="Logo" className="logo" />
      </div>
      <div className="navbar-center">
        <h1>A1 Logistics</h1>
      </div>
      <div className="navbar-right">
        <Clock />
      </div>
    </nav>
  );
};

export default Navbar;

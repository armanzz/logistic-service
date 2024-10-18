// src/components/Clock.js

import React, { useState, useEffect } from 'react';
import './clock.css'; // Import CSS for Clock

const Clock = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    // Update the time every second
    const timer = setInterval(() => setTime(new Date()), 1000);
    
    // Clean up the interval on component unmount
    return () => clearInterval(timer);
  }, []);

  // Format the time as HH:MM:SS
  const formattedTime = time.toLocaleTimeString();

  return (
    <div className="clock">
      {formattedTime}
    </div>
  );
};

export default Clock;

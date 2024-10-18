import React, { useEffect, useState } from 'react';
import socketIOClient from 'socket.io-client';

const TrackingPage = () => {
  const [driverLocations, setDriverLocations] = useState({});

  useEffect(() => {
    const socket = socketIOClient('http://localhost:4000');
    
    // Listen for real-time updates
    socket.on('locationUpdate', (data) => {
      setDriverLocations((prev) => ({
        ...prev,
        [data.driverId]: data.location,
      }));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <div>
      <h1>Driver Tracking</h1>
      {Object.keys(driverLocations).map((driverId) => (
        <div key={driverId}>
          <h2>Driver {driverId}</h2>
          <p>Latitude: {driverLocations[driverId].lat}</p>
          <p>Longitude: {driverLocations[driverId].lng}</p>
        </div>
      ))}
    </div>
  );
};

export default TrackingPage;

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom'; // UseNavigate for navigation
import axios from 'axios';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheckCircle, faTimesCircle } from '@fortawesome/free-solid-svg-icons';
import './DriverLanding.css';
import { io } from 'socket.io-client'; 
import Navbar from '../components/navbar';
const socket = io('http://localhost:4000');

const DriverLanding = () => {
  const [bookings, setBookings] = useState([]);
  const navigate = useNavigate(); // Use navigate for navigation

  useEffect(() => {
    const fetchBookings = async () => {
      try {
        const driverId = localStorage.getItem('driverId');
        
        // Fetch driver details (including vehicleType and location)
        const driverResponse = await axios.get(`http://localhost:4000/api/drivers/${driverId}`);
        const driver = driverResponse.data;
        const driverVehicleType = driver.vehicle;
        const driverLocation = driver.location;
  
        // Fetch bookings
        const response = await axios.get('http://localhost:4000/api/bookings');
        const allBookings = response.data;
        
  
        // Filter bookings based on conditions
       // In the fetchBookings function, after receiving all bookings, parse the pickupLocation and dropoffLocation
const filteredBookings = allBookings.filter((booking) => {
  // Parse the pickupLocation and dropoffLocation JSON strings
  const pickupLocation = JSON.parse(booking.pickupLocation);
  const dropoffLocation = JSON.parse(booking.dropoffLocation);

  // Calculate the distance using the parsed pickupLocation
  const distance = calculateDistance(driverLocation, {
    lat: parseFloat(pickupLocation.lat),
    lng: parseFloat(pickupLocation.lng),
  });

  console.log(distance);
  
  return (
    booking.vehicleType === driverVehicleType && distance <= 20 // Within 20 km
  );
});

  
        setBookings(filteredBookings);
      } catch (error) {
        console.error('Error fetching bookings or driver details:', error);
      }
    };
  
    fetchBookings();
  }, []);
  

  const acceptBooking = async (bookingId,userId) => {
    const driverId = localStorage.getItem('driverId');
    try {
      await axios.post('http://localhost:4000/api/bookings/accept', { bookingId,userId, driverId });

      socket.emit('driverConfirmed', { bookingId, driverId }); 


      // Navigate to the second page after accepting a booking
      navigate(`/booking/${bookingId}?userId=${userId}`);
    } catch (error) {
      console.error('Error accepting booking:', error);
    }
  };

  // Sort bookings to have pending at the top
  const sortedBookings = [...bookings].sort((a, b) => a.status === 'pending' ? -1 : 1);

  // Haversine formula to calculate distance in kilometers between two coordinates
const calculateDistance = (location1, location2) => {
  
  const toRad = (value) => (value * Math.PI) / 180;

  const R = 6371; // Radius of the Earth in kilometers
  const dLat = toRad(location2.lat - location1.lat);
  const dLon = toRad(location2.lng - location1.lng);

  const lat1 = toRad(location1.lat);
  const lat2 = toRad(location2.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in kilometers
};


  return (
    <div className="driver-landing">
      <Navbar /> 

      <div className="content">
        <div className="booking-list">
          <h1>Available Bookings</h1>
          <div className="bookings-grid">
            {sortedBookings.map((booking) => (
              <div key={booking.id} className="booking-card-large">
                <div className="booking-info">
                  <div><strong>Name:</strong> {booking.userName}</div>
                  <div><strong>Phone:</strong> {booking.userPhone}</div>
                  <div><strong>Status:</strong> {booking.status}</div>
                </div>
                <div className="booking-actions">
                  {booking.status === 'pending' && (
                    <>
                      <button className="icon accept" onClick={() => acceptBooking(booking.id,booking.userId)}>
                        <FontAwesomeIcon icon={faCheckCircle} /> Accept
                      </button>
                      <button className="icon reject">
                        <FontAwesomeIcon icon={faTimesCircle} /> Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DriverLanding;

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import { useParams } from 'react-router-dom';
import Navbar from '../components/navbar';
import { useNavigate } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { io } from 'socket.io-client';
import './BookingDetails.css'; // Add a separate CSS file for better styling
const socket = io('http://localhost:4000');


const BookingDetails = () => {
  const { id: bookingId } = useParams(); // Use useParams to get the bookingId from URL params
  const [booking, setBooking] = useState(null);
  const [driverLocation, setDriverLocation] = useState(null);
  // Add this useState hook at the top of the component
  const [buttonText, setButtonText] = useState('Start Ride');
  const navigate = useNavigate();
  const {userId} = useParams();


  // Fetch the booking details by ID
  useEffect(() => {
    const fetchBooking = async () => {
      try {
        const response = await axios.get(`http://localhost:4000/api/bookings/${bookingId}`, {
          params: { userId },
        });
        setBooking(response.data);

        // Fetch driver location
        const driverId = response.data.driverId;
        if (driverId) {
          const driverResponse = await axios.get(`http://localhost:4000/api/drivers/${driverId}/location`);
          setDriverLocation(driverResponse.data.location);
        }
      } catch (error) {
        console.error('Error fetching booking or driver details:', error);
      }
    };

    fetchBooking();
  }, [bookingId]);

  useEffect(() => {
    socket.on('locationUpdate', (data) => {
      setDriverLocation(data.location); // Update driver location in real-time
    });
  
    return () => {
      socket.off('locationUpdate');
    };
  }, []);
  


  const startRide = (driverId, bookingId) => {
    
    // Emit the "startRide" event only once when the ride is started
    socket.emit('startRide', { driverId, bookingId });
  
    // Watch the driver's location
    navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const newLocation = { lat: latitude, lng: longitude };
        console.log(newLocation);
  
        // Emit the driver's updated location to the server
        socket.emit('driverLocationUpdate', {driverId, location: newLocation });
        console.log( newLocation);
        setDriverLocation(newLocation); // Update the driver’s location without recursively calling startRide
      },
      (error) => {
        console.error('Error fetching location:', error);
      },
      { enableHighAccuracy: true }
    );
  };
  

  // Handle button clicks and ride status updates
const handleButtonClick = () => {
  if (buttonText === 'Start Ride') {
    startRide(booking.driverId, booking.id);
    setButtonText('Goods Collected?');
    updateBookingStatus('Driver is on the way!'); // Update status to 'in progress'
  } else if (buttonText === 'Goods Collected?') {
    setButtonText('Goods Delivered?');
    updateBookingStatus('in progress'); // Update status to 'in progress'
  } else if (buttonText === 'Goods Delivered?') {
    completeRide(); // Complete the ride and update status to 'completed'
  }
};

// Function to update the booking status using the new API
const updateBookingStatus = (status) => {
  axios.post('http://localhost:4000/api/bookings/update-status', { bookingId: booking.id, userId: booking.userId,status })
    .then((response) => {
      console.log(`Status updated to ${status}`);
      socket.emit('bookingStatusChanged', { bookingId: booking.id, status });
    })
    .catch((error) => {
      console.error('Error updating status:', error);
    });
};

// Complete the ride and set the status to 'completed'
const completeRide = () => {
  updateBookingStatus('completed'); // Update status to 'completed'
  navigate('/driver-landing'); // Redirect to the landing page
};


  // Log the booking details once the state is updated
  useEffect(() => {
    if (booking) {
      console.log(booking);
    }
  }, [booking]);

  if (!booking) {
    return <div>Loading...</div>;
  }

  // Custom component to dynamically update the map's viewport
  const UpdateMapViewport = ({ center, zoom }) => {
    const map = useMap();
    map.setView(center, zoom);
    return null;
  };

  return (
    <div className="booking-details">
      <Navbar />
      <div className="details-container">
        <div className="left">
          <div className="info-card">
            <h2>Pickup Location</h2>
            <p>{booking.pickupName}</p>
            <h2>Drop-off Location</h2>
            <p>{booking.dropoffName}</p>
           <button onClick={() => handleButtonClick() }>{buttonText}</button>
          </div>
        </div>
        <div className="right">
          <MapContainer
            center={[booking.pickupLocation.lat, booking.pickupLocation.lng]}
            zoom={13}
            style={{ height: '400px', width: '100%' }}
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <UpdateMapViewport center={[booking.pickupLocation.lat, booking.pickupLocation.lng]} zoom={13} />

            {/* Driver Marker with custom car icon */}
            {driverLocation && (
              <Marker
                position={[driverLocation.lat, driverLocation.lng]}
                icon={L.icon({
                  iconUrl: 'https://cdn-icons-png.flaticon.com/512/2202/2202112.png', // Car icon URL
                  iconSize: [32, 32], // Adjust size as needed
                  iconAnchor: [16, 32],
                })}
              />
            )}

            {/* Pickup Marker with default icon */}
            <Marker position={[booking.pickupLocation.lat, booking.pickupLocation.lng]} />

            {/* Draw Path Line Between Driver and Pickup */}
            {driverLocation && (
              <Polyline
                positions={[
                  [driverLocation.lat, driverLocation.lng],
                  [booking.pickupLocation.lat, booking.pickupLocation.lng],
                ]}
                color="blue" // Set the color of the line
              />
            )}
          </MapContainer>
        </div>
      </div>
    </div>
  );
};

export default BookingDetails;

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-defaulticon-compatibility';
import 'leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css';
import Navbar from '../components/navbar'; // Import Navbar
import { io } from 'socket.io-client'; // Import Socket.IO client
import L from 'leaflet';
import './BookingPage.css'; // Import CSS for styling

const socket = io('http://localhost:4000'); // Connect to your Socket.IO backend

const BookingPage = () => {
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [pickupCoords, setPickupCoords] = useState(null);
  const [dropoffCoords, setDropoffCoords] = useState(null);
  const [pickupSuggestions, setPickupSuggestions] = useState([]);
  const [dropoffSuggestions, setDropoffSuggestions] = useState([]);
  const [estimatedPrice, setEstimatedPrice] = useState(null);
  const [viewport, setViewport] = useState({
    center: [51.505, -0.09],
    zoom: 13,
  });

  const [loading, setLoading] = useState(false); // Loading state
  const [driverLocation, setDriverLocation] = useState(null); // Driver's location
  const [isDriverConfirmed, setIsDriverConfirmed] = useState(false); // Whether the driver has accepted the booking
  const [currentBookingId, setCurrentBookingId] = useState(null);
  const [booking, setBooking] = useState(null); // Store the fetched booking

  const apiKey = 'fba9abbfacb2475585ca4378f3c0f9c5';
  const apiUrl = 'https://api.opencagedata.com/geocode/v1/json';

  const userId = localStorage.getItem('userId');

  // Fetch booking data and driver location when booking is confirmed
  useEffect(() => {
    const fetchBooking = async () => {
      try {
        const response = await axios.get(`http://localhost:4000/api/bookings/${currentBookingId}`);
        setBooking(response.data);

        // Fetch driver location
       
      } catch (error) {
        console.error('Error fetching booking or driver details:', error);
      }
    };

    if (currentBookingId) {
      fetchBooking();
    }
  }, [currentBookingId]);

  useEffect(() => {
    socket.on('driverLocationUpdate', (location) => {
      setDriverLocation(location.location);
      console.log('Driver location updated:', location.location);
    });

    socket.on('bookingStatusChanged', (data) => {
      const { bookingId, status } = data;
      
      // If the bookingId matches the current booking, update the booking status
      if (bookingId === currentBookingId) {
        console.log(`Booking status changed to: ${status}`);
        setBooking((prevBooking) => ({ ...prevBooking, status }));
      }
    });

    return () => {
      socket.off('driverLocationUpdate');
      socket.off('bookingStatusChanged');
    };
  }, []);

  // Fetch the user's current location and set as pickup
  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setPickupCoords({ lat: latitude, lng: longitude });
        setViewport({
          center: [latitude, longitude],
          zoom: 15,
        });
      },
      (error) => {
        console.error('Error fetching user location:', error);
      }
    );
  }, []);

  useEffect(() => {
    // Listen for the 'bookingStatusUpdated' event from the server
    socket.on('bookingStatusUpdated', ({ bookingId, status }) => {
        if (bookingId === booking.id) {
            // Update the booking status
            setBooking((prevBooking) => ({ ...prevBooking, status }));
        }
    });

    // Cleanup function to remove the event listener when the component unmounts
    return () => {
        socket.off('bookingStatusUpdated');
    };
}, [booking?.id]);

  useEffect(() => {
    socket.on('driverConfirmed', (data) => {
      const { bookingId } = data; // Receive bookingId
      console.log(`Driver confirmed for booking ${bookingId}`);

      setIsDriverConfirmed(true);
      setCurrentBookingId(bookingId);
      setLoading(false); // Stop the loading screen when the driver is confirmed
    });

    return () => {
      socket.off('driverConfirmed');
    };
  }, []);

  useEffect(() => {
    if (pickupCoords && dropoffCoords && vehicleType) {
      const distance = calculateDistance(pickupCoords, dropoffCoords);
      const price = calculatePrice(vehicleType, distance);
      setEstimatedPrice(price);
    }
  }, [pickupCoords, dropoffCoords, vehicleType]);



  if (loading && !isDriverConfirmed) {
    return (
      <div className="loading-screen">
        <img src="/loading.gif" alt="Loading..." className="loading-gif" />
        <h2>Assigning driver...</h2>
      </div>
    );
  }

  const calculateDistance = (pickupCoords, dropoffCoords) => {
    const toRad = (value) => (value * Math.PI) / 180;

    const R = 6371; // Radius of Earth in kilometers
    const dLat = toRad(dropoffCoords.lat - pickupCoords.lat);
    const dLon = toRad(dropoffCoords.lng - pickupCoords.lng);

    const lat1 = toRad(pickupCoords.lat);
    const lat2 = toRad(dropoffCoords.lat);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const distance = R * c; // Distance in kilometers
    return distance;
  };

  // Function to calculate price based on vehicle type and distance
  const calculatePrice = (vehicleType, distance) => {
    let baseRate;

    switch (vehicleType) {
      case 'Van':
        baseRate = 10;
        break;
      case 'Truck':
        baseRate = 15;
        break;
      case 'Bike':
        baseRate = 5;
        break;
      default:
        baseRate = 0;
    }

    const price = baseRate * distance;
    return price < 20 ? 20 : price.toFixed(2); // Ensure a minimum price of 20
  };

  // Update price when both pickup and dropoff coordinates are available
  

  // Fetch suggestions for pickup location
  const handlePickupSearch = async (query) => {
    setPickup(query);
    const requestUrl = `${apiUrl}?key=${apiKey}&q=${encodeURIComponent(query)}&pretty=1&no_annotations=1`;
    try {
      const response = await axios.get(requestUrl);
      setPickupSuggestions(response.data.results);
    } catch (error) {
      console.error('Error fetching pickup location suggestions:', error);
    }
  };

  // Fetch suggestions for dropoff location
  const handleDropoffSearch = async (query) => {
    setDropoff(query);
    const requestUrl = `${apiUrl}?key=${apiKey}&q=${encodeURIComponent(query)}&pretty=1&no_annotations=1`;
    try {
      const response = await axios.get(requestUrl);
      setDropoffSuggestions(response.data.results);
    } catch (error) {
      console.error('Error fetching dropoff location suggestions:', error);
    }
  };

  // Handle selecting a suggestion for pickup
  const handlePickupSelect = (suggestion) => {
    setPickup(suggestion.formatted);
    setPickupCoords(suggestion.geometry);
    setViewport({
      center: [suggestion.geometry.lat, suggestion.geometry.lng],
      zoom: 15,
    });
    setPickupSuggestions([]);
  };

  // Handle selecting a suggestion for dropoff
  const handleDropoffSelect = (suggestion) => {
    setDropoff(suggestion.formatted);
    setDropoffCoords(suggestion.geometry);
    setViewport({
      center: [suggestion.geometry.lat, suggestion.geometry.lng],
      zoom: 12,
    });
    setDropoffSuggestions([]);
  };

  // Custom component to dynamically update the map's viewport
  const UpdateMapViewport = ({ viewport }) => {
    const map = useMap();
    map.setView(viewport.center, viewport.zoom);
    return null;
  };

  // Handle the booking action and send the booking data to the backend
  const handleBooking = async () => {
    if (pickupCoords && dropoffCoords && vehicleType) {
      setLoading(true); // Show loading
      const bookingData = {
        pickupLocation: pickupCoords,
        dropoffLocation: dropoffCoords,
        pickupName: pickup,
        dropoffName: dropoff,
        vehicleType,
        userId,
      };
      try {
        const response = await axios.post('http://localhost:4000/api/bookings/create', bookingData);
        if (response.status === 200) {
          setCurrentBookingId(response.data.bookingId);
          console.log(response.data); // Set current booking ID
          setLoading(true); // Hide loading
        }
      } catch (error) {
        console.error('Error creating booking:', error);
        setLoading(false); // Hide loading on error
        alert('Failed to create booking');
      }
    } else {
      alert('Please select valid pickup, dropoff locations and vehicle type');
    }
  };

  return (
    <div>
      <Navbar />
      <div className="booking-container">
        <div className="booking-box">
          <h1>Book a Vehicle</h1>

          {/* Pickup Location Input */}
          <div>
            <label>Pickup Location:</label>
            <input
              type="text"
              value={pickup}
              onChange={(e) => handlePickupSearch(e.target.value)}
              placeholder="Enter pickup location"
              className="booking-input"
              disabled={isDriverConfirmed} // Disable input if driver is confirmed
            />
            {pickupSuggestions.length > 0 && !isDriverConfirmed && (
              <ul className="suggestions-list">
                {pickupSuggestions.map((suggestion, index) => (
                  <li key={index} onClick={() => handlePickupSelect(suggestion)}>
                    {suggestion.formatted}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Hide dropoff and book now button if driver is confirmed */}
          {!isDriverConfirmed && (
            <>
              {/* Dropoff Location Input */}
              <div>
                <label>Dropoff Location:</label>
                <input
                  type="text"
                  value={dropoff}
                  onChange={(e) => handleDropoffSearch(e.target.value)}
                  placeholder="Enter dropoff location"
                  className="booking-input"
                />
                {dropoffSuggestions.length > 0 && (
                  <ul className="suggestions-list">
                    {dropoffSuggestions.map((suggestion, index) => (
                      <li key={index} onClick={() => handleDropoffSelect(suggestion)}>
                        {suggestion.formatted}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Vehicle Type Selection */}
              <div>
                <label>Vehicle Type:</label>
                <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} className="booking-select">
                  <option value="">Select Vehicle Type</option>
                  <option value="Van">Van</option>
                  <option value="Truck">Truck</option>
                  <option value="Bike">Bike</option>
                </select>
              </div>

               {/* Show estimated price */}
          {estimatedPrice && (
            <div className="price-box">
              <h3>Estimated Price: <span className="price-value">{estimatedPrice} Rs</span></h3>
            </div>
          )}

              <button onClick={handleBooking} className="booking-button">
                Book Now
              </button>
            </>
          )}

          {/* Show booking status when driver is confirmed */}
          {isDriverConfirmed && booking && (
            <div className="driver-confirmed">
              <h2>{booking.status}</h2> {/* Display the booking status */}
            </div>
          )}
        </div>

        {/* Map Display */}
        <div className="map-container">
          <MapContainer
            center={viewport.center}
            zoom={viewport.zoom}
            style={{ height: '400px', width: '100%', marginTop: '20px' }}
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <UpdateMapViewport viewport={viewport} />

            {/* Pickup Marker */}
            {pickupCoords && <Marker position={[pickupCoords.lat, pickupCoords.lng]}></Marker>}

            {/* Dropoff Marker */}
            {dropoffCoords && !isDriverConfirmed && (
              <Marker position={[dropoffCoords.lat, dropoffCoords.lng]}></Marker>
            )}

            {/* Draw Path Line Between Pickup and Driver Location */}
            {pickupCoords && driverLocation && (
              <Polyline
                positions={[
                  [pickupCoords.lat, pickupCoords.lng],
                  [driverLocation.lat, driverLocation.lng],
                ]}
                color="blue" // Set the color of the line
              />
            )}

            {/* Driver's Location Marker */}
            {driverLocation && (
  <Marker
    position={[driverLocation.lat, driverLocation.lng]}
    icon={L.icon({
      iconUrl: 'https://cdn-icons-png.flaticon.com/512/2202/2202112.png', // URL of the driver/car icon
      iconSize: [32, 32], // Size of the icon
      iconAnchor: [16, 32], // Anchor point of the icon
    })}
  />
)}

          </MapContainer>
        </div>
      </div>
    </div>
  );
};

export default BookingPage;

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');



const { createClient } = require('redis');
const bodyParser = require('body-parser');
const db = require('./db');

// Redis connection setup
const client = createClient({
  password: 'pJmUJ0wT14JaN7JiANSqNdFmoLSuP3lF',
  socket: {
    host: 'redis-10863.c80.us-east-1-2.ec2.redns.redis-cloud.com',
    port: 10863
  }
});


// Handle Redis connection
client.on('connect', () => {
  console.log('Connected to Redis');
});

client.on('error', (err) => {
  console.error('Redis connection error:', err);
});

// Connect to Redis
(async () => {
  await client.connect();
  // Uncomment below to reset the bookingIdCounter to 0 if needed:
  await client.set('bookingIdCounter', 0); // Reset counter to start from 1
})();
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: ['http://localhost:3000'], // Frontend URL
    methods: ['GET', 'POST']
  }
});
const cors = require('cors');
app.use(cors({
  origin: ['http://localhost:3000'], // Frontend URL
  methods: ['GET', 'POST'],
  credentials: true
}));

// Middleware
app.use(bodyParser.json());

// User and Driver Registration Route
app.post('/register', async (req, res) => {
  const { name, email, phone, password, role, vehicle } = req.body;
  
  const userKey = role === 'driver' ? `driver:${phone}` : `user:${email}`;
  
  const existingUser = await client.exists(userKey);
  
  if (existingUser) {
    return res.status(400).json({ message: `${role} already exists!` });
  }

  const data = role === 'driver'
    ? { id: phone, name, phone, password, vehicle, location: { lat: 0, lng: 0 }, available: true }
    : { id: email, name, email, phone, password, bookings: [] };

  // Store in Redis
  await client.hSet(userKey, data);

  res.json({ message: `${role} registered successfully!` });
});

// Login Route
app.post('/login', async (req, res) => {
  const { email, password, role } = req.body;
  let userKey = null;

  try {
    // Fetch all keys for drivers, users, or admins based on the role
    const keys = await client.keys(role === 'driver' ? 'driver:*' : role === 'admin' ? 'admin:*' : 'user:*');

    // Find the correct key by matching the email or phone
    for (const key of keys) {
      const storedUser = await client.hGetAll(key);
      
      // Check if email or phone matches
      if (storedUser.email === email || storedUser.phone === email) {
        userKey = key;
        break;
      }
    }

    // If no matching user is found in Redis, query MySQL
    if (!userKey) {
      const userQuery = role === 'driver'
        ? 'SELECT * FROM drivers WHERE phone = ?'
        : role === 'admin'
        ? 'SELECT * FROM admin WHERE email = ?' // Admin table check
        : 'SELECT * FROM users WHERE email = ?';

      db.query(userQuery, [email], (err, rows) => {
        if (err) {
          console.error('MySQL error:', err);
          return res.status(500).json({ message: 'Internal server error' });
        }

        // If no user is found in MySQL
        if (rows.length === 0) {
          return res.status(400).json({ message: 'User not found!' });
        }

        const user = rows[0];

        // Validate password
        if (user.password !== password) {
          return res.status(400).json({ message: 'Invalid password!' });
        }

        // Cache user/admin data in Redis for future logins
        const redisKey = role === 'driver' ? `driver:${user.phone}` : role === 'admin' ? `admin:${user.email}` : `user:${user.email}`;
        client.hSet(redisKey, {
          id: user.id.toString(),
          email: user.email || user.phone,
          password: user.password,
          name: user.name || '',
        });

        // Return success with user data
        return res.json({ message: 'Login successful', userId: user.id, user });
      });
    } else {
      const storedUser = await client.hGetAll(userKey);

      // Validate password
      if (storedUser.password !== password) {
        return res.status(400).json({ message: 'Invalid password!' });
      }

      // Parse the userId from the Redis key (e.g., driver:<userId>)
      const userId = userKey.split(':')[1];

      // Return success with user data
      return res.json({ message: 'Login successful', userId: userId, user: storedUser });
    }
  } catch (err) {
    console.error('Error during login:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/drivers/:driverId', async (req, res) => {
  const driverId = req.params.driverId;

  try {
    // Query to fetch driver details by ID, phone, vehicle, and location (stored as JSON)
    const query = 'SELECT id, name, phone, vehicle, location FROM drivers WHERE id = ?';
    
    db.query(query, [driverId], (err, results) => {
      if (err) {
        return res.status(500).json({ message: 'Error fetching driver details from MySQL' });
      }

      if (results.length === 0) {
        return res.status(404).json({ message: 'Driver not found' });
      }

      // Assuming each driver has a unique ID, return the first result
      const driver = results[0];

      // Parse the JSON location column to extract lat and lng
      const location = JSON.parse(driver.location); // Assuming location is stored as JSON string

      res.json({
        id: driver.id,
        name: driver.name,
        phone: driver.phone,
        vehicle: driver.vehicle,
        location: {
          lat: location.lat,
          lng: location.lng
        }
      });
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});


const getNextBookingId = async () => {
  return await client.incr('bookingIdCounter'); // Redis automatically increments the value
};

// Booking creation route
// Booking creation route
app.post('/api/bookings/create', (req, res) => {
  const { pickupLocation, dropoffLocation, vehicleType, userId, pickupName, dropoffName } = req.body;

  if (!pickupLocation || !dropoffLocation || !vehicleType || !userId || !pickupName || !dropoffName) {
    return res.status(400).json({ message: 'Missing booking details or user ID' });
  }

  const bookingQuery = 'INSERT INTO bookings (userId, pickupLocation, dropoffLocation, pickupName, dropoffName, vehicleType, status, estimatedPrice, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
  const bookingParams = [
    userId, 
    JSON.stringify(pickupLocation), 
    JSON.stringify(dropoffLocation), 
    pickupName, // Save pickupName to the database
    dropoffName, // Save dropoffName to the database
    vehicleType, 
    'pending', 
    (Math.random() * 100).toFixed(2), 
    new Date()
  ];

  db.query(bookingQuery, bookingParams, (err, result) => {
    if (err) {
      console.error('Error creating booking:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }

    const bookingId = result.insertId;

    // Cache the booking in Redis
    const booking = {
      id: bookingId,
      userId,
      driverId: null,
      pickupLocation,
      dropoffLocation,
      pickupName, // Include pickupName in the cache
      dropoffName, // Include dropoffName in the cache
      vehicleType,
      status: 'pending',
      estimatedPrice: (Math.random() * 100).toFixed(2),
      createdAt: new Date().toISOString()
    };
    client.hSet(`booking:${bookingId}`, 'id', booking.id.toString());
    client.hSet(`booking:${bookingId}`, 'userId', booking.userId.toString());
    client.hSet(`booking:${bookingId}`, 'driverId', booking.driverId ? booking.driverId.toString() : '');
    client.hSet(`booking:${bookingId}`, 'pickupLocation', JSON.stringify(booking.pickupLocation));
    client.hSet(`booking:${bookingId}`, 'dropoffLocation', JSON.stringify(booking.dropoffLocation));
    client.hSet(`booking:${bookingId}`, 'pickupName', booking.pickupName); // Cache pickupName
    client.hSet(`booking:${bookingId}`, 'dropoffName', booking.dropoffName); // Cache dropoffName
    client.hSet(`booking:${bookingId}`, 'vehicleType', booking.vehicleType.toString());
    client.hSet(`booking:${bookingId}`, 'status', booking.status);
    client.hSet(`booking:${bookingId}`, 'estimatedPrice', booking.estimatedPrice.toString());
    client.hSet(`booking:${bookingId}`, 'createdAt', booking.createdAt);

    res.json({ message: 'Booking created successfully', booking: booking });
  });
});


// Fetch all vehicles with driver information
app.get('/api/admin/vehicles', async (req, res) => {
  try {
    const query = `
      SELECT * 
      FROM drivers;
      
    `;

    db.query(query, (err, results) => {
      if (err) {
        return res.status(500).json({ message: 'Error fetching vehicles', error: err });
      }

      res.json(results); // Return the list of vehicles with driver information
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});


// Fetch number of bookings per driver for analytics
app.get('/api/admin/bookings-per-driver', async (req, res) => {
  try {
    const query = `
      SELECT drivers.name AS driverName, COUNT(bookings.id) AS bookingCount
      FROM bookings
      JOIN drivers ON bookings.driverId = drivers.id
      GROUP BY drivers.name;
    `;

    db.query(query, (err, results) => {
      if (err) {
        return res.status(500).json({ message: 'Error fetching bookings per driver', error: err });
      }

      res.json(results); // Return the number of bookings per driver
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});


// Fetch number of bookings by created date
app.get('/api/admin/bookings-per-day', async (req, res) => {
  try {
    const query = `
      SELECT DATE(createdAt) AS date, COUNT(id) AS bookingCount
      FROM bookings
      GROUP BY DATE(createdAt)
      ORDER BY date;
    `;

    db.query(query, (err, results) => {
      if (err) {
        return res.status(500).json({ message: 'Error fetching bookings per day', error: err });
      }

      res.json(results); // Return the number of bookings per day
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});


// Fetch the number of vehicles by type
app.get('/api/admin/vehicle-types', async (req, res) => {
  try {
    const query = `
      SELECT vehicle, COUNT(vehicle) AS vehicleCount
      FROM drivers
      GROUP BY vehicle;
    `;

    db.query(query, (err, results) => {
      if (err) {
        return res.status(500).json({ message: 'Error fetching vehicle types', error: err });
      }

      res.json(results); // Return the number of vehicles by type
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});


// Fetch all bookings with user and vehicle information
app.get('/api/admin/bookings', async (req, res) => {
  try {
    const query = `
      SELECT bookings.id, bookings.status, bookings.driverId, bookings.vehicleType, bookings.pickupName, bookings.dropoffName, users.name AS userName, users.phone AS userPhone, bookings.createdAt
      FROM bookings
      JOIN users ON bookings.userId = users.id;
    `;

    db.query(query, (err, results) => {
      if (err) {
        return res.status(500).json({ message: 'Error fetching bookings', error: err });
      }

      res.json(results); // Return the list of bookings with user and vehicle information
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});


// Fetch all bookings with user details
app.get('/api/bookings', (req, res) => {
  try {
    // Query to fetch bookings along with user details directly from MySQL
    const query = `
      SELECT bookings.*, users.name AS userName, users.phone AS userPhone
      FROM bookings
      JOIN users ON bookings.userId = users.id;
    `;

    // Execute the query using db.query
    db.query(query, (err, results) => {
      if (err) {
        console.error('Error fetching bookings from MySQL:', err);
        return res.status(500).json({ message: 'Error fetching bookings from MySQL' });
      }

      res.json(results); // Return the results from MySQL
    });
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Fetch a single booking by ID with pickup and drop-off locations
// Fetch a single booking by ID with pickup and drop-off locations and names
app.get('/api/bookings/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Check Redis cache for the booking
    const bookingKey = `booking:${id}`;
    const cachedBooking = await client.hGetAll(bookingKey);

    if (Object.keys(cachedBooking).length > 0) {
      // If booking is found in Redis, parse pickup and dropoff locations and return them
      cachedBooking.pickupLocation = JSON.parse(cachedBooking.pickupLocation);
      cachedBooking.dropoffLocation = JSON.parse(cachedBooking.dropoffLocation);
      return res.json(cachedBooking);
    }

    // If not found in Redis, query the MySQL database
    const query = `
      SELECT bookings.id, bookings.userId, bookings.driverId, 
             bookings.pickupLocation, bookings.dropoffLocation, 
             bookings.pickupName, bookings.dropoffName, 
             bookings.vehicleType, bookings.status, bookings.estimatedPrice, 
             bookings.createdAt, users.name AS userName, users.phone AS userPhone
      FROM bookings
      JOIN users ON bookings.userId = users.id
      WHERE bookings.id = ?;
    `;

    db.query(query, [id], async (err, results) => {
      if (err || results.length === 0) {
        return res.status(404).json({ message: 'Booking not found' });
      }

      const booking = results[0];

      // Parse pickup and dropoff locations from JSON in MySQL
      booking.pickupLocation = JSON.parse(booking.pickupLocation);
      booking.dropoffLocation = JSON.parse(booking.dropoffLocation);

      // Cache the result in Redis for future use
      await client.hSet(bookingKey, {
        id: booking.id.toString(),
        userId: booking.userId.toString(),
        driverId: booking.driverId ? booking.driverId.toString() : '',
        pickupLocation: JSON.stringify(booking.pickupLocation), // Store as string in Redis
        dropoffLocation: JSON.stringify(booking.dropoffLocation), // Store as string in Redis
        pickupName: booking.pickupName, // Store pickupName in Redis
        dropoffName: booking.dropoffName, // Store dropoffName in Redis
        vehicleType: booking.vehicleType,
        status: booking.status,
        estimatedPrice: booking.estimatedPrice.toString(),
        createdAt: booking.createdAt,
        userName: booking.userName,
        userPhone: booking.userPhone,
      });

      // Return the booking with pickup and dropoff locations and names from MySQL
      res.json(booking);
    });
  } catch (err) {
    console.error('Error fetching booking:', err);
    res.status(500).json({ message: 'Server error' });
  }
});


// Accept a booking and update the driverId and status
app.post('/api/bookings/accept', async (req, res) => {
  const { bookingId, driverId } = req.body;

  try {
    // Update the booking in MySQL first
    const query = 'UPDATE bookings SET driverId = ?, status = ? WHERE id = ?';
    db.query(query, [driverId, 'confirmed', bookingId], async (err, result) => {
      if (err || result.affectedRows === 0) {
        return res.status(404).json({ message: 'Booking not found' });
      }

      // If MySQL update is successful, update Redis cache
      const bookingKey = `booking:${bookingId}`;
      await client.hSet(bookingKey, 'driverId', driverId);
      await client.hSet(bookingKey, 'status', 'confirmed');

      res.json({ message: 'Booking accepted successfully' });
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Fetch driver's location based on driverId
app.get('/api/drivers/:driverId/location', async (req, res) => {
  const { driverId } = req.params;

  try {
    // Check Redis cache for driver location
    const location = await client.hGet(`driver:${driverId}`, 'location');
    if (location) {
      return res.json({ driverId, location: JSON.parse(location) });
    }

    // If not in Redis, fetch location from MySQL
    const query = 'SELECT location FROM drivers WHERE id = ?';
    db.query(query, [driverId], async (err, results) => {
      if (err || results.length === 0) {
        return res.status(404).json({ message: 'Driver not found' });
      }

      const driverLocation = results[0].location;
      await client.hSet(`driver:${driverId}`, 'location', driverLocation); // Cache location in Redis
      res.json({ driverId, location: JSON.parse(driverLocation) });
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});



// Listen for driver location updates via Socket.IO
// Backend server emitting location updates
// Backend server emitting location updates
io.on('connection', (socket) => {
  console.log('New client connected');


  socket.on('driverConfirmed', (data) => {
    const { bookingId, driverId } = data; // Extract bookingId and driverId
    console.log(`Driver confirmed for booking ${bookingId} from driver ${driverId}`);
    
    // Emit 'driverConfirmed' to all clients with the necessary data
    io.emit('driverConfirmed', { bookingId, driverId });
  });
    

  // Handle when the driver starts the ride
  socket.on('startRide', async (data) => {
    console.log("started ride");
    const { driverId, bookingId } = data;
    
    // Fetch driver's initial location from Redis or MySQL
    const location = await client.hGet(`driver:${driverId}`, 'location');
    
    // Emit the initial location to both driver and user (all connected clients)
    io.emit(`ride:${bookingId}`, { driverId, location: JSON.parse(location), status: 'started' });
  });

  socket.on('bookingStatusChanged', ({ bookingId, status }) => {
    console.log(`Booking ${bookingId} status changed to: ${status}`);
    
    // Emit the update to other connected clients (if necessary)
    // You can broadcast the change to other clients as needed
    io.emit('bookingStatusUpdated', { bookingId, status });
});


  // Listen for real-time location updates from the driver
  socket.on('driverLocationUpdate', async (data) => {
    const {driverId,location } = data;
    console.log(`hello from ${location}`);

    try {
      // Update Redis cache with the new location
      await client.hSet(`driver:${driverId}`, 'location', JSON.stringify(location));

      // Optionally, update MySQL (for persistence)
      const query = 'UPDATE drivers SET location = ? WHERE id = ?';
      db.query(query, [JSON.stringify(location), driverId], (err) => {
        if (err) {
          console.error('Error updating driver location in MySQL:', err);
        }
      });

      // Emit the updated location to all clients (user and driver)
      io.emit('driverLocationUpdate', { location });
      
    } catch (err) {
      console.error('Error updating driver location:', err);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});




// API route to update booking status
app.post('/api/bookings/update-status', async (req, res) => {
  const { bookingId, status } = req.body;

  if (!bookingId || !status) {
    return res.status(400).json({ message: 'Missing booking ID or status' });
  }

  try {
    // Update booking status in MySQL
    const query = 'UPDATE bookings SET status = ? WHERE id = ?';
    db.query(query, [status, bookingId], (err, result) => {
      if (err || result.affectedRows === 0) {
        return res.status(500).json({ message: 'Error updating booking status or booking not found' });
      }

      // Optionally update Redis (if using Redis cache)
      client.hSet(`booking:${bookingId}`, 'status', status);

      res.json({ message: 'Booking status updated successfully', status });
    });
  } catch (err) {
    res.status(500).json({ message: 'Internal server error' });
  }
});


const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

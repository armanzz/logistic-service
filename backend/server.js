const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mysql = require('mysql2/promise');



const { createClient } = require('redis');
const bodyParser = require('body-parser');


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


const shards = {
  shard1: mysql.createPool({
    host: process.env.SHARD1_DB_HOST || 'shard1-db',
    user: 'root',
    password: 'rootpassword',
    database: 'shard1',
    port: process.env.SHARD1_DB_PORT || 3306
  }),
  shard2: mysql.createPool({
    host: process.env.SHARD2_DB_HOST || 'shard2-db',
    user: 'root',
    password: 'rootpassword',
    database: 'shard2',
    port: process.env.SHARD2_DB_PORT || 3306
  }),
  shard3: mysql.createPool({
    host: process.env.SHARD3_DB_HOST || 'shard3-db',
    user: 'root',
    password: 'rootpassword',
    database: 'shard3',
    port: process.env.SHARD3_DB_PORT || 3306
  })
};


const getShard = (userId) => {
  const shardKeys = Object.keys(shards);

  // Log the shard details
  console.log(`Determining shard for userId: ${userId}`);

  // Calculate shardIndex based on the pattern: 1, 4, 7 -> shard1; 2, 5, 8 -> shard2; 3, 6, 9 -> shard3
  const shardIndex = (userId - 1) % shardKeys.length;

  // Access the shard key directly using the shardIndex
  const shardKey = shardKeys[shardIndex];

  // Ensure that the shardKey exists in the shards object
  if (shards[shardKey]) {
    console.log(`Shard selected: ${shardKey}`);
    return shards[shardKey];
  } else {
    console.error(`Invalid shard index for userId: ${userId}`);
    return undefined;
  }
};



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
    const keys = await client.keys(role === 'driver' ? 'driver:*' : 'user:*');
    for (const key of keys) {
      const storedUser = await client.hGetAll(key);
      if (storedUser.email === email || storedUser.phone === email) {
        userKey = key;
        break;
      }
    }

    if (!userKey) {
      // If user is not found in Redis, query MySQL using the user's email/phone to find the userId first
      let userId;
      let query;
      if (role === 'driver') {
        query = 'SELECT id FROM drivers WHERE phone = ?';
      } else {
        query = 'SELECT id FROM users WHERE email = ?';
      }

      // Loop through all shards to find the user
      const shardKeys = Object.keys(shards);
      let found = false;
      let shard;

      for (const shardKey of shardKeys) {
        shard = shards[shardKey];
        const shardQueryConnection = await shard.getConnection();
        try {
          const [rows] = await shardQueryConnection.execute(query, [email]);
          if (rows.length > 0) {
            userId = rows[0].id;
            found = true;
            console.log(`User ID found in ${shardKey}: ${userId}`);
            break;
          }
        } finally {
          shardQueryConnection.release();
        }
      }

      if (!found) {
        return res.status(400).json({ message: 'User not found!' });
      }

      // Use the actual userId to determine the shard
      console.log(`User ID found: ${userId}`);
      const userShard = getShard(userId);
      

      const connection = await userShard.getConnection();
      

      try {
        // Fetch the full user data from the shard where the user is stored
        const fullUserQuery = role === 'driver'
          ? 'SELECT * FROM drivers WHERE id = ?'
          : 'SELECT * FROM users WHERE id = ?';
        console.log(`Executing query on shard ${userShard.name}: ${fullUserQuery}`);
        const [userRows] = await connection.execute(fullUserQuery, [userId]);
        console.log('Query result:', userRows);

        if (userRows.length === 0) {
          return res.status(400).json({ message: 'User not found!' });
        }

        const user = userRows[0];

        // Validate password
        if (user.password !== password) {
          return res.status(400).json({ message: 'Invalid password!' });
        }

        // Cache user/admin data in Redis for future logins
        const redisKey = role === 'driver' ? `driver:${user.phone}` : `user:${user.email}`;
        await client.hSet(redisKey, {
          id: user.id.toString(),
          email: user.email || user.phone,
          password: user.password,
          name: user.name || '',
        });

        return res.json({ message: 'Login successful', userId: user.id, user });
      } finally {
        connection.release();
      }
    } else {
      const storedUser = await client.hGetAll(userKey);

      // Validate password
      if (storedUser.password !== password) {
        return res.status(400).json({ message: 'Invalid password!' });
      }

      const userId = storedUser.id;

      // Use the correct shard based on the userId
      const shard = getShard(Number(userId));

      return res.json({ message: 'Login successful', userId, user: storedUser });
    }
  } catch (err) {
    console.error('Error during login:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});



app.get('/api/drivers/:driverId', async (req, res) => {
  const driverId = Number(req.params.driverId); // Convert driverId to a number

  try {
    // Use the driverId to determine the correct shard
    const shard = getShard(driverId);
    const connection = await shard.getConnection();

    try {
      // Query to fetch driver details by ID, phone, vehicle, and location (stored as JSON)
      const query = 'SELECT id, name, phone, vehicle, location FROM drivers WHERE id = ?';
      const [results] = await connection.execute(query, [driverId]);

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
          lng: location.lng,
        },
      });
    } finally {
      connection.release(); // Release the connection back to the pool
    }
  } catch (err) {
    console.error('Error fetching driver details:', err);
    res.status(500).json({ message: 'Server error' });
  }
});


// Booking creation route
app.post('/api/bookings/create', async (req, res) => {
  const { pickupLocation, dropoffLocation, vehicleType, userId, pickupName, dropoffName } = req.body;

  if (!pickupLocation || !dropoffLocation || !vehicleType || !userId || !pickupName || !dropoffName) {
    return res.status(400).json({ message: 'Missing booking details or user ID' });
  }

  try {
    // Use userId to determine the correct shard for this booking
    const shard = getShard(userId);
    const connection = await shard.getConnection();

    try {
      const bookingQuery = `
        INSERT INTO bookings 
        (userId, pickupLocation, dropoffLocation, pickupName, dropoffName, vehicleType, status, estimatedPrice, createdAt) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const bookingParams = [
        userId,
        JSON.stringify(pickupLocation),
        JSON.stringify(dropoffLocation),
        pickupName,
        dropoffName,
        vehicleType,
        'pending',
        (Math.random() * 100).toFixed(2),
        new Date()
      ];

      // Execute the query in the appropriate shard
      const [result] = await connection.execute(bookingQuery, bookingParams);
      const bookingId = result.insertId;

      // Cache the booking in Redis
      const booking = {
        id: bookingId,
        userId,
        driverId: null,
        pickupLocation,
        dropoffLocation,
        pickupName,
        dropoffName,
        vehicleType,
        status: 'pending',
        estimatedPrice: (Math.random() * 100).toFixed(2),
        createdAt: new Date().toISOString()
      };

      // Store the booking data in Redis
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

      res.json({ message: 'Booking created successfully', booking });
    } finally {
      connection.release(); // Release the connection back to the pool
    }
  } catch (err) {
    console.error('Error creating booking:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});



// Fetch all vehicles with driver information
app.get('/api/admin/vehicles', async (req, res) => {
  try {
    // Array to hold results from all shards
    const allDrivers = [];

    // Loop through each shard
    for (const shard of shards) {
      const connection = await shard.getConnection();

      try {
        const query = 'SELECT * FROM drivers';
        const [results] = await connection.execute(query);
        allDrivers.push(...results); // Append results from each shard
      } finally {
        connection.release(); // Release connection back to the pool
      }
    }

    res.json(allDrivers); // Return the aggregated list of drivers
  } catch (err) {
    console.error('Error fetching vehicles:', err);
    res.status(500).json({ message: 'Server error' });
  }
});



app.get('/api/admin/bookings-per-driver', async (req, res) => {
  try {
    // Array to hold the aggregated results from all shards
    const bookingsPerDriver = {};

    // Loop through each shard
    for (const shard of shards) {
      const connection = await shard.getConnection();

      try {
        const query = `
          SELECT drivers.name AS driverName, COUNT(bookings.id) AS bookingCount
          FROM bookings
          JOIN drivers ON bookings.driverId = drivers.id
          GROUP BY drivers.name;
        `;
        const [results] = await connection.execute(query);

        // Aggregate results across shards
        results.forEach((row) => {
          if (bookingsPerDriver[row.driverName]) {
            bookingsPerDriver[row.driverName] += row.bookingCount;
          } else {
            bookingsPerDriver[row.driverName] = row.bookingCount;
          }
        });
      } finally {
        connection.release(); // Release connection back to the pool
      }
    }

    // Convert the aggregated object into an array for the response
    const aggregatedResults = Object.keys(bookingsPerDriver).map((driverName) => ({
      driverName,
      bookingCount: bookingsPerDriver[driverName],
    }));

    res.json(aggregatedResults); // Return the aggregated number of bookings per driver
  } catch (err) {
    console.error('Error fetching bookings per driver:', err);
    res.status(500).json({ message: 'Server error' });
  }
});




// Fetch number of bookings by created date
app.get('/api/admin/bookings-per-day', async (req, res) => {
  try {
    // Object to store aggregated bookings per day
    const bookingsPerDay = {};

    // Loop through each shard
    for (const shard of shards) {
      const connection = await shard.getConnection();

      try {
        const query = `
          SELECT DATE(createdAt) AS date, COUNT(id) AS bookingCount
          FROM bookings
          GROUP BY DATE(createdAt)
          ORDER BY date;
        `;
        const [results] = await connection.execute(query);

        // Aggregate results across shards
        results.forEach((row) => {
          const date = row.date;
          const bookingCount = row.bookingCount;

          if (bookingsPerDay[date]) {
            bookingsPerDay[date] += bookingCount;
          } else {
            bookingsPerDay[date] = bookingCount;
          }
        });
      } finally {
        connection.release(); // Release connection back to the pool
      }
    }

    // Convert the aggregated object into an array for the response
    const aggregatedResults = Object.keys(bookingsPerDay).map((date) => ({
      date,
      bookingCount: bookingsPerDay[date],
    }));

    res.json(aggregatedResults); // Return the aggregated number of bookings per day
  } catch (err) {
    console.error('Error fetching bookings per day:', err);
    res.status(500).json({ message: 'Server error' });
  }
});



app.get('/api/admin/vehicle-types', async (req, res) => {
  try {
    // Object to store aggregated vehicle counts per type
    const vehicleTypes = {};

    // Loop through each shard
    for (const shard of shards) {
      const connection = await shard.getConnection();

      try {
        const query = `
          SELECT vehicle, COUNT(vehicle) AS vehicleCount
          FROM drivers
          GROUP BY vehicle;
        `;
        const [results] = await connection.execute(query);

        // Aggregate results across shards
        results.forEach((row) => {
          const vehicle = row.vehicle;
          const count = row.vehicleCount;

          if (vehicleTypes[vehicle]) {
            vehicleTypes[vehicle] += count;
          } else {
            vehicleTypes[vehicle] = count;
          }
        });
      } finally {
        connection.release(); // Release connection back to the pool
      }
    }

    // Convert the aggregated object into an array for the response
    const aggregatedResults = Object.keys(vehicleTypes).map((vehicle) => ({
      vehicle,
      vehicleCount: vehicleTypes[vehicle],
    }));

    res.json(aggregatedResults); // Return the aggregated vehicle count per type
  } catch (err) {
    console.error('Error fetching vehicle types:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Fetch all bookings with user and vehicle information
app.get('/api/admin/bookings', async (req, res) => {
  try {
    // Array to hold aggregated bookings from all shards
    let aggregatedBookings = [];

    // Loop through each shard
    for (const shard of shards) {
      const connection = await shard.getConnection();

      try {
        const query = `
          SELECT bookings.id, bookings.status, bookings.driverId, bookings.vehicleType, 
                 bookings.pickupName, bookings.dropoffName, users.name AS userName, 
                 users.phone AS userPhone, bookings.createdAt
          FROM bookings
          JOIN users ON bookings.userId = users.id;
        `;
        const [results] = await connection.execute(query);

        // Add results from this shard to the aggregated bookings array
        aggregatedBookings = aggregatedBookings.concat(results);
      } finally {
        connection.release(); // Release connection back to the pool
      }
    }

    res.json(aggregatedBookings); // Return the combined list of bookings from all shards
  } catch (err) {
    console.error('Error fetching bookings:', err);
    res.status(500).json({ message: 'Server error' });
  }
});



// Fetch all bookings with user details
app.get('/api/bookings', async (req, res) => {
  try {
    // Check Redis cache for all booking keys
    const bookingKeys = await client.keys('booking:*');
    const bookings = [];

    if (bookingKeys.length > 0) {
      // If booking keys are found in Redis, fetch data from Redis
      for (const key of bookingKeys) {
        const booking = await client.hGetAll(key);
        const user = await client.hGetAll(`user:${booking.userId}`); // Fetch user details from Redis
        booking.userName = user.name;
        booking.userPhone = user.phone;
        bookings.push(booking);
      }
      return res.json(bookings); // Return the cached bookings
    }

    // If not found in Redis, query from all shards
    let aggregatedBookings = [];

    for (const shard of shards) {
      const connection = await shard.getConnection();

      try {
        const query = `
          SELECT bookings.*, users.name AS userName, users.phone AS userPhone
          FROM bookings
          JOIN users ON bookings.userId = users.id;
        `;
        const [results] = await connection.execute(query);

        // Add results from this shard to the aggregated bookings array
        aggregatedBookings = aggregatedBookings.concat(results);

        // Cache each booking result in Redis for future use
        for (const booking of results) {
          const bookingKey = `booking:${booking.id}`;
          await client.hSet(bookingKey, {
            id: booking.id,
            userId: booking.userId,
            driverId: booking.driverId,
            pickupLocation: JSON.stringify(booking.pickupLocation),
            dropoffLocation: JSON.stringify(booking.dropoffLocation),
            pickupName: booking.pickupName,
            dropoffName: booking.dropoffName,
            vehicleType: booking.vehicleType,
            status: booking.status,
            estimatedPrice: booking.estimatedPrice.toString(),
            createdAt: booking.createdAt,
            userName: booking.userName,
            userPhone: booking.userPhone,
          });
        }
      } finally {
        connection.release(); // Release connection back to the pool
      }
    }

    res.json(aggregatedBookings); // Return the combined list of bookings from all shards
  } catch (err) {
    console.error('Error fetching bookings:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Fetch a single booking by ID with pickup and drop-off locations

app.get('/api/bookings/:id', async (req, res) => {
  const { id } = req.params;
  const { userId } = req.query; // Expecting userId as a query parameter

  try {
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    // Determine the shard based on userId
    const shard = getShard(userId);
    const connection = await shard.getConnection();

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

      // If not found in Redis, query the shard database
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

      const [results] = await connection.execute(query, [id]);

      if (results.length === 0) {
        return res.status(404).json({ message: 'Booking not found' });
      }

      const booking = results[0];

      // Parse pickup and dropoff locations from JSON
      booking.pickupLocation = JSON.parse(booking.pickupLocation);
      booking.dropoffLocation = JSON.parse(booking.dropoffLocation);

      // Cache the result in Redis for future use
      await client.hSet(bookingKey, {
        id: booking.id.toString(),
        userId: booking.userId.toString(),
        driverId: booking.driverId ? booking.driverId.toString() : '',
        pickupLocation: JSON.stringify(booking.pickupLocation),
        dropoffLocation: JSON.stringify(booking.dropoffLocation),
        pickupName: booking.pickupName,
        dropoffName: booking.dropoffName,
        vehicleType: booking.vehicleType,
        status: booking.status,
        estimatedPrice: booking.estimatedPrice.toString(),
        createdAt: booking.createdAt,
        userName: booking.userName,
        userPhone: booking.userPhone,
      });

      // Return the booking with pickup and dropoff locations and names from MySQL
      res.json(booking);
    } finally {
      connection.release(); // Release the connection back to the pool
    }
  } catch (err) {
    console.error('Error fetching booking:', err);
    res.status(500).json({ message: 'Server error' });
  }
});



// Accept a booking and update the driverId and status
app.post('/api/bookings/accept', async (req, res) => {
  const { bookingId, userId, driverId } = req.body;

  try {
    // Determine the shard based on userId
    const shard = getShard(userId); // Use the getShard function with userId

    // Update the booking in the correct shard
    const query = 'UPDATE bookings SET driverId = ?, status = ? WHERE id = ?';
    shard.query(query, [driverId, 'confirmed', bookingId], async (err, result) => {
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
    console.error('Error accepting booking:', err);
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

    // Determine the shard based on driverId (which is also used as userId)
    const shard = getShard(driverId); // Use the getShard function with driverId

    // If not in Redis, fetch location from the MySQL shard
    const query = 'SELECT location FROM drivers WHERE id = ?';
    shard.query(query, [driverId], async (err, results) => {
      if (err) {
        return res.status(500).json({ message: 'Error fetching driver details from MySQL' });
      }

      if (results.length === 0) {
        return res.status(404).json({ message: 'Driver not found' });
      }

      const driverLocation = results[0].location;
      await client.hSet(`driver:${driverId}`, 'location', driverLocation); // Cache location in Redis
      res.json({ driverId, location: JSON.parse(driverLocation) });
    });
  } catch (err) {
    console.error('Error fetching driver location:', err);
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

       // Determine the shard based on driverId (same as userId)
      const shard = getShard(driverId); // Use the getShard function with driverId

    // Update MySQL in the determined shard for persistence
      const query = 'UPDATE drivers SET location = ? WHERE id = ?';
      shard.query(query, [JSON.stringify(location), driverId], (err) => {
      if (err) {
        console.error('Error updating driver location in MySQL:', err);
        return;
      }

      console.log(`Driver location updated in shard for driverId: ${driverId}`);
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
  const { bookingId, userId, status } = req.body;

  if (!bookingId || !status || !userId) {
    return res.status(400).json({ message: 'Missing booking ID, user ID, or status' });
  }

  try {
    // Determine the shard based on userId
    const shard = getShard(userId); // Use the getShard function with userId

    // Update booking status in the determined shard
    const query = 'UPDATE bookings SET status = ? WHERE id = ?';
    shard.query(query, [status, bookingId], (err, result) => {
      if (err) {
        console.error('Error updating booking status:', err);
        return res.status(500).json({ message: 'Error updating booking status' });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Booking not found' });
      }

      // Optionally update Redis (if using Redis cache)
      client.hSet(`booking:${bookingId}`, 'status', status);

      res.json({ message: 'Booking status updated successfully', status });
    });
  } catch (err) {
    console.error('Error during booking status update:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});


const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

import React, { useEffect, useState } from 'react';
import { Pie, Line, Bar } from 'react-chartjs-2';
import axios from 'axios';
import Sidebar from '../components/SideBar';
import Navbar from '../components/navbar';
import './AdminDashboard.css'; // Custom styling for this page
import { Chart, ArcElement, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend } from 'chart.js';
import moment from 'moment';

// Register the required components
Chart.register(ArcElement, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend);

const AdminDashboard = () => {
  const [vehicleData, setVehicleData] = useState([]);
  const [bookingData, setBookingData] = useState([]);
  const [driverBookingData, setDriverBookingData] = useState([]);

  useEffect(() => {
    const fetchVehicleData = async () => {
      try {
        const response = await axios.get('http://localhost:4000/api/admin/vehicle-types');
        setVehicleData(response.data);
      } catch (error) {
        console.error('Error fetching vehicle data:', error);
      }
    };

    const fetchBookingData = async () => {
      try {
        const response = await axios.get('http://localhost:4000/api/admin/bookings-per-day');
        setBookingData(response.data);
      } catch (error) {
        console.error('Error fetching booking data:', error);
      }
    };

    const fetchDriverBookingData = async () => {
      try {
        const response = await axios.get('http://localhost:4000/api/admin/bookings-per-driver');
        setDriverBookingData(response.data);
      } catch (error) {
        console.error('Error fetching driver booking data:', error);
      }
    };

    fetchVehicleData();
    fetchBookingData();
    fetchDriverBookingData();
  }, []);

  // Pie chart data for vehicle types
  const vehicleChartData = {
    labels: vehicleData.map((item) => item.vehicle), // Use 'vehicle' as the label
    datasets: [
      {
        label: 'Vehicle Types',
        data: vehicleData.map((item) => item.vehicleCount), // Use 'vehicleCount' as the data
        backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0'],
      },
    ],
  };

  // Line chart data for bookings by date
  const lineChartData = {
    labels: bookingData.map((item) => moment(item.date).format('YYYY-MM-DD')), // Format the date for labels
    datasets: [
      {
        label: 'Bookings per Day',
        data: bookingData.map((item) => item.bookingCount), // Use 'bookingCount' as the data
        fill: false,
        backgroundColor: '#36A2EB',
        borderColor: '#36A2EB',
      },
    ],
  };

  // Bar chart data for bookings per driver
  const driverBookingChartData = {
    labels: driverBookingData.map((item) => item.driverName), // Use 'driverName' as the label
    datasets: [
      {
        label: 'Bookings per Driver',
        data: driverBookingData.map((item) => item.bookingCount), // Use 'bookingCount' as the data
        backgroundColor: '#FFCE56',
      },
    ],
  };

  return (
    <div className="admin-dashboard">
      <Sidebar />
      <Navbar />
      <div className="dashboard-content">
        <h1>Admin Dashboard</h1>

        <div className="top-half">
          {/* Left: Vehicle Types Pie Chart (40%) */}
          <div className="left-chart">
            <h3>Vehicle Types</h3>
            <Pie data={vehicleChartData} />
          </div>

          {/* Right: Bookings Over Time Line Chart (60%) */}
          <div className="right-chart">
            <h3>Bookings Over Time</h3>
            <Line data={lineChartData} />
          </div>
        </div>

        <div className="bottom-half">
          {/* Bookings per Driver Bar Chart (80%) */}
          <div className="driver-chart">
            <h3>Bookings per Driver</h3>
            <Bar data={driverBookingChartData} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;

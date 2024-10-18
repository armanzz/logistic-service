import React, { useEffect, useState } from 'react';
import Sidebar from '../components/SideBar';
import Navbar from '../components/navbar';
import './AdminMonitor.css'; // Custom styling
import axios from 'axios';
import { useTable } from 'react-table';
import { FaTruck, FaMotorcycle, FaCar } from 'react-icons/fa'; // Vehicle type icons

const AdminMonitor = () => {
  const [vehicleData, setVehicleData] = useState([]);
  const [bookingData, setBookingData] = useState([]);

  useEffect(() => {
    // Fetch vehicle data with driver details
    const fetchVehicleData = async () => {
      const response = await axios.get('http://localhost:4000/api/admin/vehicles');
      setVehicleData(response.data);
    };

    // Fetch booking data with user information
    const fetchBookingData = async () => {
      const response = await axios.get('http://localhost:4000/api/admin/bookings');
      setBookingData(response.data);
    };

    fetchVehicleData();
    fetchBookingData();
  }, []);

  // Render vehicle icons based on vehicle type
  const getVehicleIcon = (vehicle) => {
    switch (vehicle.toLowerCase()) {
      case 'van':
        return <FaTruck />;
      case 'bike':
        return <FaMotorcycle />;
      case 'car':
        return <FaCar />;
      default:
        return <FaCar />; // Default icon
    }
  };

  // Table columns for vehicles
  const vehicleColumns = [
    {
      Header: 'Vehicle Type',
      accessor: 'vehicle',
      Cell: ({ cell: { value } }) => (
        <div className="vehicle-icon-cell">
          {getVehicleIcon(value)} {value}
        </div>
      ),
    },
    { Header: 'Driver', accessor: 'name' },
    { Header: 'Phone', accessor: 'phone' },
  ];

  // Table columns for bookings
  const bookingColumns = [
    { Header: 'Booking ID', accessor: 'id' },
    { Header: 'User', accessor: 'userName' },
    { Header: 'Driver ID', accessor: 'driverId' },
    { Header: 'Vehicle Type', accessor: 'vehicleType' },
    { Header: 'Pickup Name', accessor: 'pickupName' },
    { Header: 'Dropoff Name', accessor: 'dropoffName' },
    { Header: 'Status', accessor: 'status' },
  ];

  // Define the Table component
  const Table = ({ columns, data }) => {
    const { getTableProps, getTableBodyProps, headerGroups, rows, prepareRow } = useTable({ columns, data });

    return (
      <table {...getTableProps()} className="table">
        <thead>
          {headerGroups.map(headerGroup => (
            <tr {...headerGroup.getHeaderGroupProps()}>
              {headerGroup.headers.map(column => (
                <th {...column.getHeaderProps()}>{column.render('Header')}</th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody {...getTableBodyProps()}>
          {rows.map(row => {
            prepareRow(row);
            return (
              <tr {...row.getRowProps()}>
                {row.cells.map(cell => (
                  <td {...cell.getCellProps()}>{cell.render('Cell')}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  };

  return (
    <div className="admin-monitor">
      <Sidebar />
      <div className="main-content">
        <Navbar />
        <div className="monitor-content">
          <h1>Monitor Vehicles and Bookings</h1>

          <div className="tables-container">
            {/* Vehicles Table on the left (30%) */}
            <div className="table-section vehicle-table">
              <h2>Vehicles</h2>
              <Table columns={vehicleColumns} data={vehicleData} />
            </div>

            {/* Bookings Table on the right (70%) */}
            <div className="table-section booking-table">
              <h2>Bookings</h2>
              <Table columns={bookingColumns} data={bookingData} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminMonitor;

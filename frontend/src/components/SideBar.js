import React from 'react';
import { NavLink } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChartPie, faClipboardList } from '@fortawesome/free-solid-svg-icons'; // Import FontAwesome icons
import './SideBar.css'; // Custom Sidebar styling

const Sidebar = () => {
    return (
        <div className="sidebar">
          <ul>
            <li>
              <NavLink 
                to="/admin-dashboard" 
                className="sidebar-link" 
                activeClassName="active-link"
              >
               <FontAwesomeIcon icon={faChartPie} className="icon" /> {/* Icon example */}
              </NavLink>
            </li>
            <li>
              <NavLink 
                to="/admin-monitor" 
                className="sidebar-link" 
                activeClassName="active-link"
              >
                <FontAwesomeIcon icon={faClipboardList} className="icon" />  {/* Icon example */}
              </NavLink>
            </li>
          </ul>
        </div>
      );
    
};


export default Sidebar;


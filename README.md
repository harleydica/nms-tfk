# NMS - Network Monitoring System

A lightweight web-based network monitoring dashboard for tracking interface traffic from MikroTik devices.

## Features

- **Dashboard View**: Display daily traffic graphs for all network interfaces in a grid layout
- **Detailed Interface Stats**: View detailed traffic statistics (daily, weekly, monthly, yearly)
- **Dynamic Configuration**: Manage interfaces and system info through a centralized config file
- **Color-Coded Traffic**: Incoming traffic displayed in green (#00cc00), outgoing in blue (#0000cc)
- **Responsive Design**: Grid-based layout that adapts to different screen sizes
- **IP Address Display**: Shows client IP address in the header
- **Easy Navigation**: Quick links between dashboard and detailed views

## Project Structure

```
NMS/
├── server.js                 # Express server with API endpoints
├── package.json              # Project dependencies
├── .gitignore               # Git ignore file
├── README.md                # This file
└── public/
    ├── index.html           # Main dashboard page
    ├── interface.html       # Detailed interface view
    ├── config.js            # Interfaces and system configuration
    └── icon-192x192.png     # Logo image
```

## Installation

1. Clone or download the project
2. Install dependencies:
```bash
npm install
```

3. Configure your MikroTik connection in `server.js`:
```javascript
const MIKROTIK_HOST = process.env.MIKROTIK_HOST || "http://192.168.20.1";
const MT_USER = process.env.MT_USER || "";
const MT_PASS = process.env.MT_PASS || "";
```

Or set environment variables:
```bash
export MIKROTIK_HOST=http://your-mikrotik-ip
export MT_USER=your-username
export MT_PASS=your-password
export PORT=3000
```

## Configuration

Edit `public/config.js` to add or modify interfaces:

```javascript
export const INTERFACES = {
  "interface-name": {
    description: "Friendly name",
    ifType: "type (number)",
    maxSpeed: "speed",
    ip: "IP address (optional)"
  }
};

export const SYSTEM_INFO = {
  system: "System name",
  maintainer: "Maintainer email"
};
```

## Running the Server

```bash
npm start
# or
node server.js
```

The server will run on `http://localhost:3000` (or the PORT environment variable)

## API Endpoints

### Get Interface Statistics
```
GET /api/iface/:iface/stats
```
Returns daily, weekly, monthly, and yearly traffic statistics.

### Get Graph Image
```
GET /api/iface/:iface/graph/:type
```
Returns traffic graph as GIF. Types: `daily`, `weekly`, `monthly`, `yearly`

### Get Client IP Address
```
GET /api/ip
```
Returns the client's IP address.

## Usage

1. **Dashboard**: Visit `http://localhost:3000` to see all interfaces with daily traffic graphs
2. **Click Graph**: Click on any graph to view detailed statistics
3. **View Details**: Use the "View Details" link for comprehensive traffic information

## MikroTik Setup

Ensure your MikroTik device:
- Has graph generation enabled (default setting)
- Is accessible from your monitoring system
- Allows HTTP access to the `/graphs/` API endpoint
- User has appropriate permissions to access interface graphs

## Browser Support

- Chrome/Chromium
- Firefox
- Safari
- Edge

## License

MIT

## Author

TFK HOME-YGK

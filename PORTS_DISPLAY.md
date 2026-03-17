# Port Display & Selection Feature

## 🎯 Overview

Aplikasi menampilkan **semua port/interface** dari router secara otomatis. User bisa memilih port mana yang ingin dimonitor.

## 📊 Display All Ports

### Cara Kerja

1. **Page Load** → Query SNMP untuk list semua interface
2. **SNMP Query** → Retrieve interface names dan indexes
3. **Display** → Tampilkan di sidebar sebagai interface list
4. **Auto-update** → User bisa refresh untuk update list

### SNMP OIDs yang digunakan

```
1.3.6.1.2.1.2.2.1.2    = Interface descriptions (ifDescr)
1.3.6.1.2.1.2.2.1.5    = Interface speeds (ifSpeed)
1.3.6.1.2.1.2.2.1.7    = Interface operational status
```

### Contoh Response

```json
[
  {
    "ifIndex": "1",
    "ifName": "eth0",
    "speed": 1000000000,
    "status": 1
  },
  {
    "ifIndex": "2", 
    "ifName": "eth1",
    "speed": 1000000000,
    "status": 1
  },
  {
    "ifIndex": "3",
    "ifName": "wlan0",
    "speed": 100000000,
    "status": 1
  }
]
```

## 🖱️ Port Selection

### Fitur

1. **Click untuk Select** - Klik interface di sidebar
2. **Detail View** - Lihat statistik interface
3. **Real-time Status** - In/Out Octets, Errors, etc
4. **Enable Monitoring** - Tombol untuk enable monitoring
5. **View Graphs** - Lihat traffic graph berbagai timespan

### Interface Details yang Ditampilkan

- **Interface Index**: Nomor unik interface
- **In Octets**: Total bytes masuk
- **Out Octets**: Total bytes keluar  
- **In Errors**: Error paket masuk
- **Out Errors**: Error paket keluar

## 🎨 User Interface

### Sidebar (Left Panel)

```
┌─ Interfaces ────────┐
│                     │
│ • eth0 [Index: 1]  │ ← Clickable
│ • eth1 [Index: 2]  │ ← Clickable
│ • wlan0 [Index: 3] │ ← Clickable
│                     │
└─────────────────────┘
```

### Content Area (Right Panel)

**Saat interface dipilih:**

```
┌─ 📊 eth0 ──────────────────┐
│                             │
│ Interface Index: 1          │
│ In Octets: 1234567890       │
│ Out Octets: 987654321       │
│ In Errors: 0                │
│ Out Errors: 0               │
│                             │
│ [🟢 Enable Monitoring]      │
│                             │
│ ─────────────────────────   │
│ [1 Day] [7 Days] [30 D...] │
│                             │
│ [Traffic Graph Image]       │
│                             │
└─────────────────────────────┘
```

### Timespans Available

- **1 Day** - Detail view dengan resolution 5 minute average
- **7 Days** - Weekly view dengan resolution 1 hour average
- **30 Days** - Monthly view dengan resolution 1 day average
- **1 Year** - Yearly view dengan resolution 1 day average

## 🚀 How to Show All Ports

### Automatic

Saat page dibuka, aplikasi otomatis:

1. Query router via SNMP
2. Ambil list semua interface
3. Display di sidebar tanpa user action

### API Endpoint

```bash
GET /api/interfaces/detailed

Response:
[
  {"ifIndex": "1", "ifName": "eth0"},
  {"ifIndex": "2", "ifName": "eth1"},
  ...
]
```

### Manual Refresh

User bisa refresh page untuk update interface list:

```bash
# Browser
F5 atau Ctrl+R

# Or API
curl http://localhost:3000/api/interfaces/detailed
```

## ✅ Port Selection & Monitoring

### Step by Step

1. **Page loads** → Semua port tampil di sidebar
   ```
   ✅ eth0 (Index 1)
   ✅ eth1 (Index 2)
   ✅ wlan0 (Index 3)
   ```

2. **Click interface** → Lihat detail
   ```
   📊 eth0
   Status: 1234567890 bytes in
   ```

3. **Enable Monitoring** → RRD file dibuat
   ```
   POST /api/interfaces/1/monitor
   ✅ Monitoring enabled for eth0
   ```

4. **Collector runs** → Data dikumpulkan setiap 5 menit
   ```
   SNMP Query → Octets value
   → Update RRD file
   → Save to database
   ```

5. **View Graphs** → Klik timespan tab
   ```
   [1 Day] [7 Days] [30 Days] [1 Year]
   ↓
   Generate PNG graph
   ↓
   Display graph image
   ```

## 🔧 API Endpoints untuk Port Selection

### 1. Get All Interfaces

```bash
GET /api/interfaces/detailed

Response:
[
  {
    "ifIndex": "1",
    "ifName": "eth0"
  },
  {
    "ifIndex": "2",
    "ifName": "eth1"
  }
]
```

### 2. Get Interface Status

```bash
GET /api/interfaces/:ifIndex/status

Example: GET /api/interfaces/1/status

Response:
{
  "inOctets": 1234567890,
  "outOctets": 987654321,
  "inErrors": 0,
  "outErrors": 0
}
```

### 3. Enable Monitoring

```bash
POST /api/interfaces/:ifIndex/monitor

Body:
{
  "ifName": "eth0"
}

Response:
{
  "success": true,
  "message": "Monitoring enabled for eth0"
}
```

### 4. Get Traffic Graph

```bash
GET /api/graph/:ifIndex/:timespan

Example: GET /api/graph/1/1day

timespan options:
- 1day
- 7day
- 30day
- 1year

Response: PNG image
```

## 📈 Database Tables untuk Port Info

### interfaces table

```sql
CREATE TABLE interfaces (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ifIndex INT UNIQUE NOT NULL,
  ifName VARCHAR(255) NOT NULL,
  ifType INT,
  ifMtu INT,
  ifSpeed BIGINT,
  ifDescription VARCHAR(500),
  ifAlias VARCHAR(500),
  enabled BOOLEAN DEFAULT 1,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### Query semua port

```bash
mysql -u nms -p nms_db

SELECT ifIndex, ifName, ifSpeed, enabled 
FROM interfaces 
ORDER BY ifIndex;
```

## 🎯 Features

### ✅ Display All Ports
- Auto-load saat page opens
- Real-time list dari router
- Show interface name & index

### ✅ Select Port
- Click di sidebar untuk select
- Show detail & statistics
- Real-time update

### ✅ Enable Monitoring
- One-click enable
- Create RRD file
- Auto data collection

### ✅ View Graphs
- Multiple timespan (1d/7d/30d/1y)
- In/Out traffic
- Error statistics

### ✅ Responsive Design
- Mobile-friendly
- Desktop optimized
- Touch-friendly interface

## 🔄 Auto-refresh Logic

```javascript
// Every 30 seconds - update current interface status
setInterval(() => {
  if (selectedInterface) {
    loadInterfaceStatus(selectedInterface.ifIndex);
  }
}, 30000);

// On page load - load all interfaces
onPageLoad() {
  loadInterfaces();
}
```

## 📝 Important Notes

1. **Initial Display**: List semua port tampil otomatis tanpa perlu load data
2. **SNMP Polling**: Data fresh dari router setiap kali API call
3. **Monitoring**: Hanya interface dengan monitoring enabled yang data dikumpulkan
4. **Graph Generation**: Hanya bisa generate graph untuk interface yang sudah collect data
5. **Refresh**: User bisa refresh page untuk update interface list

## 🎓 Example Workflow

```
1. User open http://localhost:3000
   ↓
2. Page loads, fetch /api/interfaces/detailed
   ↓
3. Display eth0, eth1, wlan0 di sidebar
   ↓
4. User click eth0
   ↓
5. Fetch /api/interfaces/1/status
   ↓
6. Show eth0 detail & current stats
   ↓
7. User click "Enable Monitoring"
   ↓
8. POST /api/interfaces/1/monitor
   ↓
9. Server create RRD file 1_eth0.rrd
   ↓
10. Collector (cron/timer) run setiap 5 menit
    ↓
11. Update RRD dengan data SNMP
    ↓
12. After 10 minutes, User click "1 Day" tab
    ↓
13. Generate PNG graph dari RRD
    ↓
14. Display traffic graph
```

## 🔗 Related Documentation

- [README_RRDtool.md](README_RRDtool.md) - Full documentation
- [INSTALL.md](INSTALL.md) - Installation guide
- [server.js](server.js) - Backend code
- [public/index.html](public/index.html) - Frontend code

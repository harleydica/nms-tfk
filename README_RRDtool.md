# NMS RRDtool - Network Monitoring System

Sistem monitoring jaringan menggunakan RRDtool dengan koleksi data via SNMP.

## 📋 Fitur

- ✅ Real-time interface monitoring via SNMP
- ✅ RRDtool untuk storage & graph generation
- ✅ MariaDB untuk historical data
- ✅ Web interface yang responsif
- ✅ Multi timespan graphs (1 hari, 7 hari, 1 bulan, 1 tahun)
- ✅ Port selection & enable/disable monitoring
- ✅ Traffic statistics (In/Out Octets, Errors)

## 🚀 Quick Start

### Prerequisites
- Ubuntu/Debian Linux
- Node.js 16+
- MariaDB/MySQL
- SNMP tools
- RRDtool

### 1. Setup Database (Linux/Ubuntu)

```bash
sudo bash setup-database.sh
```

Script ini akan:
- Install MariaDB, SNMP tools, RRDtool, Node.js
- Membuat database `nms_db`
- Membuat user `nms` dengan password `nms123`
- Create tables untuk interfaces dan traffic statistics

### 2. Setup Node.js Application

```bash
# Copy environment file
cp .env.example .env

# Edit .env sesuai konfigurasi Anda (terutama SNMP_HOST)
nano .env

# Install dependencies
npm install

# Start server
npm start
```

### 3. Akses Web Interface

Buka browser: `http://localhost:3000`

## 📊 Cara Kerja

### 1. Load All Interfaces
Aplikasi akan query SNMP router untuk list semua interface.

```
GET /api/interfaces/detailed
→ Return: [{ ifIndex, ifName }, ...]
```

### 2. Select Interface
Pilih interface di sidebar untuk melihat detail.

```
GET /api/interfaces/:ifIndex/status
→ Return: { inOctets, outOctets, inErrors, outErrors }
```

### 3. Enable Monitoring
Klik tombol "Enable Monitoring" untuk mulai collect data.

```
POST /api/interfaces/:ifIndex/monitor
↓
Server: Create RRD file
↓
Server: Save ke database
```

### 4. Data Collection
Server otomatis query SNMP setiap 5 menit untuk update RRD.

```
SNMP Query (setiap 5 menit)
↓
Parse data
↓
Update RRD file
↓
Save to database
```

### 5. View Graphs
Klik tab untuk view graph berbagai timespan.

```
GET /api/graph/:ifIndex/:timespan
↓
Generate PNG dengan rrdtool
↓
Return graph image
```

## 🔧 API Endpoints

### Interfaces

```bash
# Get all interfaces
GET /api/interfaces

# Get interfaces with details
GET /api/interfaces/detailed

# Get interface status
GET /api/interfaces/:ifIndex/status

# Enable monitoring
POST /api/interfaces/:ifIndex/monitor
{
  "ifName": "eth0"
}
```

### Graphs

```bash
# Get graph
GET /api/graph/:ifIndex/:timespan
# timespan: 1day | 7day | 30day | 1year
```

### Collector

```bash
# Start collector
GET /api/collectorstart
```

## 📁 Directory Structure

```
nms-tfk/
├── server.js              # Main application
├── package.json           # Dependencies
├── .env.example          # Environment template
├── setup-database.sh     # Database setup script
├── rrd/                  # RRD database files
│   ├── 1_eth0.rrd
│   ├── 2_eth1.rrd
│   └── ...
├── public/
│   ├── index.html        # Web interface
│   └── graphs/           # Generated PNG graphs
│       ├── 1_1day.png
│       ├── 1_7day.png
│       └── ...
└── README.md
```

## 🗄️ Database Schema

### interfaces table
```sql
- id (INT, PK)
- ifIndex (INT, UNIQUE)
- ifName (VARCHAR)
- ifType (INT)
- ifMtu (INT)
- ifSpeed (BIGINT)
- ifDescription (VARCHAR)
- ifAlias (VARCHAR)
- enabled (BOOLEAN)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

### traffic_stats table
```sql
- id (INT, PK)
- ifIndex (INT, FK)
- timestamp (DATETIME)
- inOctets (BIGINT)
- outOctets (BIGINT)
- inErrors (INT)
- outErrors (INT)
```

## 🔐 SNMP Configuration

### Verify SNMP Connection

```bash
# Test SNMP connection
snmpwalk -v 2c -c public 172.17.100.1 1.3.6.1.2.1.2.2.1.2

# Should return interface names like:
# SNMPv2-SMI::ifDescr.1 = STRING "eth0"
# SNMPv2-SMI::ifDescr.2 = STRING "eth1"
# ...
```

### Important SNMP OIDs

```
1.3.6.1.2.1.2.2.1.2    - Interface names (ifDescr)
1.3.6.1.2.1.2.2.1.5    - Interface speed (ifSpeed)
1.3.6.1.2.1.2.2.1.10   - Inbound octets (ifInOctets)
1.3.6.1.2.1.2.2.1.16   - Outbound octets (ifOutOctets)
1.3.6.1.2.1.2.2.1.14   - Inbound errors (ifInErrors)
1.3.6.1.2.1.2.2.1.20   - Outbound errors (ifOutErrors)
```

## 📈 RRDtool Configuration

### RRD Structure

- **Step**: 300 seconds (5 minutes)
- **Data Sources**:
  - InOctets (COUNTER)
  - OutOctets (COUNTER)
  - InErrors (COUNTER)
  - OutErrors (COUNTER)

- **Archives** (RRA):
  - 5min average, 1 day
  - 1hr average, 1 month
  - 1day average, 1 year
  - Max values

### Graph Generation

```bash
rrdtool graph traffic.png -s -1d \
  DEF:in=interface.rrd:InOctets:AVERAGE \
  DEF:out=interface.rrd:OutOctets:AVERAGE \
  AREA:in#00CC00:"In Traffic" \
  LINE2:out#0000FF:"Out Traffic"
```

## 🐛 Troubleshooting

### SNMP Connection Failed

```bash
# Check SNMP is installed
which snmpwalk

# Test connection manually
snmpwalk -v 2c -c public 172.17.100.1 1.3.6.1.2.1.1.1.0

# Check router SNMP settings
# Verify IP address dan community string
```

### Database Connection Failed

```bash
# Check MariaDB is running
sudo systemctl status mariadb

# Test connection
mysql -u nms -p nms123 -h localhost nms_db

# Check database exists
mysql -u root -p
> SHOW DATABASES;
> USE nms_db;
> SHOW TABLES;
```

### RRDtool Not Found

```bash
# Install rrdtool
sudo apt-get install rrdtool

# For CentOS/RHEL
sudo yum install rrdtool
```

### No Graphs Generated

```bash
# Ensure RRD directory exists
ls -la rrd/

# Check if RRD file was created
ls -la rrd/*eth0*

# Try manual graph generation
rrdtool graph test.png -s -1d \
  DEF:in=./rrd/1_eth0.rrd:InOctets:AVERAGE \
  AREA:in#00CC00:"Test"
```

## 🔄 Automate Data Collection

### Using Systemd Timer

Create `/etc/systemd/system/nms-collector.service`:

```ini
[Unit]
Description=NMS RRDtool Collector
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/nms-tfk
ExecStart=/usr/bin/node /var/www/nms-tfk/server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable nms-collector
sudo systemctl start nms-collector
```

### Using Cron

```bash
*/5 * * * * curl -s http://localhost:3000/api/collectorstart
```

## 📝 Notes

- Router harus support SNMP v2c
- Default SNMP community: `public`
- Default router IP: `172.17.100.1` (sesuaikan dengan .env)
- Port default: 3000
- RRD files stored di folder `./rrd` (harus writable)
- Generated graphs stored di `./public/graphs`

## 📄 License

MIT

# Instalasi NMS RRDtool di Ubuntu

## 📋 Prerequisites

```bash
sudo apt-get update
sudo apt-get install -y \
  build-essential \
  curl \
  wget \
  git
```

## 🚀 Step-by-Step Installation

### 1. Clone Project

```bash
cd /var/www
git clone <your-repo-url> nms-tfk
cd nms-tfk
```

### 2. Setup Database (Run as root)

```bash
sudo bash setup-database.sh
```

Script otomatis akan:
- ✅ Install MariaDB Server
- ✅ Install SNMP tools
- ✅ Install RRDtool
- ✅ Install Node.js
- ✅ Create database `nms_db`
- ✅ Create user `nms`
- ✅ Create tables

### 3. Configure Environment

```bash
# Copy environment file
cp .env.example .env

# Edit configuration
nano .env
```

**Edit nilai berikut:**

```ini
# SNMP Configuration - PENTING!
SNMP_HOST=172.17.100.1      # Ganti dengan IP router Anda
SNMP_COMMUNITY=public        # Ganti jika komunitas SNMP berbeda

# Database (sudah otomatis dari setup-database.sh)
DB_USER=nms
DB_PASS=nms123
DB_NAME=nms_db
```

### 4. Install Node.js Dependencies

```bash
npm install
```

### 5. Verify SNMP Connection

**Testing SNMP connection to router:**

```bash
# Test SNMP connectivity
snmpwalk -v 2c -c public 172.17.100.1 1.3.6.1.2.1.2.2.1.2

# Expected output:
# SNMPv2-SMI::ifDescr.1 = STRING "eth0"
# SNMPv2-SMI::ifDescr.2 = STRING "eth1"
# SNMPv2-SMI::ifDescr.3 = STRING "wlan0"
```

Jika SNMP tidak bekerja:
- Periksa IP router
- Periksa community string (default: "public")
- Cek firewall router (UDP port 161)
- Periksa konfigurasi SNMP di router

### 6. Start Application

#### Option A: Direct Start

```bash
npm start
# Akses: http://localhost:3000
```

#### Option B: Using Node Process Manager (PM2)

```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start server.js --name "nms"

# Auto-start on boot
pm2 startup
pm2 save

# Monitor
pm2 logs nms
```

#### Option C: Using Systemd Service

**Create `/etc/systemd/system/nms.service`:**

```ini
[Unit]
Description=NMS RRDtool Network Monitoring System
After=network.target mariadb.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/nms-tfk
EnvironmentFile=/var/www/nms-tfk/.env
ExecStart=/usr/bin/node /var/www/nms-tfk/server.js
Restart=always
RestartSec=10
StandardOutput=append:/var/log/nms.log
StandardError=append:/var/log/nms-error.log

[Install]
WantedBy=multi-user.target
```

**Enable service:**

```bash
sudo systemctl daemon-reload
sudo systemctl enable nms
sudo systemctl start nms
sudo systemctl status nms

# View logs
sudo tail -f /var/log/nms.log
```

### 7. Setup Auto-Collection (Cron Job)

**Option A: Using Cron** (Every 5 minutes)

```bash
# Edit crontab
crontab -e

# Add this line:
*/5 * * * * curl -s http://localhost:3000/api/collectorstart
```

**Option B: Using Bash Script** (Recommended)

```bash
# Make script executable
chmod +x collector.sh

# Run manually to test
./collector.sh

# Add to crontab
(crontab -l 2>/dev/null; echo "*/5 * * * * cd /var/www/nms-tfk && bash collector.sh") | crontab -
```

## 🌐 Web Interface

1. Open browser: `http://localhost:3000`
2. List semua interface akan langsung tampil
3. Klik interface untuk melihat detail
4. Klik "Enable Monitoring" untuk mulai collect data
5. Setelah beberapa menit data terkumpul, graph akan available

## 📊 How to Use

### View All Ports/Interfaces

1. Interface list akan otomatis load saat buka halaman
2. Semua port dari router akan ditampilkan dengan:
   - Interface name (ethX, wlanX, dll)
   - Interface index number
   - Current traffic stats

### Select & Monitor Port

1. Click interface di sidebar
2. Lihat statistik saat ini (In/Out Octets, Errors)
3. Click "Enable Monitoring" untuk aktifkan monitoring
4. Server akan create RRD file untuk interface tersebut

### View Traffic Graphs

Setelah monitoring diaktifkan dan ada data (tunggu 5-10 menit):

1. Klik tab timespan: **1 Day, 7 Days, 30 Days, 1 Year**
2. Graph akan menampilkan:
   - **Green Area**: Incoming traffic (bits/sec)
   - **Blue Line**: Outgoing traffic (bits/sec)
   - **Red Line**: Incoming errors
   - **Orange Line**: Outgoing errors

## 🔧 API Endpoints (Manual Testing)

```bash
# 1. Get all interfaces
curl http://localhost:3000/api/interfaces/detailed

# 2. Get interface status
curl http://localhost:3000/api/interfaces/1/status

# 3. Enable monitoring (gunakan index dan name dari step 1)
curl -X POST http://localhost:3000/api/interfaces/1/monitor \
  -H "Content-Type: application/json" \
  -d '{"ifName":"eth0"}'

# 4. Get graph
curl http://localhost:3000/api/graph/1/1day > graph.png

# 5. Start collector
curl http://localhost:3000/api/collectorstart
```

## 📂 File Structure

```
nms-tfk/
├── server.js                 # Main application
├── package.json              # Node.js dependencies
├── .env                      # Environment config (copy from .env.example)
├── .env.example              # Environment template
├── setup-database.sh         # Database setup script
├── collector.sh              # Manual data collector
├── generate-graphs.sh        # Manual graph generator
├── INSTALL.md               # This file
├── README_RRDtool.md        # Full documentation
│
├── rrd/                      # RRD databases (created by server)
│   ├── 1_eth0.rrd
│   ├── 2_eth1.rrd
│   └── ...
│
├── public/
│   ├── index.html           # Web interface
│   └── graphs/              # Generated PNG graphs
│       ├── 1_1day.png
│       ├── 1_7day.png
│       └── ...
│
├── node_modules/             # Dependencies (npm install)
└── logs/                      # Log files
```

## 🐛 Troubleshooting

### 1. SNMP Connection Fails

```bash
# Test SNMP manually
snmpwalk -v 2c -c public 172.17.100.1 1.3.6.1.2.1.1.1.0

# If fails:
# - Verify router IP
# - Check community string (might not be "public")
# - Check firewall rules
# - Enable SNMP on router
```

### 2. Database Connection Error

```bash
# Check MariaDB status
sudo systemctl status mariadb

# Verify database
mysql -u nms -pnms123 -h localhost nms_db -e "SHOW TABLES;"

# Check user permissions
mysql -u root -p
> SHOW GRANTS FOR 'nms'@'localhost';
```

### 3. RRDtool Not Found

```bash
# Install rrdtool
sudo apt-get install rrdtool

# Verify
which rrdtool
rrdtool --version
```

### 4. Node.js Errors

```bash
# Check Node version (should be 16+)
node --version

# Check npm packages
npm list

# Reinstall
rm -rf node_modules package-lock.json
npm install
```

### 5. Graphs Not Generated

```bash
# Check RRD files exist
ls -la rrd/

# Manually generate graph
rrdtool graph test.png -s -1d \
  DEF:in=./rrd/1_eth0.rrd:InOctets:AVERAGE \
  AREA:in#00CC00:"Test"
```

### 6. Monitoring Not Collecting Data

```bash
# Check if collector is running
ps aux | grep collector

# Run collector manually
bash collector.sh

# Check logs
tail -f collector.log
```

## 🔄 Common Commands

```bash
# Start application
npm start

# Development mode (auto-restart on file change)
npm run dev

# Check application status
curl http://localhost:3000/api/interfaces

# View logs (if using systemd)
sudo journalctl -u nms -f

# Restart application
sudo systemctl restart nms

# Stop application
sudo systemctl stop nms

# View database
mysql -u nms -pnms123 nms_db
> SELECT * FROM interfaces;
> SELECT * FROM traffic_stats LIMIT 10;
```

## 📝 Notes

- **First run**: Tunggu 5-10 menit agar data terkumpul sebelum graph muncul
- **RRD files**: Disimpan di folder `./rrd` - pastikan writable
- **Graphs**: Disimpan di `./public/graphs` - auto-generated
- **Port**: Default 3000, ubah dengan `PORT=8080 npm start`
- **Database**: Backup database secara regular

## ✅ Checklist Installasi

- [ ] Ubuntu LTS installed
- [ ] Database setup script dijalankan (`sudo bash setup-database.sh`)
- [ ] .env file dikonfigurasi dengan SNMP_HOST yang benar
- [ ] SNMP connection verified (`snmpwalk` berhasil)
- [ ] npm install selesai
- [ ] npm start berjalan tanpa error
- [ ] Web interface accessible di http://localhost:3000
- [ ] Interfaces list tampil di sidebar
- [ ] Monitoring enabled untuk minimal 1 interface
- [ ] Cron job untuk collector sudah diset
- [ ] (Optional) Systemd service sudah dipasang

## 🎉 Setup Complete!

Setelah semua langkah selesai, system siap untuk monitoring. 

Kunjungi: **http://localhost:3000**

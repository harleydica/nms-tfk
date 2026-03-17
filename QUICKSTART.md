# 🚀 NMS RRDtool - Quick Start Guide

## Instalasi Cepat (5 menit)

### ✅ Step 1: Setup Database (Ubuntu/Debian)

```bash
sudo bash setup-database.sh
```

Akses mysql verification:
```bash
mysql -u nms -pnms123 -h localhost nms_db
```

### ✅ Step 2: Configure Environment

```bash
cp .env.example .env
# Edit SNMP_HOST ke IP router Anda
nano .env
```

Minimal config di `.env`:
```ini
SNMP_HOST=172.17.100.1
```

### ✅ Step 3: Install & Start

```bash
npm install
npm start
```

Aplikasi siap di: **http://localhost:3000**

---

## 🎯 Penggunaan

### 1️⃣ Lihat Semua Port
```
✓ Automatic - Semua port ditampilkan di sidebar
✓ Interface list refresh otomatis
✓ Real-time dari SNMP
```

### 2️⃣ Pilih Port untuk Monitor
```
1. Klik interface di sidebar
2. Lihat statistik (In/Out bytes, Errors)
3. Click "Enable Monitoring"
   → RRD file dibuat
   → Data collection dimulai
```

### 3️⃣ Lihat Traffic Graph
```
Tunggu 5-10 menit untuk data terkumpul
↓
Klik tab timespan (1 Day, 7 Days, dst)
↓
Traffic graph tampil
```

---

## 🔧 Troubleshooting

### SNMP Connection Failed?

```bash
# Test connection ke router
snmpwalk -v 2c -c public 172.17.100.1 1.3.6.1.2.1.1.1.0

# Jika error:
# 1. Periksa IP router (ganti di .env SNMP_HOST)
# 2. Periksa community string (default: public)
# 3. Enable SNMP di router
# 4. Check firewall router
```

### Database Error?

```bash
# Restart MariaDB
sudo systemctl restart mariadb

# Verify database
mysql -u nms -pnms123 nms_db -e "SHOW TABLES;"
```

### Node.js Error?

```bash
rm -rf node_modules package-lock.json
npm install
npm start
```

---

## 📚 Full Documentation

Baca file-file berikut untuk informasi lengkap:

| File | Deskripsi |
|------|-----------|
| [INSTALL.md](INSTALL.md) | Panduan instalasi lengkap |
| [README_RRDtool.md](README_RRDtool.md) | Dokumentasi lengkap sistem |
| [PORTS_DISPLAY.md](PORTS_DISPLAY.md) | Fitur display & selection port |

---

## 🔄 Auto-Collection Setup

### Option 1: Cron Job (Recommended)

```bash
# Test collector
bash collector.sh

# Add to crontab (every 5 minutes)
(crontab -l 2>/dev/null; echo "*/5 * * * * cd /var/www/nms-tfk && bash collector.sh") | crontab -

# Verify
crontab -l
```

### Option 2: Systemd Service

```bash
sudo systemctl enable nms
sudo systemctl start nms
sudo systemctl status nms
```

---

## 📊 API Quick Reference

```bash
# Get all ports/interfaces
curl http://localhost:3000/api/interfaces/detailed

# Get port statistics
curl http://localhost:3000/api/interfaces/1/status

# Enable monitoring
curl -X POST http://localhost:3000/api/interfaces/1/monitor \
  -H "Content-Type: application/json" \
  -d '{"ifName":"eth0"}'

# Get graph
curl http://localhost:3000/api/graph/1/1day > graph.png
```

---

## 🎓 Example Workflow

```
1. Open http://localhost:3000
   ↓
2. See all ports in sidebar (eth0, eth1, wlan0, etc)
   ↓
3. Click eth0 to select
   ↓
4. See current traffic statistics
   ↓
5. Click "Enable Monitoring"
   ↓
6. Wait 5-10 minutes for data collection
   ↓
7. Click "1 Day" tab to see traffic graph
   ↓
8. Switch to other timespans (7 Days, 30 Days, 1 Year)
```

---

## ✅ Checklist

- [ ] Database setup completed
- [ ] .env file configured
- [ ] npm install done
- [ ] npm start running
- [ ] Web interface accessible
- [ ] SNMP connection working
- [ ] Interface list showing
- [ ] Monitoring enabled for test port
- [ ] Cron job for collector set up

---

## 🆘 Need Help?

1. Check error logs:
   ```bash
   npm start  # See console output
   tail -f collector.log  # Collector logs
   ```

2. Test SNMP:
   ```bash
   snmpwalk -v 2c -c public 172.17.100.1 1.3.6.1.2.1.2.2.1.2
   ```

3. Check database:
   ```bash
   mysql -u nms -pnms123 nms_db
   SHOW TABLES;
   SELECT * FROM interfaces;
   ```

4. Read full docs: [README_RRDtool.md](README_RRDtool.md)

---

## 📝 Key Configuration Files

### .env
```ini
SNMP_HOST=172.17.100.1         # Router IP
SNMP_COMMUNITY=public           # SNMP community
DB_USER=nms                      # Database user
DB_PASS=nms123                   # Database password
DB_NAME=nms_db                   # Database name
PORT=3000                        # Web server port
```

### package.json
```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  }
}
```

---

**Selamat! NMS RRDtool siap digunakan! 🎉**

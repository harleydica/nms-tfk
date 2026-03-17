#!/bin/bash

# ============================================
# NMS RRDtool Database Setup Script
# For Ubuntu Linux with MySQL/MariaDB
# ============================================

set -e

echo "╔════════════════════════════════════════════╗"
echo "║   NMS - RRDtool Database Setup Script     ║"
echo "║   Ubuntu Linux + MySQL/MariaDB             ║"
echo "╚════════════════════════════════════════════╝"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}This script must be run as root${NC}"
   echo "Run: sudo bash setup-database.sh"
   exit 1
fi

# ============================================
# CONFIGURATION
# ============================================

DB_ROOT_PASS="${DB_ROOT_PASS:=Admin@taufik123}"
DB_USER="nms"
DB_PASS="nms123"
DB_NAME="nms_db"
DB_HOST="localhost"

echo -e "${YELLOW}Configuration:${NC}"
echo "  Database Name: $DB_NAME"
echo "  Database User: $DB_USER"
echo "  Database Host: $DB_HOST"
echo ""

# ============================================
# INSTALL DEPENDENCIES
# ============================================

echo -e "${YELLOW}[1/5] Installing dependencies...${NC}"

apt-get update > /dev/null 2>&1

# Detect if MySQL or MariaDB is installed
DB_SERVICE="mysql"
if systemctl list-unit-files | grep -q mariadb; then
    DB_SERVICE="mariadb"
    echo "Detected: MariaDB"
elif systemctl list-unit-files | grep -q mysql; then
    DB_SERVICE="mysql"
    echo "Detected: MySQL"
fi

# Install MySQL/MariaDB
if ! command -v mysql &> /dev/null; then
    echo "Installing MySQL Server..."
    DEBIAN_FRONTEND=noninteractive apt-get install -y mysql-server mysql-client > /dev/null 2>&1
    echo -e "${GREEN}✓ MySQL Server installed${NC}"
else
    echo -e "${GREEN}✓ MySQL Server already installed${NC}"
fi

# Install SNMP tools
if ! command -v snmpwalk &> /dev/null; then
    echo "Installing SNMP tools..."
    apt-get install -y snmp snmp-mibs-downloader > /dev/null 2>&1
    echo -e "${GREEN}✓ SNMP tools installed${NC}"
else
    echo -e "${GREEN}✓ SNMP tools already installed${NC}"
fi

# Install RRDtool
if ! command -v rrdtool &> /dev/null; then
    echo "Installing RRDtool..."
    apt-get install -y rrdtool > /dev/null 2>&1
    echo -e "${GREEN}✓ RRDtool installed${NC}"
else
    echo -e "${GREEN}✓ RRDtool already installed${NC}"
fi

# Install Node.js (if not present)
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    apt-get install -y nodejs npm > /dev/null 2>&1
    echo -e "${GREEN}✓ Node.js installed${NC}"
else
    echo -e "${GREEN}✓ Node.js already installed${NC}"
fi

echo ""

# ============================================
# START DATABASE SERVICE (MySQL/MariaDB)
# ============================================

echo -e "${YELLOW}[2/5] Starting database service...${NC}"

# Try to detect service name and start it
if systemctl list-unit-files | grep -q "mysql.service"; then
    systemctl enable mysql > /dev/null 2>&1
    systemctl start mysql > /dev/null 2>&1
    echo -e "${GREEN}✓ MySQL service started${NC}"
elif systemctl list-unit-files | grep -q "mariadb.service"; then
    systemctl enable mariadb > /dev/null 2>&1
    systemctl start mariadb > /dev/null 2>&1
    echo -e "${GREEN}✓ MariaDB service started${NC}"
else
    echo -e "${YELLOW}⚠ Could not determine database service${NC}"
fi
echo ""
echo ""

# ============================================
# CREATE DATABASE AND USER
# ============================================

echo -e "${YELLOW}[3/5] Creating database and user...${NC}"

# Create SQL commands
SQL_COMMANDS="
-- Drop existing database (if exists)
DROP DATABASE IF EXISTS $DB_NAME;

-- Create database
CREATE DATABASE $DB_NAME CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Drop existing user (if exists)
DROP USER IF EXISTS '$DB_USER'@'$DB_HOST';

-- Create new user
CREATE USER '$DB_USER'@'$DB_HOST' IDENTIFIED BY '$DB_PASS';

-- Grant all privileges
GRANT ALL PRIVILEGES ON $DB_NAME.* TO '$DB_USER'@'$DB_HOST';

-- Flush privileges
FLUSH PRIVILEGES;
"

# Execute SQL commands
mysql -u root${DB_ROOT_PASS:+ -p$DB_ROOT_PASS} << EOF_MYSQL
$SQL_COMMANDS
EOF_MYSQL

echo -e "${GREEN}✓ Database and user created${NC}"
echo ""

# ============================================
# CREATE TABLES
# ============================================

echo -e "${YELLOW}[4/5] Creating database tables...${NC}"

mysql -u $DB_USER -p$DB_PASS $DB_NAME << 'EOF_TABLE'
-- Interfaces table
CREATE TABLE IF NOT EXISTS interfaces (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ifIndex INT UNIQUE NOT NULL,
  ifName VARCHAR(255) NOT NULL,
  ifType INT,
  ifMtu INT,
  ifSpeed BIGINT,
  ifDescription VARCHAR(500),
  ifAlias VARCHAR(500),
  enabled BOOLEAN DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_enabled (enabled),
  INDEX idx_ifName (ifName)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Traffic statistics table
CREATE TABLE IF NOT EXISTS traffic_stats (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ifIndex INT NOT NULL,
  timestamp DATETIME NOT NULL,
  inOctets BIGINT,
  outOctets BIGINT,
  inErrors INT,
  outErrors INT,
  FOREIGN KEY (ifIndex) REFERENCES interfaces(ifIndex) ON DELETE CASCADE,
  INDEX idx_timestamp (timestamp),
  INDEX idx_ifIndex (ifIndex),
  INDEX idx_ifIndex_timestamp (ifIndex, timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Monitoring history
CREATE TABLE IF NOT EXISTS monitoring_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ifIndex INT NOT NULL,
  action VARCHAR(50),
  details TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ifIndex) REFERENCES interfaces(ifIndex) ON DELETE CASCADE,
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
EOF_TABLE

echo -e "${GREEN}✓ Database tables created${NC}"
echo ""

# ============================================
# VERIFY INSTALLATION
# ============================================

echo -e "${YELLOW}[5/5] Verifying installation...${NC}"

# Test database connection
if mysql -u $DB_USER -p$DB_PASS $DB_NAME -e "SELECT 1" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Database connection successful${NC}"
else
    echo -e "${RED}✗ Database connection failed${NC}"
    exit 1
fi

# Check SNMP
if command -v snmpwalk &> /dev/null; then
    echo -e "${GREEN}✓ SNMP tools available${NC}"
else
    echo -e "${RED}✗ SNMP tools not found${NC}"
fi

# Check RRDtool
if command -v rrdtool &> /dev/null; then
    echo -e "${GREEN}✓ RRDtool available${NC}"
    RRDTOOL_VERSION=$(rrdtool --version 2>&1 | head -1)
    echo "  Version: $RRDTOOL_VERSION"
else
    echo -e "${RED}✗ RRDtool not found${NC}"
fi

echo ""

# ============================================
# PRINT CREDENTIALS
# ============================================

echo -e "${GREEN}╔════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   ✓ Setup Complete!                       ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Database Credentials:${NC}"
echo "  Host:     $DB_HOST"
echo "  Database: $DB_NAME"
echo "  User:     $DB_USER"
echo "  Password: $DB_PASS"
echo ""
echo -e "${YELLOW}Environment Variables for Node.js:${NC}"
cat > /tmp/nms_env.txt << EOF
DB_HOST=localhost
DB_USER=$DB_USER
DB_PASS=$DB_PASS
DB_NAME=$DB_NAME
SNMP_HOST=172.17.100.1
SNMP_COMMUNITY=public
SNMP_VERSION=2c
RRD_DIR=./rrd
GRAPH_DIR=./public/graphs
EOF

cat /tmp/nms_env.txt

echo ""
echo -e "${YELLOW}Copy these to your .env file or export them:${NC}"
echo "  $ export \$(cat /tmp/nms_env.txt | xargs)"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Copy environment variables to your server"
echo "  2. Run: npm install"
echo "  3. Run: npm start"
echo "  4. Visit: http://localhost:3000"
echo ""

# Save configuration
cat > /tmp/nms_config.sql << EOF
-- NMS Database Configuration
-- Host: $DB_HOST
-- User: $DB_USER
-- Pass: $DB_PASS
-- Database: $DB_NAME

-- To connect:
-- mysql -u $DB_USER -p$DB_PASS -h $DB_HOST $DB_NAME
EOF

echo -e "${YELLOW}Configuration saved to:${NC}"
echo "  /tmp/nms_env.txt"
echo "  /tmp/nms_config.sql"
echo ""

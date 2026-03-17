#!/bin/bash

# ============================================
# NMS RRDtool - Data Collector
# Run this periodically to collect stats
# ============================================

# Configuration
SNMP_HOST="${SNMP_HOST:=172.17.100.1}"
SNMP_COMMUNITY="${SNMP_COMMUNITY:=public}"
RRD_DIR="${RRD_DIR:=./rrd}"

# Log file
LOG_FILE="collector.log"

# Function to log
log_msg() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log_msg "Starting data collection..."

# Check if RRD directory exists
if [ ! -d "$RRD_DIR" ]; then
    log_msg "ERROR: RRD directory not found: $RRD_DIR"
    exit 1
fi

# Get list of RRD files
rrd_files=$(ls "$RRD_DIR"/*.rrd 2>/dev/null)

if [ -z "$rrd_files" ]; then
    log_msg "WARNING: No RRD files found. Enable monitoring first."
    exit 0
fi

# Collect data for each RRD file
total=0
success=0

for rrd_file in $rrd_files; do
    filename=$(basename "$rrd_file")
    ifindex=$(echo "$filename" | cut -d'_' -f1)
    
    ((total++))
    
    log_msg "Collecting data for interface $ifindex..."
    
    # SNMP OIDs
    OID_IN_OCTETS="1.3.6.1.2.1.2.2.1.10.$ifindex"
    OID_OUT_OCTETS="1.3.6.1.2.1.2.2.1.16.$ifindex"
    OID_IN_ERRORS="1.3.6.1.2.1.2.2.1.14.$ifindex"
    OID_OUT_ERRORS="1.3.6.1.2.1.2.2.1.20.$ifindex"
    
    # Get values from SNMP
    in_octets=$(snmpget -v 2c -c "$SNMP_COMMUNITY" "$SNMP_HOST" "$OID_IN_OCTETS" 2>/dev/null | grep -oP '= \K[0-9]+')
    out_octets=$(snmpget -v 2c -c "$SNMP_COMMUNITY" "$SNMP_HOST" "$OID_OUT_OCTETS" 2>/dev/null | grep -oP '= \K[0-9]+')
    in_errors=$(snmpget -v 2c -c "$SNMP_COMMUNITY" "$SNMP_HOST" "$OID_IN_ERRORS" 2>/dev/null | grep -oP '= \K[0-9]+')
    out_errors=$(snmpget -v 2c -c "$SNMP_COMMUNITY" "$SNMP_HOST" "$OID_OUT_ERRORS" 2>/dev/null | grep -oP '= \K[0-9]+')
    
    # Check if we got values
    if [ -z "$in_octets" ] || [ -z "$out_octets" ]; then
        log_msg "ERROR: Failed to get data for interface $ifindex"
        continue
    fi
    
    # Default errors to 0 if not available
    in_errors=${in_errors:-0}
    out_errors=${out_errors:-0}
    
    # Update RRD
    timestamp=$(date +%s)
    rrdupdate_cmd="$timestamp:$in_octets:$out_octets:$in_errors:$out_errors"
    
    if rrdtool update "$rrd_file" "$rrdupdate_cmd" 2>/dev/null; then
        ((success++))
        log_msg "✓ Updated $filename (in:$in_octets out:$out_octets)"
    else
        log_msg "ERROR: Failed to update $filename"
    fi
done

log_msg "Collection completed: $success/$total success"
log_msg "---"

#!/bin/bash

# ============================================
# NMS RRDtool - Graph Generator
# Generate graphs for monitoring visualization
# ============================================

RRD_DIR="${RRD_DIR:=./rrd}"
GRAPH_DIR="${GRAPH_DIR:=./public/graphs}"

echo "Generating graphs..."

# Create graph directory if not exists
mkdir -p "$GRAPH_DIR"

# Define timespans
timespans=("1day" "7day" "30day" "1year")
timespan_opts=(
    "-s -1d"
    "-s -7d"
    "-s -30d"
    "-s -1y"
)

# Get all RRD files
rrd_files=$(ls "$RRD_DIR"/*.rrd 2>/dev/null)

if [ -z "$rrd_files" ]; then
    echo "ERROR: No RRD files found"
    exit 1
fi

# Generate graphs for each RRD file
for rrd_file in $rrd_files; do
    filename=$(basename "$rrd_file" .rrd)
    ifindex=$(echo "$filename" | cut -d'_' -f1)
    ifname=$(echo "$filename" | cut -d'_' -f2-)
    
    echo "Generating graphs for: $ifname (Index: $ifindex)"
    
    # Generate graph for each timespan
    for i in "${!timespans[@]}"; do
        timespan="${timespans[$i]}"
        timespan_opt="${timespan_opts[$i]}"
        
        graph_file="$GRAPH_DIR/${ifindex}_${timespan}.png"
        
        rrdtool graph "$graph_file" \
            $timespan_opt \
            -w 1200 -h 600 \
            --title "Interface: $ifname - ${timespan}" \
            --vertical-label "Bits/Sec" \
            --right-axis-label "Errors/Sec" \
            --watermark "Generated: $(date)" \
            --bgcolor \\'#ffffff\\' \
            --fgcolor \\'#000000\\' \
            --gridcolor \\'#cccccc\\' \
            DEF:inOctets="$rrd_file":InOctets:AVERAGE \
            DEF:outOctets="$rrd_file":OutOctets:AVERAGE \
            DEF:inErrors="$rrd_file":InErrors:AVERAGE \
            DEF:outErrors="$rrd_file":OutErrors:AVERAGE \
            CDEF:inBits=inOctets,8,\\* \
            CDEF:outBits=outOctets,8,\\* \
            AREA:inBits\\'#00CC00\\':\"In Traffic\" \
            LINE2:outBits\\'#0000FF\\':\"Out Traffic\" \
            LINE1:inErrors\\'#FF0000\\':\"In Errors\" \
            LINE1:outErrors\\'#FFAA00\\':\"Out Errors\" \
            2>/dev/null
        
        if [ $? -eq 0 ]; then
            echo "  ✓ Generated: $timespan"
        else
            echo "  ✗ Failed to generate: $timespan"
        fi
    done
    
    echo ""
done

echo "Graph generation completed!"

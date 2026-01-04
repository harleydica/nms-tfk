// public/config.js
export const SYSTEM_INFO = {
  system: "NMS in TFK HOME-YGK",
  maintainer: "mail@taufikcrisnawan.dev"
};

export const INTERFACES = {
  "bridge-LAN": {
  description: "network local TFK",
  ifType: "bridge (7)",
  maxSpeed: "1G",
  ip: "192.168.20.1 (No DNS name)"
  },
  "ether2-to-BIZNET": {
  description: "upstream to BIZNET 100Mbps",
  ifType: "ethernetCsmacd (6)",
  maxSpeed: "1G",
  ip: "No IP (No DNS name)"
  },
  "ether3-to-FS": {
  description: "upstream to Fiberstream 150Mbps",
  ifType: "ethernetCsmacd (6)",
  maxSpeed: "1G",
  ip: "192.168.101.2 (No DNS name)"
  },
  "bridge-IXP": {
  description: "Karyasija IX",
  ifType: "bridge (7)",
  maxSpeed: "1G",
  ip: "172.16.12.1 (No DNS name)"
  },
  "ether4-to-SURYA": {
  description: "downstream to SURYA 10Mbps",
  ifType: "ethernetCsmacd (6)",
  maxSpeed: "1G",
  ip: "10.40.0.9 (No DNS name)"
  },
  "vlan30-to-UMUM": {
  description: "downstream to network UMUM",
  ifType: "l2vlan (135)",
  maxSpeed: "1G",
  ip: "192.168.30.1 (No DNS name)"
  },
  "vlan40-to-HANIFAN": {
  description: "downstream to network HANIFAN",
  ifType: "l2vlan (135)",
  maxSpeed: "1G",
  ip: "10.40.0.1 (No DNS name)"
  }
};
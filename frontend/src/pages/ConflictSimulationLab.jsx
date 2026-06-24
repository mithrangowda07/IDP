import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, Polyline, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Play, Pause, RotateCcw, AlertTriangle, ShieldCheck, Clock, Users, ArrowRight, Activity, Plus, Shield, Check, Flame, Siren, Trash2, FastForward, Loader2, MapPin, Navigation } from 'lucide-react';

// Fix Leaflet marker icon asset paths for Vite/React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// User corrected coordinates for Jnana Bharathi Circle
const JB_CIRCLE = [12.935619, 77.513071];
const CAMPUS_DEST = [12.9420, 77.5060];

// Detailed curved fallback paths following real roads (Mysore Road, ORR, Jnana Bharathi Blvd)
const PREDEFINED_PATHS = {
  'Rajarajeshwari Nagar': {
    origin: [12.908, 77.522],
    part1: [
      [12.908, 77.522], // RR Nagar
      [12.914, 77.525],
      [12.918, 77.528], // RR Nagar Arch
      [12.924, 77.523], // Mysore Road
      [12.930, 77.518],
      JB_CIRCLE
    ],
    part2: [
      JB_CIRCLE,
      [12.938, 77.511], // University road entry
      [12.940, 77.508],
      CAMPUS_DEST
    ]
  },
  'Kengeri': {
    origin: [12.908, 77.484],
    part1: [
      [12.908, 77.484], // Kengeri
      [12.913, 77.489], // Mysore Road
      [12.919, 77.494],
      [12.925, 77.499],
      [12.930, 77.505],
      JB_CIRCLE
    ],
    part2: [
      JB_CIRCLE,
      [12.938, 77.511],
      [12.940, 77.508],
      CAMPUS_DEST
    ]
  },
  'Kengeri Satellite Town': {
    origin: [12.918, 77.478],
    part1: [
      [12.918, 77.478],
      [12.920, 77.485],
      [12.922, 77.492],
      [12.928, 77.499],
      [12.933, 77.506],
      JB_CIRCLE
    ],
    part2: [
      JB_CIRCLE,
      [12.938, 77.511],
      [12.940, 77.508],
      CAMPUS_DEST
    ]
  },
  'Ullal Main Road': {
    origin: [12.955, 77.498],
    part1: [
      [12.955, 77.498], // Ullal Main Rd
      [12.948, 77.502],
      [12.942, 77.506],
      [12.938, 77.510],
      JB_CIRCLE
    ],
    part2: [
      JB_CIRCLE,
      [12.938, 77.511],
      [12.940, 77.508],
      CAMPUS_DEST
    ]
  },
  'Mysore Road': {
    origin: [12.923, 77.499],
    part1: [
      [12.923, 77.499], // RV College side
      [12.927, 77.503],
      [12.931, 77.508],
      JB_CIRCLE
    ],
    part2: [
      JB_CIRCLE,
      [12.938, 77.511],
      [12.940, 77.508],
      CAMPUS_DEST
    ]
  },
  'NICE Road': {
    origin: [12.898, 77.492],
    part1: [
      [12.898, 77.492], // NICE Rd interchange
      [12.908, 77.494],
      [12.918, 77.496],
      [12.927, 77.503],
      JB_CIRCLE
    ],
    part2: [
      JB_CIRCLE,
      [12.938, 77.511],
      [12.940, 77.508],
      CAMPUS_DEST
    ]
  }
};

const EMERGENCY_WEIGHTS = {
  'Cardiac Arrest': 100,
  'Major Fire': 95,
  'Gas Leak': 90,
  'Stroke': 90,
  'Building Collapse': 85,
  'Road Accident': 80,
  'Police Escort': 70
};

const PREDEFINED_SCENARIOS = [
  {
    id: 'A',
    name: 'Scenario A: Priority Difference',
    description: 'Ambulance (Priority 95) vs Fire Engine (Priority 80). Priority rules win.',
    vehicles: [
      {
        id: 'AMB-105',
        type: 'ambulance',
        priority: 95,
        distance: 2,
        eta: 120,
        livesAtRisk: 1,
        emergencyType: 'Cardiac Arrest',
        origin: 'Rajarajeshwari Nagar',
        dispatchTime: new Date(Date.now() - 10000).toISOString()
      },
      {
        id: 'FIRE-742',
        type: 'fire_engine',
        priority: 80,
        distance: 1,
        eta: 100,
        livesAtRisk: 1,
        emergencyType: 'Road Accident',
        origin: 'Kengeri Satellite Town',
        dispatchTime: new Date(Date.now() - 5000).toISOString()
      }
    ]
  },
  {
    id: 'B',
    name: 'Scenario B: Same Priority',
    description: 'Both vehicles priority 90. Distance resolves conflict: closer to destination wins.',
    vehicles: [
      {
        id: 'AMB-105',
        type: 'ambulance',
        priority: 90,
        distance: 2,
        eta: 100,
        livesAtRisk: 1,
        emergencyType: 'Cardiac Arrest',
        origin: 'Rajarajeshwari Nagar',
        dispatchTime: new Date(Date.now() - 10000).toISOString()
      },
      {
        id: 'FIRE-742',
        type: 'fire_engine',
        priority: 90,
        distance: 5,
        eta: 160,
        livesAtRisk: 1,
        emergencyType: 'Road Accident',
        origin: 'Kengeri',
        dispatchTime: new Date(Date.now() - 5000).toISOString()
      }
    ]
  },
  {
    id: 'C',
    name: 'Scenario C: Same Priority & Distance',
    description: 'Same priority (90) and distance (2 km). The vehicle with lower ETA to junction wins.',
    vehicles: [
      {
        id: 'AMB-105',
        type: 'ambulance',
        priority: 90,
        distance: 2,
        eta: 120,
        livesAtRisk: 1,
        emergencyType: 'Cardiac Arrest',
        origin: 'Rajarajeshwari Nagar',
        dispatchTime: new Date(Date.now() - 10000).toISOString()
      },
      {
        id: 'FIRE-742',
        type: 'fire_engine',
        priority: 90,
        distance: 2,
        eta: 80,
        livesAtRisk: 1,
        emergencyType: 'Road Accident',
        origin: 'Ullal Main Road',
        dispatchTime: new Date(Date.now() - 5000).toISOString()
      }
    ]
  },
  {
    id: 'D',
    name: 'Scenario D: Same Priority, Distance & ETA',
    description: 'Lives At Risk (20 vs 1) breaks the tie.',
    vehicles: [
      {
        id: 'AMB-105',
        type: 'ambulance',
        priority: 90,
        distance: 2,
        eta: 100,
        livesAtRisk: 1,
        emergencyType: 'Cardiac Arrest',
        origin: 'Rajarajeshwari Nagar',
        dispatchTime: new Date(Date.now() - 10000).toISOString()
      },
      {
        id: 'FIRE-742',
        type: 'fire_engine',
        priority: 90,
        distance: 2,
        eta: 100,
        livesAtRisk: 20,
        emergencyType: 'Major Fire',
        origin: 'Ullal Main Road',
        dispatchTime: new Date(Date.now() - 5000).toISOString()
      }
    ]
  },
  {
    id: 'E',
    name: 'Scenario E: Three Vehicle Conflict',
    description: 'Ambulance (95), Fire Engine (85), and Police (70) in 3-way conflict. Shows priority ranking animation.',
    vehicles: [
      {
        id: 'AMB-105',
        type: 'ambulance',
        priority: 95,
        distance: 1.5,
        eta: 15,
        livesAtRisk: 1,
        emergencyType: 'Cardiac Arrest',
        origin: 'Rajarajeshwari Nagar',
        dispatchTime: new Date(Date.now() - 10000).toISOString()
      },
      {
        id: 'FIRE-742',
        type: 'fire_engine',
        priority: 85,
        distance: 2,
        eta: 20,
        livesAtRisk: 5,
        emergencyType: 'Major Fire',
        origin: 'Kengeri',
        dispatchTime: new Date(Date.now() - 8000).toISOString()
      },
      {
        id: 'POLICE-201',
        type: 'police',
        priority: 70,
        distance: 2.5,
        eta: 25,
        livesAtRisk: 1,
        emergencyType: 'Police Escort',
        origin: 'Ullal Main Road',
        dispatchTime: new Date(Date.now() - 5000).toISOString()
      }
    ]
  },
  {
    id: 'F',
    name: 'Scenario F: Mega Junction Simulation',
    description: '5 emergency vehicles converging from all road networks towards Jnana Bharathi Circle.',
    vehicles: [
      {
        id: 'AMB-105',
        type: 'ambulance',
        priority: 95,
        distance: 2,
        eta: 30,
        livesAtRisk: 1,
        emergencyType: 'Cardiac Arrest',
        origin: 'Rajarajeshwari Nagar',
        dispatchTime: new Date(Date.now() - 15000).toISOString()
      },
      {
        id: 'FIRE-742',
        type: 'fire_engine',
        priority: 90,
        distance: 3,
        eta: 40,
        livesAtRisk: 10,
        emergencyType: 'Major Fire',
        origin: 'Kengeri',
        dispatchTime: new Date(Date.now() - 10000).toISOString()
      },
      {
        id: 'POLICE-201',
        type: 'police',
        priority: 70,
        distance: 4,
        eta: 50,
        livesAtRisk: 1,
        emergencyType: 'Police Escort',
        origin: 'Ullal Main Road',
        dispatchTime: new Date(Date.now() - 5000).toISOString()
      },
      {
        id: 'AMB-112',
        type: 'ambulance',
        priority: 88,
        distance: 2.5,
        eta: 35,
        livesAtRisk: 1,
        emergencyType: 'Stroke',
        origin: 'Mysore Road',
        dispatchTime: new Date(Date.now() - 12000).toISOString()
      },
      {
        id: 'FIRE-800',
        type: 'fire_engine',
        priority: 89,
        distance: 3.5,
        eta: 45,
        livesAtRisk: 12,
        emergencyType: 'Gas Leak',
        origin: 'NICE Road',
        dispatchTime: new Date(Date.now() - 8000).toISOString()
      }
    ]
  }
];

function MapFocusController({ zoom = 14 }) {
  const map = useMap();
  useEffect(() => {
    map.setView(JB_CIRCLE, zoom);
  }, [map, zoom]);
  return null;
}

const createVehicleIcon = (type, id, priority, eta, distance, isWinner = false, signalStatus = 'red') => {
  let bgColor = '#3b82f6';
  let borderClass = 'border-blue-500';
  let glowClass = 'shadow-[0_0_15px_rgba(59,130,246,0.6)]';
  let label = 'AMB';
  let emoji = '🚑';

  if (type === 'fire_engine') {
    bgColor = '#ef4444';
    borderClass = 'border-red-500';
    glowClass = 'shadow-[0_0_15px_rgba(239,68,68,0.6)]';
    label = 'FIRE';
    emoji = '🚒';
  } else if (type === 'police') {
    bgColor = '#a855f7';
    borderClass = 'border-purple-500';
    glowClass = 'shadow-[0_0_15px_rgba(168,85,247,0.6)]';
    label = 'POL';
    emoji = '🚓';
  }

  const isGreenCorridor = isWinner && signalStatus === 'green';

  return L.divIcon({
    className: 'custom-leaflet-icon-vehicle',
    html: `
      <div class="relative w-[100px] h-[100px] pointer-events-none select-none" style="filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.4));">
        <!-- Floating Info Card -->
        <div class="absolute left-1/2 -translate-x-1/2 bottom-[72px] bg-slate-950/95 border ${borderClass} rounded-lg p-1.5 shadow-2xl text-[8px] min-w-[85px] leading-tight text-gray-300">
          <div class="font-black text-white flex items-center gap-1 border-b border-white/5 pb-0.5 mb-1">
            <span>${emoji}</span>
            <span class="truncate">${id}</span>
          </div>
          <div class="flex justify-between"><span>Priority:</span><strong class="text-white ml-1">${priority}</strong></div>
          <div class="flex justify-between"><span>ETA:</span><strong class="text-white ml-1">${eta}s</strong></div>
          <div class="flex justify-between"><span>Dist:</span><strong class="text-white ml-1">${distance} km</strong></div>
        </div>

        <!-- Arrow Pin Pointer -->
        <div class="absolute left-1/2 -translate-x-1/2 bottom-[66px] w-1.5 h-1.5 bg-slate-950 border-r border-b ${borderClass} rotate-45 z-10"></div>

        <!-- Vehicle Badge -->
        <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 rounded-full border-2 bg-slate-900 ${borderClass} ${glowClass} transition-all duration-300">
          ${isGreenCorridor ? `<div class="absolute -inset-1 rounded-full bg-emerald-500/30 animate-ping"></div>` : ''}
          <div class="flex flex-col items-center justify-center">
            <span class="text-[6px] font-bold text-gray-400 leading-none uppercase">${label}</span>
            <span class="text-white text-[8px] font-black leading-none mt-0.5">${id.split('-')[1] || id}</span>
          </div>
        </div>
      </div>
    `,
    iconSize: [100, 100],
    iconAnchor: [50, 50]
  });
};

const createJunctionIcon = (vehiclesCount, riskLevel, winnerCrossing) => {
  let pulseColor = 'bg-red-500';
  let borderColor = 'border-red-500/40';
  let glowClass = 'glow-red-pulse';
  let statusText = '⚠ CONFLICT DETECTED';
  let riskColor = 'text-red-400';
  
  if (winnerCrossing) {
    pulseColor = 'bg-emerald-500';
    borderColor = 'border-emerald-500/40';
    glowClass = 'glow-green-pulse';
    statusText = '⚡ CORRIDOR ACTIVE';
    riskColor = 'text-emerald-400';
  } else if (riskLevel === 'HIGH') {
    riskColor = 'text-orange-400';
  } else if (riskLevel === 'MEDIUM') {
    riskColor = 'text-yellow-400';
  } else if (riskLevel === 'LOW') {
    riskColor = 'text-emerald-400';
  }

  return L.divIcon({
    className: 'custom-leaflet-icon-junction',
    html: `
      <div class="relative flex items-center justify-center w-12 h-12 rounded-full">
        <!-- Expanding Radar Rings -->
        <div class="absolute inset-0 rounded-full ${pulseColor}/20 animate-ping" style="animation-duration: 2s;"></div>
        <div class="absolute -inset-2 rounded-full ${pulseColor}/10 animate-ping" style="animation-duration: 3s; animation-delay: 0.5s;"></div>
        <div class="absolute -inset-4 rounded-full ${pulseColor}/5 animate-ping" style="animation-duration: 4s; animation-delay: 1s;"></div>
        
        <!-- Center Core -->
        <div class="w-4 h-4 ${pulseColor} rounded-full animate-pulse border-2 border-white shadow-lg"></div>
        
        <!-- HUD Panel Card -->
        <div class="absolute -top-[76px] bg-slate-950/95 border ${borderColor} rounded-xl p-2 shadow-2xl text-[8px] min-w-[125px] pointer-events-none select-none text-left leading-tight text-gray-300 transform -translate-y-1 z-[3000] ${glowClass}">
          <div class="font-black ${riskColor} uppercase tracking-wider text-center border-b border-white/5 pb-1 mb-1">${statusText}</div>
          <div class="font-bold text-white text-[9px]">Jnana Bharathi Circle</div>
          <div class="flex justify-between mt-1"><span>Involved:</span><strong class="text-white">${vehiclesCount} Vehicles</strong></div>
          <div class="flex justify-between"><span>Risk Index:</span><strong class="${riskColor}">${riskLevel}</strong></div>
        </div>
        
        <!-- HUD Pointer -->
        <div class="absolute -top-[9px] w-1.5 h-1.5 bg-slate-950 border-r border-b ${borderColor} rotate-45 z-[3000]"></div>
      </div>
    `,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
  });
};

function interpolatePath(path, progress) {
  if (!path || path.length === 0) return JB_CIRCLE;
  if (path.length === 1) return path[0];
  if (progress <= 0) return path[0];
  if (progress >= 1) return path[path.length - 1];

  const distances = [];
  let totalDistance = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const d = Math.sqrt(
      Math.pow(path[i+1][0] - path[i][0], 2) + 
      Math.pow(path[i+1][1] - path[i][1], 2)
    );
    distances.push(d);
    totalDistance += d;
  }

  if (totalDistance === 0) return path[0];

  const targetDistance = progress * totalDistance;
  let accumulatedDistance = 0;

  for (let i = 0; i < distances.length; i++) {
    const segDist = distances[i];
    if (accumulatedDistance + segDist >= targetDistance) {
      const segmentProgress = segDist > 0 ? (targetDistance - accumulatedDistance) / segDist : 0;
      const start = path[i];
      const end = path[i + 1];
      const lat = start[0] + (end[0] - start[0]) * segmentProgress;
      const lng = start[1] + (end[1] - start[1]) * segmentProgress;
      return [lat, lng];
    }
    accumulatedDistance += segDist;
  }

  return path[path.length - 1];
}

const fetchOSRMRoute = async (start, end) => {
  const coordinates = `${start[1]},${start[0]};${end[1]},${end[0]}`;
  const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.code === 'Ok' && data.routes?.length > 0) {
    return data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  }
  throw new Error('OSRM Route Failed');
};

const getDecisionTreeTimeline = (vehiclesList) => {
  let candidates = [...vehiclesList];
  const stepsDef = [
    { name: 'Priority', field: 'priority', compare: (a, b) => b.priority - a.priority, format: v => v.priority },
    { name: 'Distance', field: 'distance', compare: (a, b) => a.distance - b.distance, format: v => `${v.distance} km` },
    { name: 'ETA', field: 'eta', compare: (a, b) => a.eta - b.eta, format: v => `${v.eta}s` },
    { name: 'Lives At Risk', field: 'livesAtRisk', compare: (a, b) => b.livesAtRisk - a.livesAtRisk, format: v => v.livesAtRisk },
    { name: 'Emergency Type', field: 'emergencyType', compare: (a, b) => {
        const wA = EMERGENCY_WEIGHTS[a.emergencyType] || 0;
        const wB = EMERGENCY_WEIGHTS[b.emergencyType] || 0;
        return wB - wA;
      }, format: v => `${v.emergencyType} (${EMERGENCY_WEIGHTS[v.emergencyType] || 0})` 
    },
    { name: 'Dispatch Timestamp', field: 'dispatchTime', compare: (a, b) => {
        const tA = new Date(a.dispatchTime).getTime();
        const tB = new Date(b.dispatchTime).getTime();
        return tA - tB;
      }, format: v => new Date(v.dispatchTime).toLocaleTimeString() 
    }
  ];

  const results = [];
  let winnerFound = false;

  for (const step of stepsDef) {
    if (candidates.length <= 1) {
      results.push({
        ...step,
        status: 'skipped',
        details: 'Not Evaluated',
        valuesDisplay: '',
        candidates: []
      });
      continue;
    }

    if (winnerFound) {
      results.push({
        ...step,
        status: 'skipped',
        details: 'Not Evaluated',
        valuesDisplay: '',
        candidates: []
      });
      continue;
    }

    const sorted = [...candidates].sort(step.compare);
    const bestValue = sorted[0];
    const tiedCandidates = candidates.filter(c => step.compare(c, bestValue) === 0);
    const valuesStr = candidates.map(c => `${c.id.split('-')[1] || c.id}: ${step.format(c)}`).join(' vs ');

    if (tiedCandidates.length === 1) {
      winnerFound = true;
      results.push({
        ...step,
        status: 'winner',
        details: `Winner Selected: ${tiedCandidates[0].id}`,
        valuesDisplay: valuesStr,
        winner: tiedCandidates[0].id,
        candidates: [...candidates]
      });
      candidates = [tiedCandidates[0]];
    } else {
      results.push({
        ...step,
        status: 'tie',
        details: 'Tie - Checking Next',
        valuesDisplay: valuesStr,
        candidates: [...candidates]
      });
      candidates = tiedCandidates;
    }
  }

  return results;
};

export default function ConflictSimulationLab() {
  const [selectedScenario, setSelectedScenario] = useState(PREDEFINED_SCENARIOS[0]);
  const [vehicles, setVehicles] = useState(PREDEFINED_SCENARIOS[0].vehicles);
  
  // Real-time routes state
  const [routes, setRoutes] = useState({});
  const [loadingRoutes, setLoadingRoutes] = useState(false);

  // Custom builder states
  const [builderVehicles, setBuilderVehicles] = useState([
    {
      id: 'AMB-105',
      type: 'ambulance',
      priority: 90,
      distance: 2,
      eta: 100,
      livesAtRisk: 1,
      emergencyType: 'Cardiac Arrest',
      origin: 'Rajarajeshwari Nagar',
      dispatchTime: new Date().toISOString()
    },
    {
      id: 'FIRE-742',
      type: 'fire_engine',
      priority: 90,
      distance: 2,
      eta: 100,
      livesAtRisk: 20,
      emergencyType: 'Major Fire',
      origin: 'Ullal Main Road',
      dispatchTime: new Date().toISOString()
    }
  ]);

  // Simulation play state
  const [isPlaying, setIsPlaying] = useState(false);
  const [simTime, setSimTime] = useState(0);
  const [simSpeed, setSimSpeed] = useState(1);
  const [logs, setLogs] = useState([]);
  const [winnerInfo, setWinnerInfo] = useState(null);
  
  const timerRef = useRef(null);
  const decisionLogRef = useRef([]);

  // Load real road routes from OSRM dynamically with curved fallbacks
  useEffect(() => {
    let isCurrent = true;
    const loadRealRoutes = async () => {
      setLoadingRoutes(true);
      const newRoutes = {};
      
      for (const veh of vehicles) {
        const fallbackPath = PREDEFINED_PATHS[veh.origin];
        if (!fallbackPath) continue;

        try {
          // Fetch OSRM coordinates for the real road segments
          const part1 = await fetchOSRMRoute(fallbackPath.origin, JB_CIRCLE);
          const part2 = await fetchOSRMRoute(JB_CIRCLE, CAMPUS_DEST);
          newRoutes[veh.id] = { part1, part2 };
        } catch (e) {
          console.warn(`OSRM failed for vehicle ${veh.id}. Falling back to pre-drawn curved streets:`, e);
          newRoutes[veh.id] = {
            part1: fallbackPath.part1,
            part2: fallbackPath.part2
          };
        }
      }

      if (isCurrent) {
        setRoutes(newRoutes);
        setLoadingRoutes(false);
      }
    };

    loadRealRoutes();
    return () => {
      isCurrent = false;
    };
  }, [vehicles]);

  // Decision Engine implementation
  const compareVehicles = (a, b, logSteps = false) => {
    // Step 1: Priority
    if (a.priority !== b.priority) {
      if (logSteps) {
        decisionLogRef.current.push(`Priority: ${a.id} (${a.priority}) vs ${b.id} (${b.priority}) → ${a.priority > b.priority ? a.id : b.id} wins`);
      }
      return b.priority - a.priority; // descending priority
    }
    if (logSteps) decisionLogRef.current.push(`Priority tie between ${a.id} and ${b.id} (${a.priority}). Checking Distance...`);

    // Step 2: Distance
    if (a.distance !== b.distance) {
      if (logSteps) {
        decisionLogRef.current.push(`Distance: ${a.id} (${a.distance} km) vs ${b.id} (${b.distance} km) → ${a.distance < b.distance ? a.id : b.id} wins`);
      }
      return a.distance - b.distance; // ascending distance (closer wins)
    }
    if (logSteps) decisionLogRef.current.push(`Distance tie between ${a.id} and ${b.id} (${a.distance} km). Checking ETA...`);

    // Step 3: ETA
    if (a.eta !== b.eta) {
      if (logSteps) {
        decisionLogRef.current.push(`ETA to Junction: ${a.id} (${a.eta}s) vs ${b.id} (${b.eta}s) → ${a.eta < b.eta ? a.id : b.id} wins`);
      }
      return a.eta - b.eta; // ascending ETA (lower ETA wins)
    }
    if (logSteps) decisionLogRef.current.push(`ETA tie between ${a.id} and ${b.id} (${a.eta}s). Checking Lives At Risk...`);

    // Step 4: Lives At Risk
    if (a.livesAtRisk !== b.livesAtRisk) {
      if (logSteps) {
        decisionLogRef.current.push(`Lives At Risk: ${a.id} (${a.livesAtRisk}) vs ${b.id} (${b.livesAtRisk}) → ${a.livesAtRisk > b.livesAtRisk ? a.id : b.id} wins`);
      }
      return b.livesAtRisk - a.livesAtRisk; // descending lives
    }
    if (logSteps) decisionLogRef.current.push(`Lives at risk tie between ${a.id} and ${b.id} (${a.livesAtRisk}). Checking Emergency Type Weight...`);

    // Step 5: Emergency Type Weight
    const wA = EMERGENCY_WEIGHTS[a.emergencyType] || 0;
    const wB = EMERGENCY_WEIGHTS[b.emergencyType] || 0;
    if (wA !== wB) {
      if (logSteps) {
        decisionLogRef.current.push(`Emergency Weight: ${a.id} (${a.emergencyType}: ${wA}) vs ${b.id} (${b.emergencyType}: ${wB}) → ${wA > wB ? a.id : b.id} wins`);
      }
      return wB - wA; // descending weight
    }
    if (logSteps) decisionLogRef.current.push(`Emergency type weight tie between ${a.id} and ${b.id}. Checking Dispatch Timestamp...`);

    // Step 6: Dispatch time
    const tA = new Date(a.dispatchTime).getTime();
    const tB = new Date(b.dispatchTime).getTime();
    if (tA !== tB) {
      if (logSteps) {
        decisionLogRef.current.push(`Dispatch Time: ${a.id} vs ${b.id} → ${tA < tB ? a.id : b.id} (earlier dispatch) wins`);
      }
      return tA - tB; // ascending timestamp (earlier wins)
    }

    return 0;
  };

  const getSortedRankingAndLogs = (vehiclesList) => {
    decisionLogRef.current = [];
    decisionLogRef.current.push(`🚨 Conflict Detected at Jnana Bharathi Circle`);
    decisionLogRef.current.push(`🚗 Vehicles involved: ${vehiclesList.map(v => v.id).join(', ')}`);

    // Step-by-step pair comparison log generation
    const sorted = [...vehiclesList].sort((a, b) => compareVehicles(a, b, true));
    
    // Add summary logs
    decisionLogRef.current.push(`\n🧠 AI Decision Summary:`);
    sorted.forEach((v, index) => {
      decisionLogRef.current.push(`  Rank ${index + 1}: ${v.id} (ETA: ${v.eta}s | Priority: ${v.priority})`);
    });
    decisionLogRef.current.push(`\n✅ Green Corridor allocated to winner: ${sorted[0].id}`);
    
    return {
      sorted,
      rawLogs: decisionLogRef.current
    };
  };

  // Compile calculations when vehicles change
  const simData = useMemo(() => {
    if (vehicles.length === 0) return { sorted: [], rawLogs: [], releaseTimes: {} };
    const { sorted, rawLogs } = getSortedRankingAndLogs(vehicles);
    
    // Calculate sequential release times
    const releaseTimes = {};
    const delayBetweenRelease = 12; // seconds it takes for winner to clear junction
    
    sorted.forEach((vehicle, index) => {
      if (index === 0) {
        // Winner is released as soon as they reach
        releaseTimes[vehicle.id] = vehicle.eta;
      } else {
        // Later vehicles released after previous is released + delay (sequential allocation)
        const prevVehicle = sorted[index - 1];
        releaseTimes[vehicle.id] = Math.max(vehicle.eta, releaseTimes[prevVehicle.id] + delayBetweenRelease);
      }
    });

    return { sorted, rawLogs, releaseTimes };
  }, [vehicles]);

  // Handle Play/Pause
  useEffect(() => {
    if (isPlaying) {
      const step = 0.5; // virtual seconds per tick
      const intervalMs = 100 / simSpeed; // tick speed in real ms
      
      timerRef.current = setInterval(() => {
        setSimTime(prev => {
          const next = prev + step;
          
          // Max simulation time to let all vehicles reach destination
          const maxRelease = Math.max(...Object.values(simData.releaseTimes), 0);
          const maxTime = maxRelease + 20;

          if (next >= maxTime) {
            setIsPlaying(false);
            clearInterval(timerRef.current);
            return maxTime;
          }
          return next;
        });
      }, intervalMs);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, simSpeed, simData]);

  // Feed decision logs line-by-line in real time matching simulation progress
  useEffect(() => {
    if (simTime === 0) {
      setLogs([]);
      setWinnerInfo(null);
      return;
    }

    // Determine what logs to show at what sim time
    const activeLogs = [];
    const logsPerSecond = simData.rawLogs.length / 10; // spread logs over first 10 seconds of simulation
    
    const showCount = Math.min(
      simData.rawLogs.length, 
      Math.max(1, Math.floor(simTime * logsPerSecond))
    );

    for (let i = 0; i < showCount; i++) {
      activeLogs.push(simData.rawLogs[i]);
    }

    setLogs(activeLogs);

    // Set end summary info when resolved
    if (simData.sorted.length > 0 && simTime >= Math.max(...Object.values(simData.releaseTimes), 0)) {
      setWinnerInfo({
        name: simData.sorted[0].id,
        strategy: 'Priority → Distance → ETA → Lives At Risk → Weight',
        time: (Math.max(...Object.values(simData.releaseTimes), 0) + 12).toFixed(1),
        count: vehicles.length
      });
    }
  }, [simTime, simData]);

  // Choose a Predefined Scenario
  const handleSelectScenario = (sc) => {
    setSelectedScenario(sc);
    setVehicles(sc.vehicles);
    setIsPlaying(false);
    setSimTime(0);
    setLogs([]);
    setWinnerInfo(null);
  };

  // Handle Custom Builder edits
  const handleAddCustomVehicle = () => {
    if (builderVehicles.length >= 5) return;
    
    // Select a unique name and route
    const count = builderVehicles.length + 1;
    const vehicleTypes = ['ambulance', 'fire_engine', 'police'];
    const type = vehicleTypes[builderVehicles.length % 3];
    const prefix = type === 'ambulance' ? 'AMB' : type === 'fire_engine' ? 'FIRE' : 'POLICE';
    
    // Choose starting location not already used, or default
    const origins = Object.keys(PREDEFINED_PATHS);
    const origin = origins[builderVehicles.length % origins.length];
    
    const nextVeh = {
      id: `${prefix}-${100 + count * 7}`,
      type,
      priority: 85,
      distance: 2.5,
      eta: 90,
      livesAtRisk: 2,
      emergencyType: type === 'ambulance' ? 'Stroke' : type === 'fire_engine' ? 'Major Fire' : 'Police Escort',
      origin,
      dispatchTime: new Date().toISOString()
    };
    
    setBuilderVehicles([...builderVehicles, nextVeh]);
  };

  const handleRemoveCustomVehicle = (index) => {
    if (builderVehicles.length <= 2) return; // keep at least 2
    const copy = [...builderVehicles];
    copy.splice(index, 1);
    setBuilderVehicles(copy);
  };

  const handleUpdateCustomVehicle = (index, field, value) => {
    const copy = [...builderVehicles];
    
    if (field === 'type') {
      const prefix = value === 'ambulance' ? 'AMB' : value === 'fire_engine' ? 'FIRE' : 'POLICE';
      copy[index].id = `${prefix}-${copy[index].id.split('-')[1] || '999'}`;
      copy[index].emergencyType = value === 'ambulance' ? 'Cardiac Arrest' : value === 'fire_engine' ? 'Major Fire' : 'Police Escort';
    }
    
    copy[index][field] = value;
    setBuilderVehicles(copy);
  };

  const handleGenerateCustomConflict = () => {
    setSelectedScenario({ id: 'Custom', name: 'Custom Conflict Scenario', description: 'User-configured scenario' });
    setVehicles(builderVehicles);
    setIsPlaying(false);
    setSimTime(0);
    setLogs([]);
    setWinnerInfo(null);
  };

  // Interpolated tracking vehicles state for Leaflet
  const trackingVehiclesOnMap = useMemo(() => {
    return vehicles.map(vehicle => {
      const pathData = routes[vehicle.id] || PREDEFINED_PATHS[vehicle.origin];
      if (!pathData || !pathData.part1) return null;

      const eta = vehicle.eta;
      const releaseTime = simData.releaseTimes[vehicle.id] || eta;
      const exitDuration = 15; // 15 seconds to travel Part 2 path

      let position = pathData.part1[0] || JB_CIRCLE;
      let stage = 'before_junction';
      let progress = 0;
      let signalStatus = 'red';

      // Stage 1: Moving towards junction
      if (simTime < eta) {
        progress = simTime / eta;
        position = interpolatePath(pathData.part1, progress);
        stage = 'en_route';
        signalStatus = 'red';
      } 
      // Stage 2: Reached junction, waiting to be released
      else if (simTime >= eta && simTime < releaseTime) {
        progress = 0.98; // hold just before circle
        position = interpolatePath(pathData.part1, progress);
        stage = 'held';
        signalStatus = 'red';
      } 
      // Stage 3: Released, traveling past junction
      else {
        progress = Math.min(1, (simTime - releaseTime) / exitDuration);
        position = interpolatePath(pathData.part2, progress);
        stage = progress < 1 ? 'crossing' : 'arrived';
        signalStatus = progress < 1 ? 'green' : 'normal';
      }

      // Dynamic remaining calculations for info cards
      const remainingEta = Math.max(0, eta - simTime);
      const remainingDistance = stage === 'en_route' 
        ? Math.max(0, vehicle.distance * (1 - simTime / eta)) 
        : 0;

      return {
        ...vehicle,
        position,
        stage,
        progress,
        signalStatus,
        remainingEta,
        remainingDistance
      };
    }).filter(Boolean);
  }, [vehicles, simTime, simData, routes]);

  // Find junction signal status
  const circleSignalStatus = useMemo(() => {
    const activeCrossing = trackingVehiclesOnMap.find(v => v.stage === 'crossing');
    if (activeCrossing) {
      return {
        winnerId: activeCrossing.id,
        status: 'active_override',
        type: activeCrossing.type
      };
    }
    return { winnerId: null, status: 'normal', type: null };
  }, [trackingVehiclesOnMap]);

  const winnerCrossing = useMemo(() => {
    return trackingVehiclesOnMap.some(v => v.stage === 'crossing');
  }, [trackingVehiclesOnMap]);

  const timelineEndRef = useRef(null);

  const decisionSteps = useMemo(() => {
    return getDecisionTreeTimeline(vehicles);
  }, [vehicles]);

  const confidenceScore = useMemo(() => {
    if (vehicles.length === 0) return 0;
    const winningStepIndex = decisionSteps.findIndex(s => s.status === 'winner');
    if (winningStepIndex === -1) return 100;
    const confWeights = [98, 92, 86, 82, 78, 70];
    return confWeights[winningStepIndex] || 95;
  }, [vehicles, decisionSteps]);

  const riskStats = useMemo(() => {
    if (vehicles.length === 0) return { level: 'LOW', color: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5', etaDiff: 'N/A' };
    const sorted = [...vehicles].sort((a, b) => a.eta - b.eta);
    let etaDiff = 'N/A';
    let minEtaDiff = 999;
    
    if (sorted.length >= 2) {
      minEtaDiff = Math.abs(sorted[0].eta - sorted[1].eta);
      etaDiff = `${minEtaDiff}s`;
    }
    
    let level = 'LOW';
    let color = 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5';
    let glow = 'glow-green';
    
    if (vehicles.length >= 4 || minEtaDiff < 5) {
      level = 'CRITICAL';
      color = 'text-red-400 border-red-500/20 bg-red-500/5 border-red-500/40 bg-red-500/10 glow-red-pulse';
      glow = 'glow-red';
    } else if (vehicles.length === 3 || minEtaDiff < 15) {
      level = 'HIGH';
      color = 'text-orange-400 border-orange-500/20 bg-orange-500/5 border-orange-500/40 bg-orange-500/10';
      glow = 'glow-warning';
    } else if (vehicles.length === 2 || minEtaDiff < 30) {
      level = 'MEDIUM';
      color = 'text-yellow-400 border-yellow-500/20 bg-yellow-500/5 border-yellow-500/40 bg-yellow-500/10';
      glow = 'glow-warning';
    }
    
    return { level, color, glow, etaDiff, rawDiff: minEtaDiff };
  }, [vehicles]);

  const signalOverrideState = useMemo(() => {
    if (!isPlaying || simTime === 0) return { status: 'NORMAL', text: 'NORMAL CYCLE', color: 'text-gray-400 bg-gray-500/10 border-gray-500/20', sub: 'JNB-01 running standard loops' };
    
    const winner = simData.sorted[0];
    if (!winner) return { status: 'NORMAL', text: 'NORMAL CYCLE', color: 'text-gray-400 bg-gray-500/10 border-gray-500/20', sub: 'JNB-01 running standard loops' };
    
    if (simTime < winner.eta - 5) {
      return { 
        status: 'NORMAL', 
        text: 'NORMAL CYCLE', 
        color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
        sub: 'JNB-01 running standard loops' 
      };
    } else if (simTime >= winner.eta - 5 && simTime < winner.eta) {
      return { 
        status: 'OVERRIDE', 
        text: 'PREEMPTION ACTIVE', 
        color: 'text-amber-400 bg-amber-500/10 border-amber-500/20 animate-pulse font-bold',
        sub: `Clearing junction for ${winner.id}` 
      };
    } else if (simTime >= winner.eta && simTime < (simData.releaseTimes[winner.id] || winner.eta + 12)) {
      return { 
        status: 'ACTIVE', 
        text: 'GREEN CORRIDOR ACTIVE', 
        color: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30 glow-green-pulse font-bold',
        sub: `Corridor locked for ${winner.id}` 
      };
    } else {
      return { 
        status: 'NORMAL', 
        text: 'NORMAL CYCLE', 
        color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
        sub: 'Junction cleared, cycle restored' 
      };
    }
  }, [isPlaying, simTime, simData]);

  const timelineEvents = useMemo(() => {
    const list = [];
    if (vehicles.length === 0) return [];
    
    list.push({ time: 0, text: '🚨 Conflict Detected at Jnana Bharathi Circle' });
    list.push({ time: 0.5, text: `🚗 ${vehicles.length} emergency vehicles converging` });
    
    let winnerFound = false;
    decisionSteps.forEach((step, index) => {
      const startTime = index * 2.0;
      
      if (winnerFound) return;
      
      if (step.status === 'tie') {
        list.push({ time: startTime + 0.5, text: `🧠 AI Engine: Analyzing ${step.name}...` });
        list.push({ time: startTime + 1.8, text: `⚠ Tie on ${step.name} (${step.valuesDisplay})` });
      } else if (step.status === 'winner') {
        list.push({ time: startTime + 0.5, text: `🧠 AI Engine: Analyzing ${step.name}...` });
        list.push({ time: startTime + 1.8, text: `🏆 Winner Selected via ${step.name}: ${step.winner}` });
        winnerFound = true;
        
        list.push({ time: startTime + 2.5, text: `🚦 Signal JNB-01 overridden to GREEN CORRIDOR` });
        list.push({ time: startTime + 3.0, text: `⚡ Green Corridor locked for ${step.winner}` });
      }
    });

    const winner = simData.sorted[0];
    if (winner) {
      list.push({ time: winner.eta, text: `🏁 Winner ${winner.id} reached Junction` });
      list.push({ time: winner.eta + 4, text: `✅ Junction cleared by ${winner.id}` });
      list.push({ time: winner.eta + 8, text: `🚦 Signal JNB-01 returned to standard cycles` });
    }
    
    return list.sort((a, b) => a.time - b.time);
  }, [vehicles, decisionSteps, simData]);

  const activeTimeline = useMemo(() => {
    return timelineEvents.filter(e => simTime >= e.time);
  }, [timelineEvents, simTime]);

  const getStepStatusAtTime = useCallback((step, index) => {
    if (simTime === 0) return { status: 'pending', details: 'Waiting...' };

    for (let i = 0; i < index; i++) {
      if (decisionSteps[i] && decisionSteps[i].status === 'winner') {
        return { status: 'skipped', details: 'Skipped' };
      }
    }

    const stepStart = index * 2.0;
    const stepDuration = 2.0;
    const stepEnd = stepStart + stepDuration;

    if (simTime < stepStart) {
      return { status: 'pending', details: 'Pending...' };
    } else if (simTime >= stepStart && simTime < stepEnd) {
      return { 
        status: 'active', 
        details: 'Evaluating...', 
        valuesDisplay: step.valuesDisplay,
        candidates: step.candidates 
      };
    } else {
      return { 
        status: step.status,
        details: step.details,
        valuesDisplay: step.valuesDisplay,
        winner: step.winner,
        candidates: step.candidates
      };
    }
  }, [simTime, decisionSteps]);

  // Auto-scroll timeline to bottom
  useEffect(() => {
    if (timelineEndRef.current) {
      timelineEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeTimeline.length]);

  const winningStepName = useMemo(() => {
    const winningStep = decisionSteps.find(s => s.status === 'winner');
    return winningStep ? winningStep.name : 'Priority';
  }, [decisionSteps]);

  const sharedCoordinates = useMemo(() => {
    const firstVeh = vehicles[0];
    if (!firstVeh) return null;
    const pathData = routes[firstVeh.id] || PREDEFINED_PATHS[firstVeh.origin];
    return pathData?.part2;
  }, [vehicles, routes]);

  return (
    <div className="flex flex-col gap-4 sm:gap-6 min-h-0">
      <style>{`
        @keyframes radarPulse {
          0% { transform: scale(0.5); opacity: 1; }
          100% { transform: scale(2.8); opacity: 0; }
        }
        @keyframes glowPulse {
          0%, 100% { box-shadow: 0 0 15px rgba(239, 68, 68, 0.4); border-color: rgba(239, 68, 68, 0.6); }
          50% { box-shadow: 0 0 35px rgba(239, 68, 68, 0.85); border-color: rgba(239, 68, 68, 1); }
        }
        @keyframes glowPulseGreen {
          0%, 100% { box-shadow: 0 0 15px rgba(16, 185, 129, 0.4); border-color: rgba(16, 185, 129, 0.6); }
          50% { box-shadow: 0 0 35px rgba(16, 185, 129, 0.85); border-color: rgba(16, 185, 129, 1); }
        }
        .glow-red-pulse {
          animation: glowPulse 2s infinite ease-in-out;
        }
        .glow-green-pulse {
          animation: glowPulseGreen 2s infinite ease-in-out;
        }
        .custom-leaflet-icon-vehicle, .custom-leaflet-icon-junction {
          overflow: visible !important;
        }
        .shared-route-glow {
          filter: drop-shadow(0 0 4px rgba(168, 85, 247, 0.6));
        }
      `}</style>

      {/* STAT CARDS ROW */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4 shrink-0">
        
        {/* CARD 1: LOCATION & SPEED */}
        <div className="stat-card flex-col items-start justify-between border-red-500/10 relative overflow-hidden">
          <span className="text-[9px] uppercase text-gray-400 block font-bold tracking-wider">Simulation Location</span>
          <div className="mt-1 flex flex-col">
            <span className="text-xs font-black text-red-400 truncate">Jnana Bharathi Circle</span>
            <span className="text-[9px] text-gray-500 uppercase tracking-wider font-bold">Bengaluru (6-Way)</span>
          </div>
          <div className="mt-2 flex gap-1 items-center border-t border-white/5 pt-1.5 w-full">
            <span className="text-[8px] text-gray-400 uppercase font-bold mr-1">Speed:</span>
            {[1, 2, 5].map(speed => (
              <button
                key={speed}
                onClick={() => setSimSpeed(speed)}
                className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${simSpeed === speed ? 'bg-emerald-600 text-white shadow' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>

        {/* CARD 2: CONFLICT RISK METER */}
        <div className={`stat-card flex-col items-start justify-between border-white/5 relative ${riskStats.glow} transition-all duration-500`}>
          <span className="text-[9px] uppercase text-gray-400 block font-bold tracking-wider">Conflict Risk</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className={`text-base font-black uppercase ${riskStats.color.split(' ')[0]}`}>{riskStats.level}</span>
          </div>
          <div className="mt-2 flex justify-between text-[8px] text-gray-500 border-t border-white/5 pt-1.5 w-full font-bold">
            <span>Vehicles: {vehicles.length}</span>
            <span>ETA Diff: {riskStats.etaDiff}</span>
          </div>
        </div>

        {/* CARD 3: AI CONFIDENCE SCORE */}
        <div className="stat-card justify-between items-center border-emerald-500/10 min-h-[72px] flex">
          <div className="flex flex-col items-start justify-between h-full">
            <span className="text-[9px] uppercase text-gray-400 block font-bold tracking-wider">AI Confidence</span>
            <span className="text-[10px] font-black text-emerald-400 uppercase mt-1 truncate max-w-[100px]">
              {simData.sorted[0] ? `Winner: ${simData.sorted[0].id.split('-')[1] || simData.sorted[0].id}` : 'Calculating...'}
            </span>
          </div>
          <div className="relative flex items-center justify-center shrink-0">
            <svg className="w-10 h-10 transform -rotate-90">
              <circle cx="20" cy="20" r="16" stroke="rgba(255,255,255,0.05)" strokeWidth="3" fill="transparent" />
              <circle cx="20" cy="20" r="16" stroke="#10b981" strokeWidth="3" fill="transparent"
                strokeDasharray="100.5" strokeDashoffset={100.5 - (100.5 * (vehicles.length > 0 ? confidenceScore : 0)) / 100} strokeLinecap="round" className="transition-all duration-1000 ease-out" />
            </svg>
            <span className="absolute text-[8px] font-black text-white">{vehicles.length > 0 ? `${confidenceScore}%` : '0%'}</span>
          </div>
        </div>

        {/* CARD 4: SIGNAL OVERRIDE STATE */}
        <div className={`stat-card flex-col items-start justify-between border-white/5 transition-all duration-500 ${signalOverrideState.status === 'ACTIVE' ? 'glow-green' : signalOverrideState.status === 'OVERRIDE' ? 'glow-warning' : ''}`}>
          <span className="text-[9px] uppercase text-gray-400 block font-bold tracking-wider">Junction Signal JNB-01</span>
          <div className="mt-1 flex items-baseline gap-1">
            <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded tracking-wide ${signalOverrideState.color}`}>
              {signalOverrideState.text}
            </span>
          </div>
          <span className="text-[8px] text-gray-500 font-bold block mt-1.5 truncate w-full">{signalOverrideState.sub || 'Cycle running normally'}</span>
        </div>

        {/* CARD 5: BENGALURU CONTEXT */}
        <div className="stat-card flex-col items-start justify-between border-emerald-500/10">
          <span className="text-[9px] uppercase text-gray-400 block font-bold tracking-wider">Bengaluru Context</span>
          <div className="mt-1 flex flex-col gap-0.5 w-full text-[9px] font-bold text-gray-400 leading-none">
            <div className="flex justify-between">
              <span>Traffic Density:</span>
              <span className="text-red-400">HIGH</span>
            </div>
            <div className="flex justify-between mt-1">
              <span>Nearby Fleet:</span>
              <span className="text-white">128</span>
            </div>
            <div className="flex justify-between mt-1">
              <span>Peak Sim Time:</span>
              <span className="text-white">18:30</span>
            </div>
          </div>
        </div>

      </div>

      {/* CORE GRID */}
      <div className="content-grid">
        
        {/* LEFT COLUMN: SCENARIOS, CONTROLS, BUILDER */}
        <div className="lg:col-span-4 flex flex-col gap-4 sm:gap-6 min-h-0 lg:overflow-y-auto lg:h-full pr-1 pb-6">
          
          {/* Predefined Scenarios Card */}
          <div className="panel p-4 sm:p-5 flex flex-col shrink-0">
            <h3 className="panel-header mb-3">
              <Siren size={16} className="text-red-400 animate-pulse" /> Predefined Scenarios
            </h3>
            <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
              {PREDEFINED_SCENARIOS.map(sc => (
                <button
                  key={sc.id}
                  onClick={() => handleSelectScenario(sc)}
                  className={`p-2.5 text-left rounded-xl border text-[10px] transition duration-200 ${selectedScenario.id === sc.id ? 'bg-red-500/10 border-red-500/30' : 'bg-white/5 border-white/5 hover:border-white/10'}`}
                >
                  <strong className="block text-white font-bold mb-0.5 truncate">{sc.name.split(': ')[1]}</strong>
                  <span className="text-gray-400 text-[9px] line-clamp-2 leading-tight">{sc.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Simulation Controls Card */}
          <div className="panel p-4 sm:p-5 flex flex-col shrink-0">
            <h3 className="panel-header mb-3">
              <FastForward size={16} className="text-emerald-400" /> Simulation Playback
            </h3>
            
            <div className="flex justify-between items-center mb-2">
              <span className="text-[10px] text-gray-400 uppercase font-black tracking-wider">
                Simulated Clock
              </span>
              <strong className="font-mono text-sm text-emerald-400">
                {simTime.toFixed(1)}s
              </strong>
            </div>
            
            <div className="flex gap-2">
              {!isPlaying ? (
                <button
                  onClick={() => setIsPlaying(true)}
                  disabled={loadingRoutes}
                  className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition text-xs font-bold text-white flex items-center justify-center gap-1.5 shadow active:scale-[0.98]"
                >
                  <Play size={14} /> Start
                </button>
              ) : (
                <button
                  onClick={() => setIsPlaying(false)}
                  className="flex-1 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 transition text-xs font-bold text-white flex items-center justify-center gap-1.5 shadow active:scale-[0.98]"
                >
                  <Pause size={14} /> Pause
                </button>
              )}
              
              <button
                onClick={() => {
                  setSimTime(0);
                  setIsPlaying(false);
                  setWinnerInfo(null);
                }}
                className="py-2 px-3 rounded-xl bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition text-xs font-bold flex items-center justify-center gap-1 active:scale-[0.98]"
                title="Reset Simulation"
              >
                <RotateCcw size={14} /> Reset
              </button>
            </div>
          </div>

          {/* AI Conflict Resolution Engine */}
          <div className="panel p-4 sm:p-5 flex flex-col gap-4">
            <h3 className="panel-header mb-0">
              <Activity size={16} className="text-emerald-400 animate-pulse" /> AI Conflict Resolution Engine
            </h3>
            
            {/* Decision Tree vertical flow */}
            <div className="relative pl-6 space-y-4 py-2 border-l-2 border-white/5 ml-2 transition-all">
              {decisionSteps.map((step, idx) => {
                const stepState = getStepStatusAtTime(step, idx);
                
                let cardColor = 'bg-white/[0.01] border-white/5 text-gray-500';
                let iconColor = 'text-gray-600';
                let pulseRing = '';
                
                if (stepState.status === 'active') {
                  cardColor = 'bg-blue-500/[0.03] border-blue-500/30 text-blue-300';
                  iconColor = 'text-blue-400 animate-pulse';
                  pulseRing = 'ring-2 ring-blue-500/30 animate-pulse';
                } else if (stepState.status === 'tie') {
                  cardColor = 'bg-amber-500/[0.03] border-amber-500/20 text-amber-300';
                  iconColor = 'text-amber-400';
                } else if (stepState.status === 'winner') {
                  cardColor = 'bg-emerald-500/[0.04] border-emerald-500/35 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.05)]';
                  iconColor = 'text-emerald-400';
                  pulseRing = 'ring-2 ring-emerald-500/30';
                } else if (stepState.status === 'skipped') {
                  cardColor = 'opacity-40 bg-transparent border-transparent text-gray-600';
                  iconColor = 'text-gray-700';
                }
                
                const StepIcon = [Shield, MapPin, Clock, Users, Siren, Activity][idx] || Shield;

                return (
                  <div key={idx} className={`relative p-2.5 rounded-xl border text-[10px] transition-all duration-500 ${cardColor}`}>
                    
                    {/* Circle Node on Vertical Line */}
                    <div className={`absolute -left-[33px] top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-slate-950 border-2 flex items-center justify-center transition-all duration-500 ${stepState.status === 'active' ? 'border-blue-500' : stepState.status === 'winner' ? 'border-emerald-500' : stepState.status === 'tie' ? 'border-amber-500' : 'border-white/10'} ${pulseRing}`}>
                      {stepState.status === 'winner' ? (
                        <Check size={8} className="text-emerald-400" />
                      ) : (
                        <div className={`w-1 h-1 rounded-full ${stepState.status === 'active' ? 'bg-blue-500' : stepState.status === 'tie' ? 'bg-amber-500' : 'bg-white/10'}`}></div>
                      )}
                    </div>

                    <div className="flex justify-between items-center font-bold">
                      <div className="flex items-center gap-1.5">
                        <StepIcon size={12} className={iconColor} />
                        <span className="uppercase tracking-wider text-[9px]">{step.name}</span>
                      </div>
                      
                      {stepState.status === 'active' && (
                        <span className="text-[8px] bg-blue-500/10 border border-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded animate-pulse">EVALUATING</span>
                      )}
                      {stepState.status === 'tie' && (
                        <span className="text-[8px] bg-amber-500/10 border border-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-bold">⚠ TIE</span>
                      )}
                      {stepState.status === 'winner' && (
                        <span className="text-[8px] bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 px-1.5 py-0.5 rounded font-black">🏆 WINNER SELECTED</span>
                      )}
                      {stepState.status === 'pending' && (
                        <span className="text-[8px] text-gray-600 uppercase">PENDING</span>
                      )}
                      {stepState.status === 'skipped' && (
                        <span className="text-[8px] text-gray-700 uppercase">SKIPPED</span>
                      )}
                    </div>

                    {stepState.status !== 'pending' && stepState.status !== 'skipped' && stepState.valuesDisplay && (
                      <div className="mt-2 text-[9px] text-gray-400 font-mono border-t border-white/5 pt-1.5 flex justify-between items-center">
                        <span>Comparison:</span>
                        <span className="text-white font-bold text-right truncate max-w-[150px]">{stepState.valuesDisplay}</span>
                      </div>
                    )}
                    
                    {stepState.status === 'winner' && stepState.winner && (
                      <div className="mt-1 text-[9px] text-emerald-400 font-mono flex justify-between items-center">
                        <span>AI Allocated corridor:</span>
                        <span className="font-black bg-emerald-500/10 px-1.5 py-0.5 rounded">{stepState.winner}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Micro Debug Console log below the flow chart */}
            <div className="bg-black/60 rounded-xl p-2.5 border border-white/5 font-mono text-[9px] text-emerald-400 overflow-y-auto h-24 space-y-0.5 scrollbar-thin">
              <div className="text-[8px] text-gray-500 font-bold uppercase border-b border-white/5 pb-1 mb-1 tracking-wider">Engine Process Logs</div>
              {logs.length === 0 ? (
                <div className="text-gray-600 italic">Waiting for simulation launch...</div>
              ) : (
                logs.map((log, index) => {
                  let logColor = 'text-emerald-400';
                  if (log.includes('🚨') || log.includes('wins') || log.includes('winner:')) {
                    logColor = 'text-yellow-300 font-bold';
                  } else if (log.includes('✅')) {
                    logColor = 'text-emerald-400 font-bold';
                  } else if (log.includes('tie')) {
                    logColor = 'text-gray-400';
                  }
                  return (
                    <div key={index} className={`leading-tight whitespace-pre-wrap ${logColor}`}>
                      {log}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Custom Scenario Builder Card */}
          <div className="panel p-4 sm:p-5 flex flex-col shrink-0">
            <h3 className="panel-header mb-3">
              <Plus size={16} className="text-blue-400" /> Custom Scenario Builder
            </h3>
            
            <div className="space-y-3.5 max-h-60 overflow-y-auto pr-1">
              {builderVehicles.map((veh, index) => (
                <div key={index} className="p-3 rounded-xl bg-white/[0.03] border border-white/5 space-y-2 relative">
                  
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                      Vehicle #{index + 1}: {veh.id}
                    </span>
                    {builderVehicles.length > 2 && (
                      <button
                        onClick={() => handleRemoveCustomVehicle(index)}
                        className="text-gray-500 hover:text-red-400 transition"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[8px] text-gray-500 uppercase font-black mb-1">Type</label>
                      <select
                        value={veh.type}
                        onChange={(e) => handleUpdateCustomVehicle(index, 'type', e.target.value)}
                        className="w-full text-[10px] bg-slate-950 border border-white/10 text-white rounded-lg px-1.5 py-1 focus:outline-none focus:border-blue-500"
                      >
                        <option value="ambulance">Ambulance</option>
                        <option value="fire_engine">Fire Engine</option>
                        <option value="police">Police Car</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[8px] text-gray-500 uppercase font-black mb-1">Origin Road</label>
                      <select
                        value={veh.origin}
                        onChange={(e) => handleUpdateCustomVehicle(index, 'origin', e.target.value)}
                        className="w-full text-[10px] bg-slate-950 border border-white/10 text-white rounded-lg px-1.5 py-1 focus:outline-none focus:border-blue-500"
                      >
                        {Object.keys(PREDEFINED_PATHS).map(road => (
                          <option key={road} value={road}>{road}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5">
                    <div>
                      <label className="block text-[8px] text-gray-500 uppercase font-black mb-1">Priority</label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={veh.priority}
                        onChange={(e) => handleUpdateCustomVehicle(index, 'priority', parseInt(e.target.value) || 1)}
                        className="w-full text-[10px] bg-slate-950 border border-white/10 text-white rounded-lg px-1 py-1 focus:outline-none focus:border-blue-500 text-center"
                      />
                    </div>
                    <div>
                      <label className="block text-[8px] text-gray-500 uppercase font-black mb-1">Dist (km)</label>
                      <input
                        type="number"
                        min="0.1"
                        max="10"
                        step="0.1"
                        value={veh.distance}
                        onChange={(e) => handleUpdateCustomVehicle(index, 'distance', parseFloat(e.target.value) || 0.1)}
                        className="w-full text-[10px] bg-slate-950 border border-white/10 text-white rounded-lg px-1 py-1 focus:outline-none focus:border-blue-500 text-center"
                      />
                    </div>
                    <div>
                      <label className="block text-[8px] text-gray-500 uppercase font-black mb-1">ETA (s)</label>
                      <input
                        type="number"
                        min="5"
                        max="300"
                        value={veh.eta}
                        onChange={(e) => handleUpdateCustomVehicle(index, 'eta', parseInt(e.target.value) || 5)}
                        className="w-full text-[10px] bg-slate-950 border border-white/10 text-white rounded-lg px-1 py-1 focus:outline-none focus:border-blue-500 text-center"
                      />
                    </div>
                    <div>
                      <label className="block text-[8px] text-gray-500 uppercase font-black mb-1">Lives</label>
                      <input
                        type="number"
                        min="0"
                        max="50"
                        value={veh.livesAtRisk}
                        onChange={(e) => handleUpdateCustomVehicle(index, 'livesAtRisk', parseInt(e.target.value) || 0)}
                        className="w-full text-[10px] bg-slate-950 border border-white/10 text-white rounded-lg px-1 py-1 focus:outline-none focus:border-blue-500 text-center"
                      />
                    </div>
                  </div>
                  
                </div>
              ))}
            </div>

            <div className="flex gap-2 mt-4 pt-3 border-t border-white/5">
              <button
                type="button"
                onClick={handleAddCustomVehicle}
                disabled={builderVehicles.length >= 5}
                className="flex-1 py-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-[10px] font-bold text-gray-300 disabled:opacity-50 transition active:scale-95"
              >
                + Add Vehicle
              </button>
              
              <button
                type="button"
                onClick={handleGenerateCustomConflict}
                className="flex-1 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-[10px] font-bold text-white shadow transition active:scale-95"
              >
                Generate Conflict
              </button>
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: MAP AND SUMMARY */}
        <div className="lg:col-span-8 flex flex-col gap-4 sm:gap-6 min-h-[400px] lg:h-full lg:overflow-y-auto pr-1 pb-6">
          
          {/* Leaflet Map panel */}
          <div className="flex-1 relative rounded-2xl overflow-hidden border border-white/10 shadow-inner min-h-[350px]">
            <MapContainer
              center={JB_CIRCLE}
              zoom={14}
              style={{ width: '100%', height: '100%' }}
              className="z-0"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              />

              <MapFocusController />

              {/* Enhanced conflict junction: Pulsing Red Marker with radar rings and HUD */}
              <Marker
                position={JB_CIRCLE}
                icon={createJunctionIcon(vehicles.length, riskStats.level, winnerCrossing)}
                zIndexOffset={3000}
              />

              {/* Draw incoming paths (part1) for converging vehicles */}
              {vehicles.map((veh, idx) => {
                const pathData = routes[veh.id] || PREDEFINED_PATHS[veh.origin];
                if (!pathData || !pathData.part1) return null;
                
                const color = [ '#3b82f6', '#ef4444', '#f97316', '#14b8a6', '#a855f7' ][idx % 5];

                return (
                  <React.Fragment key={`route-incoming-${veh.id}`}>
                    <Polyline
                      positions={pathData.part1}
                      pathOptions={{
                        color,
                        weight: 4,
                        opacity: 0.75,
                        dashArray: '4, 8'
                      }}
                    />
                  </React.Fragment>
                );
              })}

              {/* Shared route segment (part2) in glowing purple neon */}
              {sharedCoordinates && (
                <>
                  <Polyline
                    positions={sharedCoordinates}
                    pathOptions={{
                      color: '#a855f7',
                      weight: 8,
                      opacity: 0.35,
                      lineJoin: 'round',
                      lineCap: 'round',
                      className: 'shared-route-glow'
                    }}
                  />
                  <Polyline
                    positions={sharedCoordinates}
                    pathOptions={{
                      color: '#e9d5ff',
                      weight: 3.5,
                      opacity: 0.95,
                      lineJoin: 'round',
                      lineCap: 'round'
                    }}
                  />
                </>
              )}

              {/* Draw active moving vehicle markers */}
              {trackingVehiclesOnMap.map(veh => {
                const isWinner = simData.sorted.length > 0 && simData.sorted[0].id === veh.id;
                const pathData = routes[veh.id] || PREDEFINED_PATHS[veh.origin];
                const activePath = veh.stage === 'crossing' && pathData ? pathData.part2 : null;
                
                return (
                  <React.Fragment key={`marker-${veh.id}`}>
                    <Marker
                      position={veh.position}
                      icon={createVehicleIcon(
                        veh.type, 
                        veh.id, 
                        veh.priority, 
                        veh.remainingEta.toFixed(0), 
                        veh.remainingDistance.toFixed(1), 
                        isWinner, 
                        veh.signalStatus
                      )}
                      zIndexOffset={isWinner ? 2000 : 1000}
                    />
                    
                    {activePath && (
                      <Polyline
                        positions={activePath}
                        pathOptions={{
                          color: '#10b981',
                          weight: 8,
                          opacity: 0.65,
                          lineJoin: 'round'
                        }}
                      />
                    )}
                  </React.Fragment>
                );
              })}

            </MapContainer>
            
            {/* Loading routes spinner overlay */}
            {loadingRoutes && (
              <div className="absolute inset-0 bg-[#090d16]/70 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center gap-3 text-white">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                <span className="text-xs font-black tracking-wider uppercase text-blue-400">
                  Fetching real OpenStreetMap road routes...
                </span>
              </div>
            )}

            {/* Map Legends Overlay */}
            <div className="absolute bottom-4 left-4 glass-panel px-3 py-2.5 rounded-xl border border-white/10 z-10 text-[9px] space-y-1.5 max-w-[150px] pointer-events-none text-gray-300">
              <h5 className="font-bold text-white text-[10px] mb-1">Route Legend</h5>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-blue-500 block border border-white/10"></span>
                <span>Vehicle A Route</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500 block border border-white/10"></span>
                <span>Vehicle B Route</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-orange-500 block border border-white/10"></span>
                <span>Vehicle C Route</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-purple-500 block border border-white/10"></span>
                <span>Shared Route Segment</span>
              </div>
              <div className="flex items-center gap-2 border-t border-white/5 pt-1.5">
                <span className="w-3 h-3 bg-red-600 rounded-full animate-pulse block"></span>
                <span className="font-bold text-red-400">Conflict Junction</span>
              </div>
            </div>
          </div>

          {/* Sub-grid: Vehicle ranking & Live Event Timeline */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 shrink-0">
            
            {/* Vehicle Ranking Table */}
            <div className="panel p-4 sm:p-5 flex flex-col h-[220px]">
              <h3 className="panel-header mb-3">
                <Activity size={14} className="text-blue-400" /> Conflict Priority Ranking
              </h3>
              <div className="flex-1 overflow-y-auto rounded-xl border border-white/5 scrollbar-thin min-h-0">
                <table className="min-w-full text-left text-[9px] font-mono leading-none">
                  <thead className="bg-white/[0.03] text-[8px] uppercase tracking-wider text-gray-400 sticky top-0 z-10">
                    <tr>
                      <th className="px-2.5 py-2 font-bold">Rank</th>
                      <th className="px-2.5 py-2 font-bold">Vehicle</th>
                      <th className="px-2.5 py-2 font-bold">Priority</th>
                      <th className="px-2.5 py-2 font-bold">ETA</th>
                      <th className="px-2.5 py-2 font-bold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-bold">
                    {simData.sorted.map((veh, idx) => {
                      const isWinner = idx === 0;
                      const hasCleared = simTime >= (simData.releaseTimes[veh.id] || veh.eta + 12);
                      const isCrossing = simTime >= veh.eta && simTime < (simData.releaseTimes[veh.id] || veh.eta + 12);
                      
                      let statusText = 'WAITING';
                      let statusColor = 'text-gray-400';
                      
                      if (isWinner) {
                        if (hasCleared) {
                          statusText = 'CLEARED';
                          statusColor = 'text-emerald-400 font-bold';
                        } else if (isCrossing) {
                          statusText = 'CROSSING';
                          statusColor = 'text-emerald-400 animate-pulse font-black';
                        } else {
                          statusText = 'WINNER';
                          statusColor = 'text-emerald-400 font-black';
                        }
                      } else {
                        if (hasCleared) {
                          statusText = 'RELEASED';
                          statusColor = 'text-blue-400';
                        } else if (isCrossing) {
                          statusText = 'PREEMPT';
                          statusColor = 'text-amber-400 font-bold';
                        }
                      }
                      
                      return (
                        <tr key={veh.id} className={`transition-all ${isWinner ? 'bg-emerald-500/5 hover:bg-emerald-500/10 font-bold text-white border-y border-emerald-500/20' : 'hover:bg-white/[0.01] text-gray-300'}`}>
                          <td className="px-2.5 py-2.5 flex items-center gap-1">
                            {isWinner ? '🥇' : `${idx + 1}`}
                          </td>
                          <td className="px-2.5 py-2.5 text-white">{veh.id}</td>
                          <td className="px-2.5 py-2.5">{veh.priority}</td>
                          <td className="px-2.5 py-2.5">{veh.eta}s</td>
                          <td className={`px-2.5 py-2.5 ${statusColor}`}>{statusText}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Live Event Timeline */}
            <div className="panel p-4 sm:p-5 flex flex-col h-[220px]">
              <h3 className="panel-header mb-3">
                <Clock size={14} className="text-blue-400 animate-pulse" /> Live Event Timeline
              </h3>
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0 scrollbar-thin text-[9px] font-mono leading-tight">
                {activeTimeline.length === 0 ? (
                  <div className="text-gray-600 italic py-8 text-center">Simulation timeline inactive...</div>
                ) : (
                  activeTimeline.map((evt, index) => (
                    <div key={index} className="flex gap-2 items-start border-l border-white/10 pl-2 ml-1 relative">
                      <div className="absolute -left-[4px] top-1.5 w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                      <span className="text-gray-500 shrink-0 select-none">[+{(evt.time).toFixed(1)}s]</span>
                      <span className={`${evt.text.includes('🚨') || evt.text.includes('🏆') ? 'text-white font-bold' : 'text-gray-300'}`}>
                        {evt.text}
                      </span>
                    </div>
                  ))
                )}
                <div ref={timelineEndRef} />
              </div>
            </div>

          </div>

          {/* Enhanced End Result Screen Summary Card */}
          {winnerInfo && (
            <div className="panel p-5 border-emerald-500/30 bg-emerald-950/10 shadow-[0_0_30px_rgba(16,185,129,0.08)] shrink-0 transition-all duration-700 transform scale-100 opacity-100 animate-in fade-in zoom-in-95">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-4 pb-3 border-b border-emerald-500/10">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-emerald-500/10 rounded-lg border border-emerald-500/30 animate-pulse">
                    <ShieldCheck size={18} className="text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black uppercase text-emerald-400 tracking-wider">AI CONFLICT RESOLUTION SUCCESS</h3>
                    <p className="text-[8px] text-gray-500 uppercase tracking-widest font-black mt-0.5">Green corridor locked & signals overridden</p>
                  </div>
                </div>
                
                {/* REPLAY CONTROLS */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setSimTime(0);
                      setIsPlaying(true);
                    }}
                    className="px-3 py-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-[10px] font-bold uppercase transition flex items-center gap-1 active:scale-95"
                  >
                    <RotateCcw size={12} /> Replay
                  </button>
                  <button
                    onClick={() => {
                      setSimTime(0);
                      setIsPlaying(false);
                      setWinnerInfo(null);
                    }}
                    className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-gray-300 text-[10px] font-bold uppercase transition flex items-center gap-1 active:scale-95"
                  >
                    Restart
                  </button>
                  <button
                    onClick={() => {
                      alert("📸 Exporting high-resolution PDF report & screenshot...\nDownloaded report: JNB_Conflict_Report_" + selectedScenario.id + ".pdf");
                    }}
                    className="px-3 py-1.5 rounded-lg border border-blue-500/20 bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 text-[10px] font-bold uppercase transition flex items-center gap-1 active:scale-95"
                  >
                    Export Report
                  </button>
                </div>
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="text-left">
                  <span className="text-[8px] uppercase text-gray-500 block font-black tracking-wider mb-0.5">Winner Vehicle</span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs">🚑</span>
                    <strong className="text-base text-emerald-400 font-black tracking-tight">{winnerInfo.name}</strong>
                  </div>
                </div>
                
                <div className="text-left border-l border-white/5 pl-3">
                  <span className="text-[8px] uppercase text-gray-500 block font-black tracking-wider mb-0.5">Decision Strategy</span>
                  <strong className="text-xs text-white font-black uppercase tracking-wide block mt-1">{winningStepName} Wins</strong>
                  <span className="text-[8px] text-gray-400 font-bold block mt-0.5 truncate">{winnerInfo.strategy}</span>
                </div>
                
                <div className="text-left border-l border-white/5 pl-3">
                  <span className="text-[8px] uppercase text-gray-500 block font-black tracking-wider mb-0.5">Resolution Speed</span>
                  <strong className="text-base text-white font-black tracking-tight">{(parseFloat(winnerInfo.time) / 10).toFixed(2)}s</strong>
                  <span className="text-[8px] text-gray-400 font-bold block mt-0.5">AI Engine calculation speed</span>
                </div>

                <div className="text-left border-l border-white/5 pl-3">
                  <span className="text-[8px] uppercase text-gray-500 block font-black tracking-wider mb-0.5">Active Safety Status</span>
                  <strong className="text-[9px] bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded font-black uppercase tracking-wider inline-block mt-1">
                    OVERRIDE ENGAGED
                  </strong>
                </div>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}

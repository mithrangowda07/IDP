import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, Polyline, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Play, Pause, RotateCcw, AlertTriangle, ShieldCheck, Clock, Users, ArrowRight, Activity, Plus, Shield, Check, Flame, Siren, Trash2, FastForward, Loader2 } from 'lucide-react';

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

const createVehicleIcon = (type, id, isWinner = false) => {
  let bgColor = '#3b82f6';
  let borderClass = 'border-blue-400';
  let label = 'AMB';

  if (type === 'fire_engine') {
    bgColor = '#ef4444';
    borderClass = 'border-red-400';
    label = 'FIRE';
  } else if (type === 'police') {
    bgColor = '#8b5cf6';
    borderClass = 'border-purple-400';
    label = 'POL';
  }

  return L.divIcon({
    className: 'custom-leaflet-icon',
    html: `
      <div class="relative flex items-center justify-center w-9 h-9 rounded-full border-2 bg-slate-900 ${borderClass} shadow-2xl transition-all duration-300">
        ${isWinner ? `<div class="absolute -inset-1 rounded-full bg-emerald-500/20 animate-ping"></div>` : ''}
        <div class="flex flex-col items-center justify-center">
          <span class="text-[7px] font-bold text-gray-400 leading-none uppercase">${label}</span>
          <span class="text-white text-[8px] font-black leading-none mt-0.5">${id.split('-')[1] || id}</span>
        </div>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
};

function interpolatePath(path, progress) {
  if (!path || path.length === 0) return JB_CIRCLE;
  if (path.length === 1) return path[0];
  if (progress <= 0) return path[0];
  if (progress >= 1) return path[path.length - 1];

  const totalSegments = path.length - 1;
  const rawIndex = progress * totalSegments;
  const index = Math.floor(rawIndex);
  const segmentProgress = rawIndex - index;

  const start = path[index];
  const end = path[index + 1];

  const lat = start[0] + (end[0] - start[0]) * segmentProgress;
  const lng = start[1] + (end[1] - start[1]) * segmentProgress;

  return [lat, lng];
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

      return {
        ...vehicle,
        position,
        stage,
        progress,
        signalStatus
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

  return (
    <div className="flex flex-col gap-4 sm:gap-6 min-h-0">
      
      {/* STAT CARDS ROW */}
      <div className="stat-grid lg:grid-cols-4">
        <div className="stat-card flex-col items-start justify-between border-red-500/10">
          <span className="text-[9px] uppercase text-gray-400 block font-bold tracking-wider">Simulation Location</span>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-sm font-black text-red-400 truncate">Jnana Bharathi Circle</span>
            <span className="text-[9px] text-gray-500 uppercase tracking-wider font-bold">Bengaluru</span>
          </div>
        </div>
        <div className="stat-card flex-col items-start justify-between border-emerald-500/10">
          <span className="text-[9px] uppercase text-gray-400 block font-bold tracking-wider">Active Conflict Scale</span>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-emerald-400">{vehicles.length}</span>
            <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Vehicles</span>
          </div>
        </div>
        <div className="stat-card flex-col items-start justify-between border-emerald-500/10">
          <span className="text-[9px] uppercase text-gray-400 block font-bold tracking-wider">Decision Strategy</span>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-[10px] font-black text-gray-200 uppercase tracking-wider">Priority → Dist → ETA → Lives</span>
          </div>
        </div>
        <div className="stat-card flex-col items-start justify-between border-emerald-500/10">
          <span className="text-[9px] uppercase text-gray-400 block font-bold tracking-wider">Simulation Speed</span>
          <div className="mt-2 flex gap-1.5">
            {[1, 2, 5].map(speed => (
              <button
                key={speed}
                onClick={() => setSimSpeed(speed)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${simSpeed === speed ? 'bg-emerald-600 text-white shadow' : 'bg-white/5 text-gray-400 border border-white/5 hover:bg-white/10'}`}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* CORE GRID */}
      <div className="content-grid">
        
        {/* LEFT COLUMN: SCENARIOS, CONTROLS, BUILDER */}
        <div className="lg:col-span-4 flex flex-col gap-4 sm:gap-6 min-h-0 overflow-y-auto lg:h-[calc(100dvh-200px)] pr-1 pb-6">
          
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
                onClick={() => setSimTime(0)}
                className="py-2 px-3 rounded-xl bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition text-xs font-bold flex items-center justify-center gap-1 active:scale-[0.98]"
                title="Reset Simulation"
              >
                <RotateCcw size={14} /> Reset
              </button>
            </div>
          </div>

          {/* Live AI Decision Panel (Terminal style) */}
          <div className="panel p-4 sm:p-5 flex flex-col flex-1 min-h-[220px] max-h-[300px]">
            <h3 className="panel-header mb-2.5">
              <Activity size={16} className="text-emerald-400" /> Live AI Decision Panel
            </h3>
            <div className="flex-1 bg-black/60 rounded-xl p-3 border border-white/5 font-mono text-[10px] text-emerald-300 overflow-y-auto space-y-1 scrollbar-thin">
              {logs.length === 0 ? (
                <div className="text-gray-600 text-center py-10 italic">
                  Press Start to launch conflict resolution logs...
                </div>
              ) : (
                logs.map((log, index) => {
                  let logColor = 'text-emerald-300';
                  if (log.includes('🚨') || log.includes('wins') || log.includes('winner:')) {
                    logColor = 'text-yellow-300 font-bold';
                  } else if (log.includes('✅')) {
                    logColor = 'text-emerald-400 font-bold';
                  } else if (log.includes('tie')) {
                    logColor = 'text-gray-400';
                  }
                  
                  return (
                    <div key={index} className={`leading-relaxed whitespace-pre-wrap ${logColor}`}>
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
        <div className="lg:col-span-8 flex flex-col gap-4 sm:gap-6 min-h-[400px] lg:h-[calc(100dvh-200px)] overflow-hidden">
          
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

              {/* Predefined conflict junction: Pulsing Red Marker */}
              <Marker
                position={JB_CIRCLE}
                icon={L.divIcon({
                  className: 'custom-leaflet-icon',
                  html: `
                    <div class="relative flex items-center justify-center w-8 h-8 rounded-full border-2 border-red-500 bg-red-950/40 shadow-2xl">
                      <div class="absolute -inset-1.5 rounded-full bg-red-600 animate-ping opacity-60"></div>
                      <div class="absolute w-3.5 h-3.5 bg-red-600 rounded-full"></div>
                    </div>
                  `,
                  iconSize: [32, 32],
                  iconAnchor: [16, 16],
                })}
              >
                <Tooltip permanent direction="top" offset={[0, -10]} opacity={0.9}>
                  <div className="font-bold text-[10px] text-red-700">Jnana Bharathi Circle</div>
                  <div className="text-[8px] text-slate-500 font-medium">Conflict Analysis Zone</div>
                </Tooltip>
              </Marker>

              {/* Draw routes for active vehicles */}
              {vehicles.map(veh => {
                const pathData = routes[veh.id] || PREDEFINED_PATHS[veh.origin];
                if (!pathData || !pathData.part1) return null;
                
                const color = veh.type === 'ambulance' ? '#3b82f6' : veh.type === 'fire_engine' ? '#ef4444' : '#8b5cf6';
                const fullPath = [...pathData.part1, ...pathData.part2];

                return (
                  <React.Fragment key={`route-${veh.id}`}>
                    <Polyline
                      positions={fullPath}
                      pathOptions={{
                        color,
                        weight: 3.5,
                        opacity: 0.55,
                        dashArray: '4, 6'
                      }}
                    />
                  </React.Fragment>
                );
              })}

              {/* Draw active moving vehicle markers */}
              {trackingVehiclesOnMap.map(veh => {
                const isWinner = simData.sorted.length > 0 && simData.sorted[0].id === veh.id;
                
                const pathData = routes[veh.id] || PREDEFINED_PATHS[veh.origin];
                const activePath = veh.stage === 'crossing' && pathData ? pathData.part2 : null;
                
                return (
                  <React.Fragment key={`marker-${veh.id}`}>
                    <Marker
                      position={veh.position}
                      icon={createVehicleIcon(veh.type, veh.id, isWinner && veh.signalStatus === 'green')}
                      zIndexOffset={isWinner ? 2000 : 1000}
                    >
                      <Popup>
                        <div className="text-slate-900 text-xs p-1">
                          <h4 className="font-bold uppercase">{veh.id} ({veh.type.replace('_', ' ')})</h4>
                          <p className="mt-0.5">Priority: <strong>{veh.priority}</strong></p>
                          <p>ETA to Junction: <strong>{veh.eta}s</strong></p>
                          <p>Lives At Risk: <strong>{veh.livesAtRisk}</strong></p>
                          <p>Status: <span className={`font-bold ${veh.stage === 'crossing' ? 'text-emerald-600' : 'text-red-500'}`}>{veh.stage.toUpperCase()}</span></p>
                        </div>
                      </Popup>
                    </Marker>
                    
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

              {/* Signal Light visual marker overlays at JB Circle */}
              {circleSignalStatus.status === 'active_override' && (
                <CircleMarker
                  center={JB_CIRCLE}
                  radius={12}
                  pathOptions={{
                    fillColor: '#10b981',
                    fillOpacity: 0.9,
                    color: '#ffffff',
                    weight: 2
                  }}
                >
                  <Tooltip permanent direction="bottom" offset={[0, 10]}>
                    <div className="text-[9px] font-bold text-emerald-700">SIGNAL OVERRIDE ACTIVE</div>
                    <div className="text-[8px] text-gray-500 leading-none">Allocated to {circleSignalStatus.winnerId}</div>
                  </Tooltip>
                </CircleMarker>
              )}

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
                <span>Ambulance Route</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500 block border border-white/10"></span>
                <span>Fire Engine Route</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-purple-500 block border border-white/10"></span>
                <span>Police Route</span>
              </div>
              <div className="flex items-center gap-2 border-t border-white/5 pt-1.5">
                <span className="w-3 h-3 bg-red-600 rounded-full animate-pulse block"></span>
                <span className="font-bold text-red-400">Conflict Circle</span>
              </div>
            </div>
          </div>

          {/* End Result Screen Summary Card */}
          {winnerInfo && (
            <div className="panel p-4 sm:p-5 border-emerald-500/20 shadow-lg shrink-0 bg-emerald-500/[0.02]">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-emerald-500/10">
                <ShieldCheck size={18} className="text-emerald-400 animate-pulse" />
                <h3 className="text-xs font-black uppercase text-emerald-400 tracking-wider">Conflict Resolution Complete</h3>
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="text-left">
                  <span className="text-[8px] uppercase text-gray-400 block font-black tracking-wider">Primary Winner</span>
                  <strong className="text-base text-emerald-400 font-black tracking-tight">{winnerInfo.name}</strong>
                </div>
                
                <div className="text-left border-l border-white/5 pl-3">
                  <span className="text-[8px] uppercase text-gray-400 block font-black tracking-wider">Resolution Time</span>
                  <strong className="text-base text-white font-black tracking-tight">{winnerInfo.time}s</strong>
                </div>
                
                <div className="text-left border-l border-white/5 pl-3">
                  <span className="text-[8px] uppercase text-gray-400 block font-black tracking-wider">Queue Size</span>
                  <strong className="text-base text-white font-black tracking-tight">{winnerInfo.count} vehicles</strong>
                </div>

                <div className="text-left border-l border-white/5 pl-3">
                  <span className="text-[8px] uppercase text-gray-400 block font-black tracking-wider">Safety Status</span>
                  <strong className="text-xs bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded font-black uppercase tracking-wider inline-block mt-0.5">
                    SUCCESS
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

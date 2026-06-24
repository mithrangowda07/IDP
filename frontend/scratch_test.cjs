const axios = require('axios');

const JB_CIRCLE = [12.935619, 77.513071];
const CAMPUS_DEST = [12.9420, 77.5060];

const PREDEFINED_PATHS = {
  'Rajarajeshwari Nagar': {
    origin: [12.908, 77.522],
    part1: [
      [12.908, 77.522],
      [12.914, 77.525],
      [12.918, 77.528],
      [12.924, 77.523],
      [12.930, 77.518],
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
  }
};

const vehicles = [
  {
    id: 'AMB-105',
    type: 'ambulance',
    priority: 95,
    distance: 2,
    eta: 120,
    livesAtRisk: 1,
    emergencyType: 'Cardiac Arrest',
    origin: 'Rajarajeshwari Nagar',
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
  }
];

const fetchOSRMRoute = async (start, end) => {
  const coordinates = `${start[1]},${start[0]};${end[1]},${end[0]}`;
  const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson`;
  try {
    const res = await axios.get(url);
    const data = res.data;
    if (data.code === 'Ok' && data.routes?.length > 0) {
      return data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    }
  } catch (e) {
    console.error("OSRM failed:", e.message);
  }
  return null;
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

async function run() {
  const routes = {};
  for (const veh of vehicles) {
    const fallbackPath = PREDEFINED_PATHS[veh.origin];
    const part1 = await fetchOSRMRoute(fallbackPath.origin, JB_CIRCLE) || fallbackPath.part1;
    const part2 = await fetchOSRMRoute(JB_CIRCLE, CAMPUS_DEST) || fallbackPath.part2;
    routes[veh.id] = { part1, part2 };
  }

  console.log("ROUTES LOADED:");
  for (const id in routes) {
    console.log(`- ${id}: part1 points = ${routes[id].part1.length}, part2 points = ${routes[id].part2.length}`);
    console.log(`  part1 start = ${JSON.stringify(routes[id].part1[0])}, end = ${JSON.stringify(routes[id].part1[routes[id].part1.length - 1])}`);
  }

  // Calculate position at simTime = 12.5
  const simTime = 12.5;
  console.log(`\nSIMULATION AT simTime = ${simTime}s:`);
  
  for (const vehicle of vehicles) {
    const pathData = routes[vehicle.id] || PREDEFINED_PATHS[vehicle.origin];
    const progress = simTime / vehicle.eta;
    const position = interpolatePath(pathData.part1, progress);
    
    console.log(`Vehicle ${vehicle.id}:`);
    console.log(`  Origin: ${vehicle.origin} -> ${JSON.stringify(PREDEFINED_PATHS[vehicle.origin].origin)}`);
    console.log(`  Progress: ${progress.toFixed(4)}`);
    console.log(`  Interpolated Position: ${JSON.stringify(position)}`);
    
    // Check if position lies on the pathData.part1 polyline
    // In our case, the polyline is drawn using pathData.part1, so the interpolated position MUST lie on it.
    console.log(`  Is first point of route identical? ${JSON.stringify(pathData.part1[0])}`);
  }
}

run();

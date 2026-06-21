# Integrated Emergency Response and Green Corridor Management System (IDP)

A full-stack, real-time emergency response platform that manages emergency incident reports (citizen or sensor generated), checks vehicle availability dynamically, routes responders using OpenStreetMap/Leaflet, dispatches emergency services, and simulates a traffic-light-overriding green corridor.

---

## Technical Stack

- **Frontend**: React.js (Vite), Tailwind CSS, Leaflet, Axios, Socket.IO Client
- **Backend**: Node.js, Express.js, Socket.IO, MySQL2, Bcryptjs, JWT, MinIO Client
- **Database**: MySQL
- **Object Storage**: MinIO (Dockerized S3-compatible storage)
- **Routing**: OpenRouteService / OSRM (OpenStreetMap road network)
- **Traffic Signals**: OpenStreetMap Overpass API (`highway=traffic_signals`)

---

## Directory Layout

```
IDP/
├── backend/
│   ├── db.js                # Database connection & DDL initialization
│   ├── minioClient.js       # S3-compatible image upload helpers
│   ├── socket.js            # Socket.IO rooms, GPS simulation & green corridor logic
│   ├── server.js            # Main Express server & REST APIs
│   └── .env                 # Backend environment variables
├── frontend/
│   ├── src/
│   │   ├── components/      # MapPanel, DashboardShell, FleetManager, etc.
│   │   ├── pages/           # Role-based dashboards & auth pages
│   │   ├── services/        # Axios API clients & Socket.IO config
│   │   ├── App.jsx          # Role-based router
│   │   └── main.jsx         # App mounter
│   └── tailwind.config.js
└── README.md
```

---

## Getting Started

### Prerequisites

- **Node.js** (v18+)
- **MySQL** (port 3306)
- **Docker** (for MinIO)

### Installation & Launch

1. **Start MinIO Storage**:
   ```bash
   docker run -d --name minio \
     -p 9000:9000 -p 9001:9001 \
     -e "MINIO_ROOT_USER=minioadmin" \
     -e "MINIO_ROOT_PASSWORD=minioadmin" \
     minio/minio server /data --console-address ":9001"
   ```

2. **Configure & Start Backend**:
   ```bash
   cd backend
   npm install
   npm start
   ```
   The backend runs on port `5000`. It creates the `emergency_response` database, initializes tables, seeds preset admin accounts, and configures the MinIO bucket.

3. **Start Frontend**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   Open **`http://localhost:5173`**.

### Optional Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SIGNAL_ROUTE_MATCH_DISTANCE_METERS` | `15` | Max distance (m) from route polyline for a signal to be included |
| `SIMULATION_SPEED_KMH` | `90` | Default vehicle simulation speed (demo control: 10–120 km/h) |
| `OSRM_BASE_URL` | OSRM public | OSRM routing server for simulation route refresh |

---

## User Roles & Preset Logins

| Role | Email | Password | Capability |
|---|---|---|---|
| **Medical Admin** | `medical_admin@idp.com` | `admin123` | Medical/accident alerts, recommendations, hospital alerting |
| **Fire Admin** | `fire_admin@idp.com` | `admin123` | Fire/gas alerts, recommendations, fire station alerting |
| **Traffic Admin** | `traffic_admin@idp.com` | `admin123` | Green corridor monitoring, analytics, simulation controls |
| **Hospital Operator** | *Registration* | *Custom* | Dispatch ambulances, trip status, fleet & profile |
| **Fire Station Operator** | *Registration* | *Custom* | Dispatch fire engines, trip status, fleet & profile |
| **Citizen User** | *Registration* | *Custom* | Report incidents, emergency assistance, live tracking |

---

## Feature Overview

### A. Green Corridor Optimization

- **Signal override mechanism**: Traffic signals along the emergency route are overridden to green when the vehicle is within 500 m ahead.
- **Route-polyline signal matching**: Only OSM traffic signals snapped to the actual traversed route polyline are activated (configurable tolerance, default 15 m). Signals on parallel or adjacent roads are excluded.
- **Dynamic signal activation**: Signal states update in real time as the vehicle progresses along the route.
- **Corridor prioritization**: Optimized ETA is calculated at ~35% travel time reduction vs. normal routing.
- **Real-time corridor visualization**: Route polyline and signal markers (green/normal) shown on Leaflet maps for traffic admin, operators, and citizens.
- **Medical & fire support**: Both ambulances and fire engines receive green corridor treatment on outbound and return journeys when enabled.

### B. Real-Time Vehicle Tracking

- **Socket.IO based tracking**: Role-based rooms (`traffic_admin`, `dispatch_{id}`, etc.) receive live updates.
- **Live GPS updates**: Vehicle position broadcast every second during simulation (`vehicle_tracking_update`).
- **Vehicle movement simulation**: Server-side interval loop advances the vehicle along stored OSRM route geometry.
- **Demo speed control**: Hospital and fire station operators can adjust simulation speed ±10 km/h (10–120 km/h) during en route or return journeys without affecting route geometry or dispatch logic.

### C. Traffic Administration Features

- **Corridor monitoring**: View all active priority corridors with ETAs and signal overrides.
- **Historical analytics**: Aggregate stats — total optimized/normal travel time, total time saved, completed corridor count.
- **Journey history**: Searchable, sortable, paginated table of all completed corridor journeys with date filters (Today, 7 Days, 30 Days, All Time).
- **Live GPS telemetry log**: Recent vehicle position updates for active simulations.

### D. Emergency Assistance Features

- **Citizen emergency assistance workflow**: Quick-report flow for urgent situations with map-based location.
- **Direct emergency calling support**: Configurable emergency coordinator phone numbers (medical/fire).
- **Live vehicle tracking**: Citizens can follow dispatched vehicles on a map during active incidents.

### E. Operator Features

#### Hospital Operator
- Incident alert acceptance and vehicle dispatch
- En route / at scene / resolve workflow with optional green corridor on return
- **Incident history** with filters and search
- **Outcome tracking** on incident resolution
- **Profile management** (service details, credentials)
- **Fleet management**: Add/remove ambulance vehicles (`AMB-*` prefix)

#### Fire Station Operator
- Same dispatch workflow for fire engines
- **Incident history**, **outcome tracking**, **profile management**
- Fire-specific resolution fields (severity, water consumption, time to control/extinguish)
- **Fleet management**: Add/remove fire engines (`FIRE-*` prefix)

### F. Citizen Features

- **Incident reporting** with map location picker and MinIO image upload
- **Incident history** and status tracking
- **Profile editing** (name, phone, emergency contact, email)
- **Emergency assistance** quick reporting
- **Live vehicle tracking** during active dispatches

### G. Multi-Vehicle Dispatch Support

- **Independent dispatch sessions**: Each incident-dispatch pair maintains its own state, route, and tracking room.
- **Dispatch-based tracking**: Clients join `dispatch_{id}` Socket.IO rooms for scoped updates.
- **Multiple simultaneous ambulances/fire engines**: Each vehicle simulation runs independently with its own green corridor and signal set.

---

## Core Workflows

### 1. Registration & Verification
Services register via forms with coordinates and vehicle IDs. Registrations start as `pending`. Medical/Fire/Traffic admins approve on the **Service Verifications** tab.

### 2. Service Discovery & Recommendation
Haversine distance ranks nearby services with available vehicles. The closest eligible station is marked **Recommended**. Admins alert the selected service.

### 3. Routing
OpenRouteService (with Haversine fallback) generates route geometry, normal duration, and optimized corridor duration. Route coordinates are stored on the dispatch record.

### 4. Dispatch & Tracking
1. Operator assigns an available vehicle.
2. Operator marks **En Route** → server starts GPS simulation and green corridor.
3. Vehicle reaches scene automatically (or manual **At Scene**).
4. Operator resolves incident → optional return green corridor.
5. Vehicle returns to station → dispatch marked **completed**.

### 5. Authentication
JWT-based login for all roles. Role-based route guards on frontend; `authorizeRoles` middleware on protected API endpoints.

---

## API Highlights

| Endpoint | Description |
|---|---|
| `GET /api/traffic/active-corridors` | Active green corridors with routes & signals |
| `GET /api/traffic/journey-stats` | Aggregate corridor analytics (traffic admin) |
| `GET /api/traffic/journey-history` | Paginated completed journey history |
| `GET/POST /api/simulation-speed` | Read/adjust demo simulation speed (hospital/fire operator) |
| `POST /api/services/:id/vehicles` | Add fleet vehicle (hospital/fire operator) |
| `DELETE /api/services/:id/vehicles/:vehicleId` | Remove fleet vehicle |

All existing endpoints for auth, incidents, dispatch, routing, and citizen workflows remain unchanged.

---

## Architecture Notes

```
Citizen/Operator → REST API → MySQL (incidents, dispatches, corridors)
                    ↓
              Socket.IO → Real-time tracking & green corridor broadcasts
                    ↓
         OSRM (routes) + Overpass (traffic signals on route polyline)
```

Green corridor signal selection uses nearest-point-on-segment projection against the stored route geometry — not radius-based filtering from the vehicle position.

---

## License

Academic / project use.

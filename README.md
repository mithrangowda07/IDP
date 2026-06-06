# Integrated Emergency Response and Green Corridor Management System (IDP)

A full-stack, real-time emergency response platform that manages emergency incident reports (citizen or sensor generated), checks vehicle availability dynamically, routes responders using OpenStreetMap/Leaflet, dispatches emergency services, and simulates a traffic-light-overriding green corridor.

---

## Technical Stack

- **Frontend**: React.js (Vite), Tailwind CSS, Leaflet, Axios, Socket.IO Client
- **Backend**: Node.js, Express.js, Socket.IO, MySQL2, Bcryptjs, JWT, MinIO Client
- **Database**: MySQL
- **Object Storage**: MinIO (Dockerized S3-compatible storage)

---

## Directory Layout

```
IDP/
├── backend/
│   ├── routes/              # Express API route handles
│   ├── db.js                # Database connection & DDL initialization
│   ├── minioClient.js       # S3-compatible image upload helpers
│   ├── socket.js            # Socket.IO rooms & GPS simulation loops
│   ├── server.js            # Main Express server bootstrapper
│   └── .env                 # Backend environment variables
├── frontend/
│   ├── src/
│   │   ├── components/      # Leaflet MapPanel component
│   │   ├── pages/           # Login, citizen, hospital, fire station, admin pages
│   │   ├── services/        # Axios API clients & Socket.IO config
│   │   ├── App.jsx          # Role-based router
│   │   └── main.jsx         # App mounter
│   ├── tailwind.config.js   # Tailwind custom design parameters
│   └── postcss.config.js    # PostCSS configs
└── README.md                # System documentation
```

---

## Getting Started

### Prerequisites

Make sure the following services are installed and active:
- **Node.js** (v18+)
- **MySQL** (listening on standard port 3306)
- **Docker** (for containerized MinIO)

### Installation & Launch

1. **Start MinIO Storage**:
   Start the local MinIO container using Docker:
   ```bash
   docker run -d --name minio \
     -p 9000:9000 -p 9001:9001 \
     -e "MINIO_ROOT_USER=minioadmin" \
     -e "MINIO_ROOT_PASSWORD=minioadmin" \
     minio/minio server /data --console-address ":9001"
   ```

2. **Configure & Start Backend**:
   - Navigate to the `backend` directory.
   - Configure the `.env` credentials (presets for database `root` / `MithDhru@1536` are configured by default).
   - Install dependencies and start:
     ```bash
     npm install
     npm start
     ```
   - The backend runs on port `5000`. It automatically creates the `emergency_response` database, sets up all MySQL tables, seeds preset admin credentials, and configures the MinIO bucket.

3. **Start Frontend**:
   - Navigate to the `frontend` directory.
   - Install dependencies and start the Vite dev server:
     ```bash
     npm install
     npm run dev
     ```
   - Open your browser at **`http://localhost:5173`**.

---

## User Roles & Preset Logins

We have seeded preset active admin accounts for immediate testing. They can be triggered using the Quick Access buttons on the Login page:

| Role | Email | Password | Console Capability |
|---|---|---|---|
| **Medical Admin** | `medical_admin@idp.com` | `admin123` | Feeds Medical/Accident alerts, calculates recommendations, alerts hospitals. |
| **Fire Admin** | `fire_admin@idp.com` | `admin123` | Feeds Fire/Gas alerts, recommends & alerts fire stations. |
| **Traffic Admin** | `traffic_admin@idp.com` | `admin123` | Monitors active priority green corridors, tracks GPS movement, shows signals. |
| **Hospital Operator** | *Via registration form* | *Custom* | Accept dispatches, selects available ambulance, controls trip status. |
| **Fire Station Operator** | *Via registration form* | *Custom* | Accept dispatches, selects available fire engines, controls trip status. |
| **Citizen User** | *Via registration form* | *Custom* | Report emergencies (GPS/Map location picker, upload images to MinIO). |

---

## Feature Walkthroughs

### 1. Registration & Verification
- Services register via forms and specify names, coordinates, and vehicle IDs.
- Registrations are set to `pending`. Admins verify them on the **Service Verifications** tab, enabling login.

### 2. Service Discovery & Recommendation
- Calculations use the **Haversine Formula** to compute distance from the incident location.
- Compares available vehicles (`available` status). Ranks nearby services by distance and marks the closest station with available vehicles as `Recommended`.

### 3. Routing & Simulator
- Uses **OpenRouteService API** (with fallback simulator if no API key is provided).
- Generates route coordinate points, normal duration, and optimized corridor travel times (reducing ETA by ~`35%`).

### 4. Real-time Tracking & Corridor Override
- In the dispatch panel, when marked **En Route**, the server launches an interval loop that updates coordinates and broadcasts updates via **Socket.IO** every 5 seconds.
- Approaches traffic signals along the route and changes their status to **Green** (visual indicator overlay).
- Automatically reaches scene (**At Scene**) and deactivates corridor. On operator clicking **Resolve**, the vehicle returns to station reversing the route coordinates and transitions to **Available**.

import React, { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, Polyline, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet marker icon asset paths for Vite/React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Create custom L.divIcon helper
const createCustomIcon = (color, text, isPulsing = false) => {
  return L.divIcon({
    className: 'custom-leaflet-icon',
    html: `
      <div class="relative flex items-center justify-center w-8 h-8 rounded-full border-2 border-white shadow-xl" style="background-color: ${color}">
        ${isPulsing ? `<div class="absolute -inset-1 rounded-full animate-ping opacity-75" style="background-color: ${color}"></div>` : ''}
        <span class="text-white text-[11px] font-black tracking-tight leading-none z-10">${text}</span>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
};

// Component to handle map clicking
function MapEventsHandler({ onClick }) {
  useMapEvents({
    click(e) {
      if (onClick) {
        onClick(e.latlng);
      }
    },
  });
  return null;
}

// Component to dynamically focus/fly-to coordinates
function MapFocusHandler({ center, zoom }) {
  const map = useMap();
  const lastViewRef = useRef('');

  useEffect(() => {
    if (!center || center.length < 2) return;

    const nextCenter = [parseFloat(center[0]), parseFloat(center[1])];
    if (!Number.isFinite(nextCenter[0]) || !Number.isFinite(nextCenter[1])) return;

    const nextZoom = zoom || map.getZoom();
    const viewKey = `${nextCenter[0].toFixed(6)},${nextCenter[1].toFixed(6)},${nextZoom}`;

    if (lastViewRef.current !== viewKey) {
      lastViewRef.current = viewKey;
      map.flyTo(nextCenter, nextZoom, {
        animate: true,
        duration: 0.8
      });
    }
  }, [center?.[0], center?.[1], zoom, map]);

  return null;
}

export default function MapPanel({
  center = [12.9716, 77.5946], // Bangalore center
  zoom = 12,
  incidents = [],
  activeIncident = null,
  onSelectIncident = null,
  nearbyServices = [],
  routePoints = [],
  corridorActive = false,
  signals = [],
  trackingVehicle = null,
  interactive = false,
  onLocationSelect = null,
  markerPosition = null
}) {
  
  // Custom Icon Definitions
  const getIncidentIcon = (incident) => {
    const isSelected = activeIncident && activeIncident.id === incident.id;
    let color = '#ef4444'; // default red
    if (incident.type === 'accident') color = '#2563eb'; // blue
    if (incident.type === 'medical_emergency') color = '#3b82f6'; // light blue
    if (incident.type === 'fire') color = '#ef4444'; // red
    if (incident.type === 'gas_leak') color = '#f59e0b'; // orange

    const label = incident.type.charAt(0).toUpperCase();
    return createCustomIcon(color, label, isSelected || incident.status !== 'resolved');
  };

  const getServiceIcon = (service) => {
    const isRecommended = service.isRecommended;
    const color = service.type === 'hospital' ? '#3b82f6' : '#ef4444';
    const borderClass = isRecommended ? 'border-emerald-400' : 'border-white';
    
    return L.divIcon({
      className: 'custom-leaflet-icon',
      html: `
        <div class="relative flex items-center justify-center w-8 h-8 rounded-full border-2 ${borderClass} shadow-xl" style="background-color: ${color}">
          ${isRecommended ? '<div class="absolute -inset-1.5 rounded-full border-2 border-emerald-400 animate-pulse"></div>' : ''}
          <span class="text-white text-xs font-bold leading-none z-10">${service.type === 'hospital' ? 'H' : 'FS'}</span>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
  };

  const getVehicleIcon = (type, status) => {
    const color = type === 'ambulance' ? '#3b82f6' : '#ef4444';
    const isMoving = status === 'en_route' || status === 'returning';
    return L.divIcon({
      className: 'custom-leaflet-icon',
      html: `
        <div class="relative flex items-center justify-center w-9 h-9 rounded-full border-2 border-emerald-400 shadow-2xl bg-slate-900">
          ${isMoving ? '<div class="absolute -inset-2 rounded-full bg-emerald-500/20 animate-ping"></div>' : ''}
          <span class="text-white text-[9px] font-black z-10 uppercase tracking-tight">${type === 'ambulance' ? 'Amb' : 'Fire'}</span>
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });
  };

  const computedCenter = activeIncident 
    ? [parseFloat(activeIncident.latitude), parseFloat(activeIncident.longitude)]
    : center;

  const polylineColor = corridorActive ? '#10b981' : '#06b6d4'; // Green for corridor, cyan for default route
  const routePositions = useMemo(
    () => (Array.isArray(routePoints) ? routePoints : [])
      .map(pt => [parseFloat(pt.lat), parseFloat(pt.lng)])
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng)),
    [routePoints]
  );

  return (
    <div className="w-full h-full relative rounded-2xl overflow-hidden border border-white/10 shadow-inner">
      <MapContainer
        center={computedCenter}
        zoom={zoom}
        style={{ width: '100%', height: '100%' }}
        className="z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
        />

        {/* Map Click Handler for Citizen manual location */}
        {interactive && onLocationSelect && (
          <MapEventsHandler onClick={onLocationSelect} />
        )}

        {/* Focus Controller */}
        <MapFocusHandler center={computedCenter} zoom={activeIncident ? 14 : zoom} />

        {/* Manual Location Marker (Reporting Citizen) */}
        {markerPosition && (
          <Marker position={markerPosition}>
            <Popup>Selected Incident Location</Popup>
          </Marker>
        )}

        {/* Incident Markers */}
        {incidents.map((incident) => (
          <Marker
            key={`inc-${incident.id}`}
            position={[parseFloat(incident.latitude), parseFloat(incident.longitude)]}
            icon={getIncidentIcon(incident)}
            eventHandlers={{
              click: () => onSelectIncident && onSelectIncident(incident)
            }}
          >
            <Popup>
              <div className="text-slate-900 p-1">
                <h4 className="font-bold text-xs uppercase text-slate-800">{incident.type.replace('_', ' ')}</h4>
                <p className="text-[10px] text-slate-500 mt-0.5">Status: <strong className="text-blue-600">{incident.status}</strong></p>
                <p className="text-[11px] text-slate-700 mt-1 max-w-[150px] truncate">{incident.description || 'No description'}</p>
                {incident.source === 'sensor' && <span className="inline-block mt-1 bg-red-100 text-red-800 text-[9px] px-1 rounded font-bold">IoT Sensor</span>}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Nearby Services Markers */}
        {nearbyServices.map((service) => (
          <Marker
            key={`serv-${service.id}`}
            position={[parseFloat(service.latitude), parseFloat(service.longitude)]}
            icon={getServiceIcon(service)}
          >
            <Popup>
              <div className="text-slate-900 p-1">
                <h4 className="font-bold text-xs">{service.name}</h4>
                <p className="text-[10px] text-slate-500">{service.type === 'hospital' ? 'Hospital' : 'Fire Station'}</p>
                <p className="text-[10px] mt-1">Distance: <strong>{service.distance} km</strong></p>
                <p className="text-[10px]">Available Vehicles: <strong>{service.availableVehicles}</strong></p>
                {service.isRecommended && <span className="inline-block mt-1 bg-emerald-100 text-emerald-800 text-[9px] px-1.5 py-0.5 rounded font-bold">Recommended</span>}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Active Route Polylines */}
        {routePositions.length > 0 && (
          <>
            <Polyline
              positions={routePositions}
              pathOptions={{
                color: polylineColor,
                weight: 6,
                opacity: 0.85,
                lineJoin: 'round'
              }}
            />
            {/* Outline corridor visual lane */}
            {corridorActive && (
              <Polyline
                positions={routePositions}
                pathOptions={{
                  color: '#10b981',
                  weight: 14,
                  opacity: 0.18,
                  lineJoin: 'round'
                }}
              />
            )}
          </>
        )}

        {/* Traffic Signals Markers */}
        {corridorActive && signals.map((signal) => (
          <CircleMarker
            key={signal.id}
            center={[signal.lat, signal.lng]}
            radius={signal.status === 'green' ? 9 : 6}
            pathOptions={{
              fillColor: signal.status === 'green' ? '#10b981' : '#ef4444',
              fillOpacity: signal.status === 'green' ? 1 : 0.75,
              color: '#ffffff',
              weight: 2
            }}
          >
            {signal.status === 'green' && (
              <Tooltip
                permanent
                direction="top"
                offset={[0, -8]}
                opacity={0.95}
              >
                Signal cleared
              </Tooltip>
            )}
            <Popup>
              <div className="text-slate-900 text-xs">
                Traffic Signal Status: <strong className={signal.status === 'green' ? 'text-emerald-600' : 'text-rose-600'}>
                  {signal.status === 'green' ? 'CLEARED' : 'NORMAL'}
                </strong>
                <p className="text-[10px] text-slate-400 mt-1">
                  {signal.status === 'green'
                    ? `${signal.distanceAhead ?? 0} m ahead - priority override active`
                    : 'Waiting for vehicle to enter the 200 m clearance range'}
                </p>
                {signal.source === 'osm' && (
                  <p className="text-[10px] text-slate-400 mt-1">
                    OSM signal #{signal.osmId} · {signal.distanceToRoute} m from route
                  </p>
                )}
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {/* Active Moving Tracking Vehicle Marker */}
        {trackingVehicle && (
          <Marker
            position={[trackingVehicle.latitude, trackingVehicle.longitude]}
            icon={getVehicleIcon(trackingVehicle.type, trackingVehicle.status)}
            zIndexOffset={1000}
          >
            <Popup>
              <div className="text-slate-900 p-1">
                <h4 className="font-bold text-xs uppercase">Vehicle tracking: {trackingVehicle.id}</h4>
                <p className="text-[10px]">Type: {trackingVehicle.type}</p>
                <p className="text-[10px] mt-0.5">Status: <strong className="text-emerald-600">{trackingVehicle.status.replace('_', ' ')}</strong></p>
                {trackingVehicle.progress !== undefined && (
                  <div className="w-full bg-slate-200 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${trackingVehicle.progress}%` }}></div>
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>

      {/* Legend Indicator Overlay */}
      <div className="absolute bottom-4 left-4 glass-panel px-3 py-2.5 rounded-xl border border-white/10 z-10 text-[10px] space-y-1.5 max-w-[170px] pointer-events-none text-gray-300">
        <h5 className="font-semibold text-white text-[11px] mb-1">Map Legend</h5>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-blue-500 block border border-white/10"></span>
          <span>Medical Incident</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-500 block border border-white/10"></span>
          <span>Fire Incident</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-amber-500 block border border-white/10"></span>
          <span>Gas Leak / Warning</span>
        </div>
        {corridorActive && (
          <div className="flex items-center gap-2 border-t border-white/5 pt-1.5">
            <span className="w-5 h-1 bg-[#10b981] block rounded"></span>
            <span className="text-emerald-400 font-bold">Green Corridor Active</span>
          </div>
        )}
      </div>
    </div>
  );
}

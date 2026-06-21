import React, { useState, useEffect, useCallback } from 'react';
import { trafficAPI } from '../services/api';
import { connectSocket, disconnectSocket, socket } from '../services/socket';
import MapPanel from '../components/MapPanel';
import DashboardShell from '../components/DashboardShell';
import { ShieldAlert, Activity, Navigation, ChevronLeft, ChevronRight } from 'lucide-react';

const HISTORY_FILTERS = [
  { id: 'today', label: 'Today' },
  { id: '7days', label: 'Last 7 Days' },
  { id: '30days', label: 'Last 30 Days' },
  { id: 'all', label: 'All Time' },
];

const SORT_COLUMNS = [
  { key: 'journey_id', label: 'Journey ID' },
  { key: 'incident_id', label: 'Incident ID' },
  { key: 'vehicle_id', label: 'Vehicle ID' },
  { key: 'vehicle_type', label: 'Vehicle Type' },
  { key: 'service_name', label: 'Service Name' },
  { key: 'start_time', label: 'Start Time' },
  { key: 'end_time', label: 'End Time' },
  { key: 'optimized_travel_time', label: 'Optimized Time' },
  { key: 'normal_travel_time', label: 'Normal Time' },
  { key: 'time_saved', label: 'Time Saved' },
  { key: 'corridor_status', label: 'Status' },
];

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function formatVehicleType(type) {
  if (!type) return '—';
  return type.replace(/_/g, ' ');
}

export default function TrafficAdminDashboard({ user, onLogout }) {
  const [activeCorridors, setActiveCorridors] = useState([]);
  const [trackingHistory, setTrackingHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [journeyStats, setJourneyStats] = useState({
    totalOptimizedTravelTime: 0,
    totalNormalTravelTime: 0,
    totalTimeSaved: 0,
    totalCompletedCorridors: 0,
  });
  const [journeyHistory, setJourneyHistory] = useState([]);
  const [journeyPagination, setJourneyPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [historyFilter, setHistoryFilter] = useState('all');
  const [historySearch, setHistorySearch] = useState('');
  const [historySort, setHistorySort] = useState({ sort: 'end_time', order: 'desc' });
  const [journeyLoading, setJourneyLoading] = useState(false);

  const [routePoints, setRoutePoints] = useState([]);
  const [signals, setSignals] = useState([]);
  const [trackingVehicle, setTrackingVehicle] = useState(null);
  const [selectedCorridorId, setSelectedCorridorId] = useState(null);

  const loadActiveCorridors = useCallback(async () => {
    try {
      const response = await trafficAPI.getActiveCorridors();
      setActiveCorridors(response.data);
    } catch (err) {
      console.error('Failed to load active corridors', err);
    }
  }, []);

  const loadTrackingHistory = async () => {
    setHistoryLoading(true);
    try {
      const response = await trafficAPI.getTrackingHistory();
      setTrackingHistory(response.data);
    } catch (err) {
      console.error('Failed to load tracking history', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadJourneyStats = useCallback(async (filter = historyFilter) => {
    try {
      const response = await trafficAPI.getJourneyStats({ filter });
      setJourneyStats(response.data);
    } catch (err) {
      console.error('Failed to load journey stats', err);
    }
  }, [historyFilter]);

  const loadJourneyHistory = useCallback(async (overrides = {}) => {
    setJourneyLoading(true);
    try {
      const params = {
        filter: overrides.filter ?? historyFilter,
        search: overrides.search ?? historySearch,
        page: overrides.page ?? journeyPagination.page,
        limit: journeyPagination.limit,
        sort: overrides.sort ?? historySort.sort,
        order: overrides.order ?? historySort.order,
      };
      const response = await trafficAPI.getJourneyHistory(params);
      setJourneyHistory(response.data.items);
      setJourneyPagination(response.data.pagination);
    } catch (err) {
      console.error('Failed to load journey history', err);
    } finally {
      setJourneyLoading(false);
    }
  }, [historyFilter, historySearch, journeyPagination.page, journeyPagination.limit, historySort]);

  useEffect(() => {
    connectSocket('traffic_admin');
    loadActiveCorridors();
    loadTrackingHistory();
    loadJourneyStats();
    loadJourneyHistory({ page: 1 });

    socket.on('green_corridor_update', (data) => {
      loadActiveCorridors();

      setSelectedCorridorId((currentId) => {
        if (data.status === 'active') {
          if (!currentId || String(currentId) === String(data.dispatchId)) {
            setRoutePoints(data.route);
            setSignals(data.signals);
            return data.dispatchId;
          }
        } else if (String(currentId) === String(data.dispatchId)) {
          setRoutePoints([]);
          setSignals([]);
          setTrackingVehicle(null);
          return null;
        }
        return currentId;
      });
    });

    socket.on('vehicle_tracking_update', (data) => {
      setSelectedCorridorId((currentId) => {
        if (currentId && String(currentId) === String(data.dispatchId)) {
          setTrackingVehicle({
            id: data.vehicleId,
            latitude: parseFloat(data.latitude),
            longitude: parseFloat(data.longitude),
            type: data.vehicleId.startsWith('AMB') ? 'ambulance' : 'fire_engine',
            status: data.status,
            progress: data.progress,
          });
        }
        return currentId;
      });

      setTrackingHistory((prev) => [
        {
          id: Date.now(),
          vehicle_id: data.vehicleId,
          latitude: data.latitude,
          longitude: data.longitude,
          timestamp: new Date().toISOString(),
        },
        ...prev.slice(0, 15),
      ]);
    });

    socket.on('vehicle_status_change', (data) => {
      setTrackingVehicle((prev) => {
        if (prev && prev.id === data.vehicleId) {
          return { ...prev, status: data.status };
        }
        return prev;
      });
      loadActiveCorridors();
    });

    return () => {
      socket.off('green_corridor_update');
      socket.off('vehicle_tracking_update');
      socket.off('vehicle_status_change');
      disconnectSocket();
    };
  }, []);

  useEffect(() => {
    loadJourneyStats(historyFilter);
    loadJourneyHistory({ filter: historyFilter, page: 1 });
  }, [historyFilter]);

  const handleSelectCorridor = (corr) => {
    setSelectedCorridorId(corr.dispatch_id);
    setRoutePoints(corr.route_geometry);
    setSignals(corr.signals_state);
    setTrackingVehicle({
      id: corr.vehicle_id,
      latitude: parseFloat(corr.v_lat),
      longitude: parseFloat(corr.v_lng),
      type: corr.vehicle_id.startsWith('AMB') ? 'ambulance' : 'fire_engine',
      status: 'en_route',
      progress: 0,
    });
  };

  const handleHistorySearchSubmit = (event) => {
    event.preventDefault();
    loadJourneyHistory({ page: 1 });
  };

  const handleSort = (columnKey) => {
    const nextOrder = historySort.sort === columnKey && historySort.order === 'desc' ? 'asc' : 'desc';
    setHistorySort({ sort: columnKey, order: nextOrder });
    loadJourneyHistory({ sort: columnKey, order: nextOrder, page: 1 });
  };

  const handlePageChange = (nextPage) => {
    if (nextPage < 1 || nextPage > journeyPagination.totalPages) return;
    loadJourneyHistory({ page: nextPage });
  };

  const sortIndicator = (columnKey) => {
    if (historySort.sort !== columnKey) return '';
    return historySort.order === 'asc' ? ' ↑' : ' ↓';
  };

  return (
    <DashboardShell
      icon={Activity}
      iconClassName="bg-emerald-600/10 text-emerald-400 border-emerald-500/20"
      title="Traffic Control Authority"
      subtitle="Green Corridor Optimization & Signal Overrides"
      tabs={[]}
      onLogout={onLogout}
    >
      <div className="flex flex-col gap-4 sm:gap-6 min-h-0">
        <div className="stat-grid lg:grid-cols-4">
          <div className="stat-card flex-col items-start justify-between border-emerald-500/10">
            <span className="text-[9px] uppercase text-gray-400 block font-bold tracking-wider">Total Optimized Travel Time</span>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-black text-emerald-400">{journeyStats.totalOptimizedTravelTime}</span>
              <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Minutes</span>
            </div>
          </div>
          <div className="stat-card flex-col items-start justify-between border-emerald-500/10">
            <span className="text-[9px] uppercase text-gray-400 block font-bold tracking-wider">Total Normal Travel Time</span>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-black text-gray-200">{journeyStats.totalNormalTravelTime}</span>
              <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Minutes</span>
            </div>
          </div>
          <div className="stat-card flex-col items-start justify-between border-emerald-500/10">
            <span className="text-[9px] uppercase text-gray-400 block font-bold tracking-wider">Total Time Saved</span>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-black text-emerald-400">{journeyStats.totalTimeSaved}</span>
              <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Minutes</span>
            </div>
          </div>
          <div className="stat-card flex-col items-start justify-between border-emerald-500/10">
            <span className="text-[9px] uppercase text-gray-400 block font-bold tracking-wider">Total Completed Corridors</span>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-black text-white">{journeyStats.totalCompletedCorridors}</span>
              <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Journeys</span>
            </div>
          </div>
        </div>

        <div className="content-grid">
          <div className="lg:col-span-4 flex flex-col gap-4 sm:gap-6 min-h-0 overflow-hidden">
            <div className="sidebar-panel flex-1 min-h-0">
              <h3 className="panel-header mb-4">
                <ShieldAlert size={16} className="text-emerald-400 animate-pulse" /> Active Priority Corridors
              </h3>

              <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0 max-h-[320px]">
                {activeCorridors.length === 0 ? (
                  <div className="py-16 text-center text-gray-500 text-xs">
                    No priority corridors currently active in the city grid.
                  </div>
                ) : (
                  activeCorridors.map((corr) => (
                    <div
                      key={corr.id}
                      onClick={() => handleSelectCorridor(corr)}
                      className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all duration-200 ${selectedCorridorId === corr.dispatch_id ? 'bg-emerald-600/10 border-emerald-500/40 shadow-inner' : 'bg-white/5 border-white/5 hover:border-white/10 hover:bg-white/[0.02]'}`}
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[9px] uppercase font-black text-emerald-400 tracking-wider">Priority Overrides Engaged</span>
                        <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">{corr.vehicle_id}</span>
                      </div>
                      <h4 className="text-xs font-bold text-white uppercase">{corr.incident_type.replace('_', ' ')}</h4>
                      <p className="text-[10px] text-gray-400 mt-1">Dispatched from: {corr.service_name}</p>

                      <div className="grid grid-cols-3 gap-2 mt-3 pt-2.5 border-t border-white/5 text-center text-[10px] text-gray-400">
                        <div>
                          <span>Normal ETA</span>
                          <strong className="block text-gray-300 mt-0.5">{corr.normal_eta}m</strong>
                        </div>
                        <div className="border-l border-white/5">
                          <span className="text-emerald-400 font-bold">Optimized ETA</span>
                          <strong className="block text-emerald-400 mt-0.5">{corr.optimized_eta}m</strong>
                        </div>
                        <div className="border-l border-white/5">
                          <span>Time Saved</span>
                          <strong className="block text-emerald-400 mt-0.5">+{corr.normal_eta - corr.optimized_eta}m</strong>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="panel p-4 sm:p-5 flex flex-col overflow-hidden shrink-0 h-[180px]">
              <h3 className="panel-header">Live GPS Telemetry Log</h3>
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 font-mono text-[9px] text-gray-400 min-h-0">
                {historyLoading ? (
                  <div className="text-center py-8">Loading logs...</div>
                ) : trackingHistory.length === 0 ? (
                  <div className="text-center py-8 text-gray-600">No recent GPS logs received.</div>
                ) : (
                  trackingHistory.map((log) => (
                    <div key={log.id} className="flex justify-between items-center border-b border-white/5 pb-1">
                      <span>[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                      <span className="text-white font-bold">{log.vehicle_id}</span>
                      <span className="text-emerald-400 font-semibold">
                        lat: {parseFloat(log.latitude).toFixed(4)}, lng: {parseFloat(log.longitude).toFixed(4)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-8 map-panel-wrap">
            <div className="mb-2 flex flex-col sm:flex-row justify-between sm:items-center gap-2 px-2 pb-1.5 shrink-0">
              <span className="text-xs font-bold text-gray-300">Real-Time City Traffic & Corridor Simulator Map</span>
              {trackingVehicle && (
                <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1.5 animate-pulse">
                  <Navigation size={12} /> Active Tracking: {trackingVehicle.id} ({trackingVehicle.status})
                </span>
              )}
            </div>

            <div className="flex-1 rounded-xl overflow-hidden shadow-inner border border-white/5 relative min-h-0">
              <MapPanel
                center={[12.9716, 77.5946]}
                zoom={12}
                routePoints={routePoints}
                corridorActive={selectedCorridorId !== null}
                signals={signals}
                trackingVehicle={trackingVehicle}
              />
            </div>
          </div>
        </div>

        <div className="panel p-4 sm:p-5 flex flex-col gap-4 min-h-0">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <h3 className="panel-header mb-0">Complete Travel History</h3>
            <div className="flex flex-wrap gap-2">
              {HISTORY_FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setHistoryFilter(item.id)}
                  className={`rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider border transition-colors ${
                    historyFilter === item.id
                      ? 'border-emerald-500/40 bg-emerald-600/10 text-emerald-300'
                      : 'border-white/10 bg-white/5 text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleHistorySearchSubmit} className="flex flex-col sm:flex-row gap-2">
            <input
              type="search"
              value={historySearch}
              onChange={(event) => setHistorySearch(event.target.value)}
              placeholder="Search by journey ID, incident ID, vehicle, service, or type..."
              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder:text-gray-500 focus:border-emerald-500/40 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-lg border border-emerald-500/20 bg-emerald-600/10 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-emerald-300 hover:bg-emerald-600/20"
            >
              Search
            </button>
          </form>

          <div className="overflow-x-auto rounded-xl border border-white/5">
            <table className="min-w-full text-left text-[11px]">
              <thead className="bg-white/[0.03] text-[10px] uppercase tracking-wider text-gray-400">
                <tr>
                  {SORT_COLUMNS.map((column) => (
                    <th key={column.key} className="px-3 py-3 font-bold whitespace-nowrap">
                      <button type="button" onClick={() => handleSort(column.key)} className="hover:text-emerald-300">
                        {column.label}{sortIndicator(column.key)}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {journeyLoading ? (
                  <tr>
                    <td colSpan={SORT_COLUMNS.length} className="px-3 py-8 text-center text-gray-500">
                      Loading travel history...
                    </td>
                  </tr>
                ) : journeyHistory.length === 0 ? (
                  <tr>
                    <td colSpan={SORT_COLUMNS.length} className="px-3 py-8 text-center text-gray-500">
                      No completed corridor journeys found for this filter.
                    </td>
                  </tr>
                ) : (
                  journeyHistory.map((journey) => (
                    <tr key={journey.journey_id} className="border-t border-white/5 hover:bg-white/[0.02]">
                      <td className="px-3 py-3 font-mono text-white">{journey.journey_id}</td>
                      <td className="px-3 py-3 font-mono">{journey.incident_id}</td>
                      <td className="px-3 py-3 font-mono text-emerald-300">{journey.vehicle_id}</td>
                      <td className="px-3 py-3 capitalize">{formatVehicleType(journey.vehicle_type)}</td>
                      <td className="px-3 py-3">{journey.service_name}</td>
                      <td className="px-3 py-3 whitespace-nowrap">{formatDateTime(journey.start_time)}</td>
                      <td className="px-3 py-3 whitespace-nowrap">{formatDateTime(journey.end_time)}</td>
                      <td className="px-3 py-3">{journey.optimized_travel_time}m</td>
                      <td className="px-3 py-3">{journey.normal_travel_time}m</td>
                      <td className="px-3 py-3 text-emerald-400 font-bold">{journey.time_saved}m</td>
                      <td className="px-3 py-3 capitalize">{journey.corridor_status.replace(/_/g, ' ')}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">
              Page {journeyPagination.page} of {journeyPagination.totalPages} · {journeyPagination.total} journeys
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={journeyPagination.page <= 1 || journeyLoading}
                onClick={() => handlePageChange(journeyPagination.page - 1)}
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-300 disabled:opacity-40"
              >
                <ChevronLeft size={14} /> Previous
              </button>
              <button
                type="button"
                disabled={journeyPagination.page >= journeyPagination.totalPages || journeyLoading}
                onClick={() => handlePageChange(journeyPagination.page + 1)}
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-300 disabled:opacity-40"
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}

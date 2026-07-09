import React from 'react';
import { ShieldAlert, MapPin, User, Clock, AlertOctagon } from 'lucide-react';

export default function EmergencyAlertModal({ alert, countdown, shouldShake, onView, onAcknowledge }) {
  if (!alert) return null;

  // Priority mapping based on incident type
  const getPriorityBadge = (type) => {
    switch (type) {
      case 'fire':
      case 'gas_leak':
      case 'building_collapse':
      case 'medical_emergency':
        return {
          label: 'CRITICAL',
          color: 'bg-red-500/15 border-red-500/30 text-red-400'
        };
      case 'accident':
        return {
          label: 'HIGH PRIORITY',
          color: 'bg-amber-500/15 border-amber-500/30 text-amber-400'
        };
      default:
        return {
          label: 'MEDIUM PRIORITY',
          color: 'bg-blue-500/15 border-blue-500/30 text-blue-400'
        };
    }
  };

  const priority = getPriorityBadge(alert.type);
  const reporter = alert.reporter_id ? `Citizen User (ID: #${alert.reporter_id})` : 'IoT Sensor Node';
  const time = new Date(alert.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[9999] bg-[#03060d]/90 backdrop-blur-lg p-4 transition-all duration-300">
      {/* Inline styles for shake animation keyframes */}
      <style>{`
        @keyframes custom-shake {
          0%, 100% { transform: scale(1) rotate(0deg); }
          10%, 30%, 50%, 70%, 90% { transform: translate(-6px, -2px) rotate(-1deg); }
          20%, 40%, 60%, 80% { transform: translate(6px, 2px) rotate(1deg); }
        }
        .shake-modal {
          animation: custom-shake 0.4s ease-in-out;
        }
        .pulse-border {
          box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4);
          animation: border-pulse 1.5s infinite cubic-bezier(0.66, 0, 0, 1);
        }
        @keyframes border-pulse {
          to {
            box-shadow: 0 0 0 16px rgba(239, 68, 68, 0);
          }
        }
      `}</style>

      {/* Main Console Box */}
      <div 
        className={`w-full max-w-2xl bg-[#090e18] border border-red-500/40 rounded-3xl overflow-hidden shadow-2xl pulse-border ${shouldShake ? 'shake-modal' : ''} transition-transform duration-300`}
      >
        {/* Massive Red Alert Header */}
        <div className="bg-gradient-to-r from-red-700 via-red-600 to-red-700 px-6 py-5 text-white flex items-center justify-between border-b border-red-500/20">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-xl animate-pulse">
              <ShieldAlert size={26} className="text-white" />
            </div>
            <div className="text-left">
              <span className="text-[10px] bg-white/25 px-2 py-0.5 rounded font-black tracking-wider uppercase leading-none">
                Emergency Alert
              </span>
              <h2 className="text-xl font-black uppercase tracking-tight mt-1 leading-none">
                Incoming {alert.type.replace('_', ' ')}
              </h2>
            </div>
          </div>
          <AlertOctagon size={32} className="text-white/80 animate-spin" style={{ animationDuration: '6s' }} />
        </div>

        {/* Console Details Body */}
        <div className="p-6 space-y-6">
          {/* Main Info Blocks */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/[0.02] border border-white/5 p-4 rounded-2xl text-left">
              <span className="text-[10px] uppercase text-gray-500 font-bold block tracking-wider">Incident Category</span>
              <span className="text-lg font-black text-white uppercase block mt-1">{alert.type.replace('_', ' ')}</span>
            </div>
            <div className="bg-white/[0.02] border border-white/5 p-4 rounded-2xl text-left flex flex-col justify-center">
              <span className="text-[10px] uppercase text-gray-500 font-bold block tracking-wider">Priority Code</span>
              <div>
                <span className={`inline-block px-2.5 py-0.5 border rounded-full text-[10px] font-black tracking-wider leading-none mt-2 ${priority.color}`}>
                  {priority.label}
                </span>
              </div>
            </div>
          </div>

          {/* Location details */}
          <div className="bg-white/[0.02] border border-white/5 p-4 rounded-2xl text-left space-y-3">
            <div className="flex items-start gap-3">
              <MapPin className="text-red-400 shrink-0 mt-0.5" size={18} />
              <div>
                <span className="text-[9px] uppercase text-gray-500 font-bold tracking-wider block">Coordinates / Location</span>
                <span className="text-white text-xs font-bold font-mono">
                  Latitude: {alert.latitude} | Longitude: {alert.longitude}
                </span>
              </div>
            </div>

            <div className="border-t border-white/5 pt-3 flex justify-between items-center text-xs">
              <div className="flex items-center gap-1.5 text-gray-400">
                <User size={14} className="text-blue-400" />
                <span>Reporter: <strong className="text-white">{reporter}</strong></span>
              </div>
              <div className="flex items-center gap-1.5 text-gray-400">
                <Clock size={14} className="text-amber-400" />
                <span>Reported At: <strong className="text-white font-mono">{time}</strong></span>
              </div>
            </div>
          </div>

          {/* Description Block */}
          {alert.description && (
            <div className="bg-[#03060c] border border-white/5 p-4.5 rounded-2xl text-left">
              <span className="text-[9px] uppercase text-gray-500 font-bold tracking-wider block mb-1">Details / Description</span>
              <p className="text-gray-300 text-xs italic">"{alert.description}"</p>
            </div>
          )}

          {/* Countdown & Escalation Warnings */}
          <div className="bg-red-500/5 border border-red-500/25 p-5 rounded-2xl flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-left">
              <h4 className="text-xs font-bold text-red-400 uppercase tracking-wide">
                Escalation Countdown Active
              </h4>
              <p className="text-[11px] text-gray-400 mt-1 max-w-sm">
                Incident will automatically escalate to the next tier of responders if unacknowledged.
              </p>
            </div>

            <div className="flex flex-col items-center">
              <span className="text-[10px] uppercase text-gray-400 font-bold tracking-widest mb-1">
                Time Remaining
              </span>
              <span className={`text-3xl font-black font-mono tracking-tight leading-none ${countdown <= 10 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                {countdown}s
              </span>
            </div>
          </div>
        </div>

        {/* Buttons / Footer Actions */}
        <div className="bg-[#04080e] px-6 py-5 border-t border-white/5 flex flex-col sm:flex-row gap-4">
          <button
            onClick={() => onView(alert.id)}
            className="flex-1 py-3 px-5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-gray-300 border border-white/10 active:scale-95 transition-all shadow-inner uppercase tracking-wider"
          >
            View Incident
          </button>
          
          <button
            onClick={() => onAcknowledge(alert.id)}
            className="flex-1 py-3 px-5 rounded-xl bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-xs font-black text-white shadow-lg active:scale-95 transition-all uppercase tracking-wider"
          >
            Acknowledge
          </button>
          
          <button
            disabled
            className="py-3 px-4 rounded-xl bg-white/[0.02] border border-white/5 text-[10px] font-bold text-gray-600 cursor-not-allowed uppercase"
            title="Disabled until incident is acknowledged"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

import React from 'react';
import { AlertTriangle } from 'lucide-react';

export default function EmergencyBanner({ alert }) {
  if (!alert) return null;

  return (
    <div 
      className="bg-gradient-to-r from-red-700 via-red-600 to-red-700 text-white py-2.5 px-4 text-xs font-black flex items-center justify-between border-b border-red-500/30 tracking-wide uppercase select-none animate-pulse"
      style={{ animationDuration: '1.2s' }}
    >
      <div className="flex items-center gap-2.5">
        <AlertTriangle size={15} className="text-white animate-bounce" />
        <span className="text-[11px]">
          CRITICAL ALERT: Unacknowledged {alert.type.replace('_', ' ')} reported at ({alert.latitude}, {alert.longitude}). Acknowledge immediately to silence sirens.
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="hidden sm:inline-block text-[9px] bg-white/20 border border-white/10 px-2 py-0.5 rounded-md font-bold tracking-widest font-mono">
          LEVEL ACTIVE
        </span>
        <span className="text-[9px] bg-black/20 px-2 py-0.5 rounded-md font-bold tracking-widest font-mono">
          ID: #{alert.id}
        </span>
      </div>
    </div>
  );
}

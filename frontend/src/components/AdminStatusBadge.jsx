import React from 'react';

export default function AdminStatusBadge({ status, onlineOperators = [] }) {
  const getStatusColor = (s) => {
    switch (s) {
      case 'online': return 'bg-emerald-500';
      case 'idle': return 'bg-amber-400 animate-pulse';
      case 'offline': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusLabel = (s) => {
    switch (s) {
      case 'online': return 'Online';
      case 'idle': return 'Idle';
      case 'offline': return 'Offline';
      default: return 'Offline';
    }
  };

  return (
    <div 
      className="flex items-center gap-2 bg-white/5 hover:bg-white/[0.08] border border-white/5 px-3 py-1.5 rounded-xl text-xs font-semibold select-none cursor-pointer group relative transition duration-200"
    >
      <span className={`w-2 h-2 rounded-full ${getStatusColor(status)}`}></span>
      <span className="text-gray-300 font-bold uppercase tracking-wider text-[10px]">
        {getStatusLabel(status)}
      </span>
      
      {/* Tooltip to display other active operators on the network */}
      {onlineOperators.length > 0 && (
        <div 
          className="absolute right-0 top-full mt-2 w-56 bg-[#090e18] border border-white/10 rounded-2xl p-3 shadow-2xl hidden group-hover:block z-50 text-left text-[11px] text-gray-400 space-y-2 pointer-events-none"
        >
          <span className="font-bold text-[9px] uppercase tracking-wider text-gray-500 block mb-1 pb-1 border-b border-white/5">
            Active System Operators ({onlineOperators.length})
          </span>
          <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
            {onlineOperators.map((op, idx) => (
              <div key={idx} className="flex justify-between items-center text-[10px]">
                <span className="truncate max-w-[120px] font-medium text-gray-300">
                  User #{op.userId}
                </span>
                <span className="flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${getStatusColor(op.status)}`}></span>
                  <span className="text-[8px] uppercase font-bold text-gray-500">
                    {op.role.replace('_admin', '')}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

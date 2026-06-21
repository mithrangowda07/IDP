import React from 'react';
import { Power } from 'lucide-react';

export default function DashboardShell({
  icon: Icon,
  iconClassName = 'bg-blue-600/10 text-blue-400 border-blue-500/20',
  title,
  subtitle,
  tabs = [],
  activeTab,
  onLogout,
  banner,
  children
}) {
  return (
    <div className="app-shell">
      <nav className="dashboard-nav">
        <div className="dashboard-nav-inner">
          <div className="flex items-center gap-3 min-w-0 shrink-0">
            <div className={`p-2.5 rounded-xl border shadow-inner shrink-0 ${iconClassName}`}>
              {Icon && <Icon size={20} />}
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-white leading-tight truncate">{title}</h1>
              {subtitle && (
                <p className="text-[11px] text-gray-400 truncate">{subtitle}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 w-full lg:w-auto min-w-0">
            {tabs.length > 0 && (
              <div className="tab-scroll flex-1 lg:flex-none">
                <div className="tab-group">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={tab.onClick || (() => tab.onSelect?.(tab.id))}
                      className={`tab-btn ${activeTab === tab.id ? 'tab-btn-active' : ''}`}
                    >
                      {tab.icon && <tab.icon size={13} className="shrink-0" />}
                      <span className="truncate">{tab.label}</span>
                      {tab.badge !== undefined && tab.badge !== null && (
                        <span className="tab-badge">{tab.badge}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={onLogout}
              className="btn-icon-danger shrink-0"
              title="Sign Out"
              aria-label="Sign out"
            >
              <Power size={18} />
            </button>
          </div>
        </div>
      </nav>

      {banner}

      <main className="dashboard-main">
        <div className="dashboard-content">
          {children}
        </div>
      </main>
    </div>
  );
}

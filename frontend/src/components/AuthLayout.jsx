import React from 'react';
import { ArrowLeft } from 'lucide-react';

export default function AuthLayout({
  children,
  title,
  subtitle,
  icon: Icon,
  accent = 'blue',
  onBack,
  maxWidth = 'md'
}) {
  const accentMap = {
    blue: 'glow-blue bg-blue-500/10 text-blue-400 border-blue-500/20',
    red: 'glow-red bg-red-500/10 text-red-400 border-red-500/20',
    emerald: 'glow-green bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
  };

  const widthMap = {
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl'
  };

  return (
    <div className="auth-page">
      <div className="auth-bg auth-bg-blue" />
      <div className="auth-bg auth-bg-red" />

      <div className={`auth-card glass-panel ${widthMap[maxWidth] || widthMap.md} ${accentMap[accent]?.split(' ')[0] || 'glow-blue'}`}>
        {onBack && (
          <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-5 transition-colors">
            <ArrowLeft size={16} /> Back to Login
          </button>
        )}

        {(Icon || title) && (
          <div className="text-center mb-7">
            {Icon && (
              <div className={`inline-flex p-3 rounded-2xl mb-3 border ${accentMap[accent] || accentMap.blue}`}>
                <Icon size={28} />
              </div>
            )}
            {title && <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">{title}</h1>}
            {subtitle && <p className="mt-2 text-sm text-gray-400 leading-relaxed">{subtitle}</p>}
          </div>
        )}

        {children}
      </div>
    </div>
  );
}

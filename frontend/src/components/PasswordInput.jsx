import React, { useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';

export default function PasswordInput({
  id,
  label,
  value,
  onChange,
  placeholder = 'Enter password',
  required = false,
  showIcon = true,
  className = '',
  inputClassName = '',
  labelClassName = 'block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2',
  hint,
  autoComplete = 'current-password'
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className={labelClassName}>
          {label}
        </label>
      )}
      <div className="relative">
        {showIcon && (
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 pointer-events-none">
            <Lock size={18} />
          </span>
        )}
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          required={required}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className={`w-full ${showIcon ? 'pl-10' : 'pl-4'} pr-11 py-3 rounded-xl glass-input text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 ${inputClassName}`}
        />
        <button
          type="button"
          onClick={() => setVisible((prev) => !prev)}
          className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-white transition-colors"
          aria-label={visible ? 'Hide password' : 'Show password'}
          tabIndex={-1}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {hint && <p className="text-[11px] text-gray-500 mt-1.5">{hint}</p>}
    </div>
  );
}

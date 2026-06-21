import React from 'react';

export default function FormAlert({ type = 'error', children, className = '' }) {
  if (!children) return null;

  const styles = {
    error: 'alert-error',
    success: 'alert-success',
    info: 'alert-info'
  };

  return (
    <div className={`${styles[type] || styles.error} ${className}`} role="alert">
      {children}
    </div>
  );
}

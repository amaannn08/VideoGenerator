import React from 'react';

export function Spinner({ size = 14, color = 'border-[var(--amber)]' }) {
  return (
    <div
      style={{ width: size, height: size }}
      className={`rounded-full border-2 ${color} border-t-transparent animate-spin flex-shrink-0`}
    />
  );
}

export function UIButton({
  onClick,
  disabled,
  loading,
  children,
  variant = 'primary',
  className = '',
  type = 'button',
}) {
  const variantClass = {
    primary:       'btn btn-amber',
    ghost:         'btn btn-ghost',
    outline:       'btn btn-outline',
    'outline-amber': 'btn btn-outline-amber',
    danger:        'btn btn-danger',
    success:       'btn btn-success',
    subtle:        'btn btn-outline',
  }[variant] || 'btn btn-amber';

  const spinnerColor = ['primary'].includes(variant)
    ? 'border-[#080910]'
    : 'border-[var(--amber)]';

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`${variantClass} ${className}`}
    >
      {loading && <Spinner size={13} color={spinnerColor} />}
      {children}
    </button>
  );
}

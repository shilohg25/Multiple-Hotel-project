'use client';

export function PrintButton({ label = 'Print', className = '' }: { label?: string; className?: string }) {
  return (
    <button type="button" className={`btn-primary print-hidden ${className}`} onClick={() => window.print()}>
      {label}
    </button>
  );
}

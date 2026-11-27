'use client';

import { useEffect } from 'react';

export function ScrollToHash() {
  useEffect(() => {
    const id = window.location.hash.replace(/^#/, '');
    if (!id) return;
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ block: 'start' });
  }, []);
  return null;
}

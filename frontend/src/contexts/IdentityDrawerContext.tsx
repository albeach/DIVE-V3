"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export interface IdentityUserMin {
  uniqueID?: string | null;
  clearance?: string | null;
  countryOfAffiliation?: string | null;
  acpCOI?: string[] | null;
}

interface IdentityDrawerContextValue {
  isOpen: boolean;
  open: (user?: IdentityUserMin) => void;
  close: () => void;
  user?: IdentityUserMin;
}

const IdentityDrawerContext = createContext<IdentityDrawerContextValue | undefined>(undefined);

export function IdentityDrawerProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState<IdentityUserMin | undefined>(undefined);

  const open = useCallback((u?: IdentityUserMin) => {
    setUser(u);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => setIsOpen(false), []);

  // Cmd/Ctrl+K shortcut to open drawer
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') { // Cmd/Ctrl+I for Identity
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const value = useMemo(() => ({ isOpen, open, close, user }), [isOpen, open, close, user]);
  return (
    <IdentityDrawerContext.Provider value={value}>
      {children}
    </IdentityDrawerContext.Provider>
  );
}

export function useIdentityDrawer(): IdentityDrawerContextValue {
  const ctx = useContext(IdentityDrawerContext);
  if (!ctx) {
    throw new Error('useIdentityDrawer must be used within IdentityDrawerProvider');
  }
  return ctx;
}

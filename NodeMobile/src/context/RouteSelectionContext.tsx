// src/context/RouteSelectionContext.tsx
import React, { createContext, useContext, useState, ReactNode } from 'react';

interface RouteSelectionContextType {
  selectedRouteIds: number[];
  setSelectedRouteIds: (ids: number[]) => void;
  toggleRouteId: (id: number) => void;
  clearSelection: () => void;
}

const RouteSelectionContext = createContext<RouteSelectionContextType | undefined>(undefined);

export const RouteSelectionProvider = ({ children }: { children: ReactNode }) => {
  const [selectedRouteIds, setSelectedRouteIds] = useState<number[]>([]);

  const toggleRouteId = (id: number) => {
    setSelectedRouteIds(prev =>
      prev.includes(id) ? prev.filter(rid => rid !== id) : [...prev, id]
    );
  };

  const clearSelection = () => setSelectedRouteIds([]);

  return (
    <RouteSelectionContext.Provider
      value={{ selectedRouteIds, setSelectedRouteIds, toggleRouteId, clearSelection }}
    >
      {children}
    </RouteSelectionContext.Provider>
  );
};

export const useRouteSelection = (): RouteSelectionContextType => {
  const ctx = useContext(RouteSelectionContext);
  if (!ctx) {
    throw new Error('useRouteSelection must be used within a RouteSelectionProvider');
  }
  return ctx;
};

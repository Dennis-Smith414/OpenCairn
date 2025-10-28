// src/context/RouteSelectionContext.tsx
import React, { createContext, useContext, useState, useMemo, ReactNode } from "react";

export interface SelectedRoute {
  id: number;
  name: string;
  color?: string;
}

interface RouteSelectionContextType {
  selectedRoutes: SelectedRoute[];
  selectedRouteIds: number[];
  setSelectedRoutes: (routes: SelectedRoute[]) => void;
  toggleRoute: (route: SelectedRoute) => void;
  clearSelection: () => void;
}

const RouteSelectionContext = createContext<RouteSelectionContextType | undefined>(
  undefined
);
const PALETTE = ["#1E88E5","#E53935","#8E24AA","#00897B","#FDD835","#5E35B1","#43A047","#FB8C00"];

export const RouteSelectionProvider = ({ children }: { children: ReactNode }) => {
  const [selectedRoutes, setSelectedRoutes] = useState<SelectedRoute[]>([]);

  const nextColor = useMemo(() => {
      return (idx: number) => PALETTE[idx % PALETTE.length];
    }, []);

    const toggleRoute = (route: SelectedRoute) => {
        setSelectedRoutes(prev => {
          const exists = prev.find(r => r.id === route.id);
          if (exists) {
            return prev.filter(r => r.id !== route.id);
          } else {
            const color = route.color ?? nextColor(prev.length);
            return [...prev, { ...route, color }];
          }
        });
  };

  const clearSelection = () => setSelectedRoutes([]);

  const selectedRouteIds = selectedRoutes.map((r) => r.id);

  return (
    <RouteSelectionContext.Provider
      value={{ selectedRoutes, selectedRouteIds, setSelectedRoutes, toggleRoute, clearSelection }}
    >
      {children}
    </RouteSelectionContext.Provider>
  );
};

export const useRouteSelection = (): RouteSelectionContextType => {
  const ctx = useContext(RouteSelectionContext);
  if (!ctx) throw new Error("useRouteSelection must be used within a RouteSelectionProvider");
  return ctx;
};

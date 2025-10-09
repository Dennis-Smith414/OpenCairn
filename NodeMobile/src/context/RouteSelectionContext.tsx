// src/context/RouteSelectionContext.tsx
import React, { createContext, useContext, useState, ReactNode } from "react";

export interface SelectedRoute {
  id: number;
  name: string;
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

export const RouteSelectionProvider = ({ children }: { children: ReactNode }) => {
  const [selectedRoutes, setSelectedRoutes] = useState<SelectedRoute[]>([]);

  const toggleRoute = (route: SelectedRoute) => {
    setSelectedRoutes((prev) =>
      prev.some((r) => r.id === route.id)
        ? prev.filter((r) => r.id !== route.id)
        : [...prev, route]
    );
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

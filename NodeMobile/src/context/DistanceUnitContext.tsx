import React, { createContext, useContext, useState, ReactNode } from "react";

// Supported distance units
export type DistanceUnit = "mi" | "km";

interface DistanceContextProps {
  unit: DistanceUnit;
  setUnit: (unit: DistanceUnit) => void;
  convertDistance: (meters: number) => string;
}

const DistanceUnitContext = createContext<DistanceContextProps | undefined>(
  undefined
);

export const DistanceUnitProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [unit, setUnit] = useState<DistanceUnit>("mi");

  const convertDistance = (meters: number): string => {
    if (isNaN(meters)) return "";
    const value =
      unit === "mi" ? meters / 1609.34 : meters / 1000; // miles vs kilometers
    const label = unit === "mi" ? "mi" : "km";
    return `${value.toFixed(2)} ${label}`;
  };

  return (
    <DistanceUnitContext.Provider value={{ unit, setUnit, convertDistance }}>
      {children}
    </DistanceUnitContext.Provider>
  );
};

export const useDistanceUnit = (): DistanceContextProps => {
  const context = useContext(DistanceUnitContext);
  if (!context) {
    throw new Error("useDistanceUnit must be used within DistanceUnitProvider");
  }
  return context;
};

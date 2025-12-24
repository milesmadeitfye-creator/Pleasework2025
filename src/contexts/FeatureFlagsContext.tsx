import React, { createContext, useContext } from "react";
import { FeatureFlags } from "../lib/featureFlags";

type FeatureFlagsContextValue = {
  flags: FeatureFlags | null;
  loading: boolean;
};

const FeatureFlagsContext = createContext<FeatureFlagsContextValue>({
  flags: null,
  loading: true,
});

export function FeatureFlagsProvider({
  value,
  children,
}: {
  value: FeatureFlagsContextValue;
  children: React.ReactNode;
}) {
  return (
    <FeatureFlagsContext.Provider value={value}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

export function useFeatureFlagsContext() {
  return useContext(FeatureFlagsContext);
}

// src/hooks/useMetaPageView.ts
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { trackPageView } from "../lib/ownerMetaPixel";

export function useMetaPageView() {
  const location = useLocation();

  useEffect(() => {
    // Fire web PageView event on route change
    trackPageView();
  }, [location.pathname, location.search]);
}

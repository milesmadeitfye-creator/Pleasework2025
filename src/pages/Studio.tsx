import React from "react";

const GhosteStudio: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-ghoste-bg">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold mb-2 text-white">Ghoste Studio is taking a breather 👻</h1>
        <p className="text-sm text-gray-400">
          We've temporarily disabled the Ghoste Studio, AI video render, and stock video generator
          while we upgrade performance. All core tools like smart links, presaves, email capture,
          Ghoste AI, and listening parties are still live.
        </p>
      </div>
    </div>
  );
};

export default GhosteStudio;

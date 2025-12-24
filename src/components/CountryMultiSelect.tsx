import { useState, useRef, useEffect } from "react";
import { ChevronDown, X } from "lucide-react";
import {
  TARGETING_COUNTRIES,
  HIGH_PERFORMING_COUNTRIES,
  type TargetCountry,
} from "../lib/adCampaignConstants";

interface CountryMultiSelectProps {
  selectedCodes: string[];
  onChange: (codes: string[]) => void;
  className?: string;
}

export function CountryMultiSelect({
  selectedCodes,
  onChange,
  className = "",
}: CountryMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredCountries = TARGETING_COUNTRIES.filter((country) =>
    country.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedCountries = TARGETING_COUNTRIES.filter((c) =>
    selectedCodes.includes(c.code)
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSearchTerm("");
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const toggleCountry = (code: string) => {
    if (selectedCodes.includes(code)) {
      onChange(selectedCodes.filter((c) => c !== code));
    } else {
      onChange([...selectedCodes, code]);
    }
  };

  const removeCountry = (code: string) => {
    onChange(selectedCodes.filter((c) => c !== code));
  };

  const setHighPerforming = () => {
    onChange(HIGH_PERFORMING_COUNTRIES.map((c) => c.code));
  };

  return (
    <div className={className}>
      {/* Quick Action Buttons */}
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={setHighPerforming}
          className="px-4 py-2 bg-blue-600/90 hover:bg-blue-600 text-white text-sm rounded-full transition-colors shadow-md shadow-blue-500/20"
        >
          High Performing Countries (recommended)
        </button>
      </div>

      {/* Multi-Select Dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-800 border border-gray-700 hover:border-blue-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-lg text-left transition-all text-white"
        >
          <span className="truncate">
            {selectedCodes.length === 0
              ? "Select countries"
              : `${selectedCodes.length} ${
                  selectedCodes.length === 1 ? "country" : "countries"
                } selected`}
          </span>
          <ChevronDown
            className={`ml-2 h-4 w-4 flex-shrink-0 transition-transform ${
              isOpen ? "transform rotate-180" : ""
            }`}
          />
        </button>

        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl">
            {/* Search Input */}
            <div className="p-2 border-b border-gray-700">
              <input
                type="text"
                placeholder="Search countries..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            {/* Country List */}
            <div className="max-h-60 overflow-y-auto">
              {filteredCountries.length === 0 ? (
                <div className="px-4 py-3 text-gray-400 text-sm">
                  No countries found
                </div>
              ) : (
                filteredCountries.map((country) => {
                  const isSelected = selectedCodes.includes(country.code);
                  return (
                    <label
                      key={country.code}
                      className="flex items-center px-4 py-2.5 hover:bg-gray-700 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleCountry(country.code)}
                        className="mr-3 h-4 w-4 rounded border-gray-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-gray-800"
                      />
                      <span className="text-white text-sm">{country.name}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Selected Countries Pills */}
      {selectedCountries.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {selectedCountries.map((country) => (
            <span
              key={country.code}
              className="inline-flex items-center px-3 py-1 bg-blue-600/20 border border-blue-500/30 rounded-full text-sm text-blue-300"
            >
              {country.name}
              <button
                type="button"
                onClick={() => removeCountry(country.code)}
                className="ml-2 hover:text-white transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

interface StyledSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  prefix?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

export function StyledSelect({
  value,
  onChange,
  options,
  placeholder = "Select an option",
  prefix,
  disabled = false,
  className = "",
}: StyledSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-left transition-all text-sm shadow-md ${
          disabled
            ? "border-gray-700 bg-gray-900 text-gray-500 cursor-not-allowed"
            : "border-blue-500/40 bg-[#050712] text-white/90 shadow-blue-500/10 focus:ring-2 focus:ring-blue-500/70 focus:border-blue-400/80 hover:border-blue-400/60"
        }`}
      >
        <span className="flex items-center flex-1 min-w-0">
          {prefix}
          <span className="truncate">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </span>
        <ChevronDown
          className={`ml-2 h-4 w-4 flex-shrink-0 transition-transform ${
            isOpen ? "transform rotate-180" : ""
          }`}
        />
      </button>

      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-[#050712] border border-blue-500/30 rounded-xl shadow-2xl shadow-blue-900/50 max-h-60 overflow-y-auto">
          {options.length === 0 ? (
            <div className="px-4 py-3 text-gray-400 text-sm">
              No options available
            </div>
          ) : (
            options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                  option.value === value
                    ? "bg-blue-600/90 text-white"
                    : "hover:bg-blue-900/30 text-white/90"
                }`}
              >
                {option.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

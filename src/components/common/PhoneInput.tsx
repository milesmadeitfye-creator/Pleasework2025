import { Phone } from 'lucide-react';

export interface PhoneInputProps {
  value: string;
  countryCode: string;
  onChangePhone: (value: string) => void;
  onChangeCountryCode: (value: string) => void;
  className?: string;
}

const COUNTRIES = [
  { name: 'United States', code: '1', flag: '🇺🇸' },
  { name: 'Canada', code: '1', flag: '🇨🇦' },
  { name: 'United Kingdom', code: '44', flag: '🇬🇧' },
  { name: 'Australia', code: '61', flag: '🇦🇺' },
  { name: 'Germany', code: '49', flag: '🇩🇪' },
];

export default function PhoneInput({
  value,
  countryCode,
  onChangePhone,
  onChangeCountryCode,
  className = '',
}: PhoneInputProps) {
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    const digitsOnly = input.replace(/\D/g, '');
    onChangePhone(digitsOnly);
  };

  const formatPhoneDisplay = (digits: string) => {
    if (!digits) return '';
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 10)}`;
  };

  return (
    <div className={`flex gap-2 ${className}`}>
      <div className="w-40">
        <select
          value={countryCode}
          onChange={(e) => onChangeCountryCode(e.target.value)}
          className="w-full rounded bg-neutral-900/60 border border-neutral-700 px-3 py-2 text-sm"
        >
          {COUNTRIES.map((country) => (
            <option key={`${country.code}-${country.name}`} value={country.code}>
              {country.flag} +{country.code}
            </option>
          ))}
        </select>
      </div>
      <div className="flex-1 relative">
        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="tel"
          value={formatPhoneDisplay(value)}
          onChange={handlePhoneChange}
          placeholder="703 479 6764"
          className="w-full rounded bg-neutral-900/60 border border-neutral-700 pl-10 pr-3 py-2 text-sm"
        />
      </div>
    </div>
  );
}

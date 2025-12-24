import React from 'react';
import type { ShowLinkConfig } from '../../types/links';
import { Calendar, MapPin, Clock, Ticket, Info } from 'lucide-react';

type ShowLinkFieldsProps = {
  value: ShowLinkConfig;
  onChange: (config: ShowLinkConfig) => void;
};

export function ShowLinkFields({ value, onChange }: ShowLinkFieldsProps) {
  const update = (field: keyof ShowLinkConfig, val: any) => {
    onChange({ ...value, [field]: val });
  };

  return (
    <div className="space-y-5">
      {/* Show Title */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
          <Calendar className="w-4 h-4" />
          Show Title *
        </label>
        <input
          type="text"
          value={value.showTitle || ''}
          onChange={(e) => update('showTitle', e.target.value)}
          placeholder="e.g., 'Album Release Show'"
          className="w-full px-4 py-2.5 bg-gray-900/80 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
          required
        />
      </div>

      {/* Venue Name */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
          <MapPin className="w-4 h-4" />
          Venue Name
        </label>
        <input
          type="text"
          value={value.venueName || ''}
          onChange={(e) => update('venueName', e.target.value)}
          placeholder="e.g., 'The Roxy Theatre'"
          className="w-full px-4 py-2.5 bg-gray-900/80 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
        />
      </div>

      {/* City */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
          <MapPin className="w-4 h-4" />
          City
        </label>
        <input
          type="text"
          value={value.city || ''}
          onChange={(e) => update('city', e.target.value)}
          placeholder="e.g., 'Los Angeles, CA'"
          className="w-full px-4 py-2.5 bg-gray-900/80 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
        />
      </div>

      {/* Address */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
          <MapPin className="w-4 h-4" />
          Full Address
        </label>
        <input
          type="text"
          value={value.address || ''}
          onChange={(e) => update('address', e.target.value)}
          placeholder="e.g., '9009 Sunset Blvd, West Hollywood, CA 90069'"
          className="w-full px-4 py-2.5 bg-gray-900/80 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
        />
      </div>

      {/* Date & Time */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
            <Calendar className="w-4 h-4" />
            Show Date & Time *
          </label>
          <input
            type="datetime-local"
            value={value.dateIso || ''}
            onChange={(e) => update('dateIso', e.target.value)}
            className="w-full px-4 py-2.5 bg-gray-900/80 border border-gray-700 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            required
          />
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
            <Clock className="w-4 h-4" />
            Doors Open Time
          </label>
          <input
            type="datetime-local"
            value={value.doorsTimeIso || ''}
            onChange={(e) => update('doorsTimeIso', e.target.value || null)}
            className="w-full px-4 py-2.5 bg-gray-900/80 border border-gray-700 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
          />
        </div>
      </div>

      {/* Ticket URL */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
          <Ticket className="w-4 h-4" />
          Ticket Link
        </label>
        <input
          type="url"
          value={value.ticketUrl || ''}
          onChange={(e) => update('ticketUrl', e.target.value)}
          placeholder="https://ticketmaster.com/..."
          className="w-full px-4 py-2.5 bg-gray-900/80 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
        />
        <p className="text-xs text-gray-500 mt-1.5">
          Add a link to buy tickets (Ticketmaster, Eventbrite, etc.)
        </p>
      </div>

      {/* Additional Info */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
          <Info className="w-4 h-4" />
          Additional Info
        </label>
        <textarea
          value={value.additionalInfo || ''}
          onChange={(e) => update('additionalInfo', e.target.value)}
          placeholder="Special guests, age restrictions, parking info, etc."
          rows={3}
          className="w-full px-4 py-2.5 bg-gray-900/80 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors resize-none"
        />
      </div>
    </div>
  );
}

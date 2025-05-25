import React from 'react';

export default function SectionHeader({ title, sortOption, onSortChange }) {
  return (
    <div className="flex justify-between items-center mb-2">
      <h3 className="text-lg font-medium text-gray-700">{title}</h3>
      
      <select
        value={sortOption}
        onChange={(e) => onSortChange(e.target.value)}
        className="text-sm px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 border-none focus:ring-2 focus:ring-blue-500 focus:outline-none"
      >
        <option value="default">Default Order</option>
        <option value="name">Sort by Name</option>
        <option value="completion-asc">Least Complete</option>
        <option value="completion-desc">Most Complete</option>
      </select>
    </div>
  );
}

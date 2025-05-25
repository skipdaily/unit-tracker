import React, { useState } from 'react';
import DailyCompletionModal from './ui/DailyCompletionModal';
import { Button } from './ui/button';

export default function SectionHeader({ title, sortOption, onSortChange, completions = [] }) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Filter completions for today only
  const getTodayCompletions = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Group by section
    const groupedCompletions = completions
      .filter(item => new Date(item.completedAt) >= today)
      .reduce((acc, item) => {
        if (!acc[item.sectionId]) {
          acc[item.sectionId] = {
            name: item.sectionName,
            items: []
          };
        }
        acc[item.sectionId].items.push(item);
        return acc;
      }, {});
      
    return Object.values(groupedCompletions);
  };

  return (
    <div className="flex justify-between items-center mb-2">
      <h3 className="text-lg font-medium text-gray-700">{title}</h3>
      
      <div className="flex items-center gap-3">
        <Button 
          onClick={() => setIsModalOpen(true)}
          variant="outline"
          className="text-sm"
          size="sm"
        >
          Daily Completion
        </Button>
        
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
      
      <DailyCompletionModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        completions={getTodayCompletions()}
      />
    </div>
  );
}

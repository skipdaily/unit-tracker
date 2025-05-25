import { useState } from "react";
import SectionHeader from "../components/SectionHeader";

export default function HomePage() {
  const [sortOption, setSortOption] = useState("default");
  
  // Get all completions with relevant data
  const getAllCompletions = () => {
    const completions = [];
    
    sections.forEach(section => {
      section.items
        .filter(item => item.completed)
        .forEach(item => {
          completions.push({
            id: item.id,
            title: item.title,
            description: item.description || "",
            completedAt: item.completedAt || new Date().toISOString(),
            sectionId: section.id,
            sectionName: section.name
          });
        });
    });
    
    return completions;
  };

  return (
    <div className="flex min-h-screen bg-gray-50 flex-col p-6">
      {/* ...existing code... */}
      
      <div className="bg-white p-6 rounded-lg shadow-md space-y-6 mt-6">
        <SectionHeader 
          title="Section Progress" 
          sortOption={sortOption}
          onSortChange={setSortOption}
          completions={getAllCompletions()}
        />
        
        {/* ...existing code... */}
      </div>
    </div>
  );
}
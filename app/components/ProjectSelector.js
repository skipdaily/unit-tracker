"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Search } from "lucide-react";

export default function ProjectSelector({ onProjectSelect, apiToken }) {
  const [filterTerm, setFilterTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [allProjects, setAllProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [error, setError] = useState(null);
  
  // Fetch all projects to allow for client-side filtering
  const fetchAllProjects = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Get the API token from props or local storage
      const tokenToUse = apiToken || localStorage.getItem('companycamApiToken') || sessionStorage.getItem('companycamApiToken');
      
      if (!tokenToUse) {
        console.error("API token not found");
        setAllProjects([]);
        setIsLoading(false);
        return;
      }
      
      // Make the API request - get all projects
      // In a production app with many projects, you might need pagination
      const response = await fetch(`https://api.companycam.com/v2/projects?limit=100`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${tokenToUse}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Map the API response to our project structure
      const projects = formatProjects(data);
      
      setAllProjects(projects);
    } catch (error) {
      console.error("Error fetching projects:", error);
      setAllProjects([]);
      setError(`Error fetching projects: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [apiToken]);
  
  // Load all projects on component mount
  useEffect(() => {
    if (apiToken) {
      fetchAllProjects();
    }
  }, [apiToken, fetchAllProjects]);

  // Helper function to format project data consistently
  const formatProjects = (projectsData) => {
    return projectsData.map(project => {
      // Format the address if it's an object, otherwise use a default
      let formattedAddress = 'No address provided';
      
      if (project.address) {
        if (typeof project.address === 'string') {
          formattedAddress = project.address;
        } else if (typeof project.address === 'object') {
          // Format address from object properties
          const addr = project.address;
          const addressParts = [];
          
          if (addr.street_address_1) addressParts.push(addr.street_address_1);
          if (addr.street_address_2) addressParts.push(addr.street_address_2);
          
          let cityStateZip = '';
          if (addr.city) cityStateZip += addr.city;
          if (addr.state) cityStateZip += cityStateZip ? `, ${addr.state}` : addr.state;
          if (addr.postal_code) cityStateZip += cityStateZip ? ` ${addr.postal_code}` : addr.postal_code;
          
          if (cityStateZip) addressParts.push(cityStateZip);
          if (addr.country) addressParts.push(addr.country);
          
          formattedAddress = addressParts.join(', ') || formattedAddress;
        }
      }
      
      return {
        id: project.id,
        name: project.name || 'Unnamed Project',
        address: formattedAddress
      };
    });
  };

  // Filter projects as user types
  const filteredProjects = useMemo(() => {
    if (!filterTerm.trim()) {
      // If no filter term, show the first 10 projects
      return allProjects.slice(0, 10);
    }
    
    const lowercaseTerm = filterTerm.toLowerCase();
    
    // First, find exact matches at start of name
    const startsWithMatches = allProjects.filter(project => 
      project.name.toLowerCase().startsWith(lowercaseTerm)
    );
    
    // Then find projects that contain the term anywhere in the name or address
    const containsMatches = allProjects.filter(project => 
      !project.name.toLowerCase().startsWith(lowercaseTerm) && 
      (project.name.toLowerCase().includes(lowercaseTerm) || 
       project.address.toLowerCase().includes(lowercaseTerm))
    );
    
    // Combine results with priority for exact prefix matches
    return [...startsWithMatches, ...containsMatches];
  }, [allProjects, filterTerm]);

  const handleFilterChange = (e) => {
    setFilterTerm(e.target.value);
  };

  const handleProjectSelect = (project) => {
    setSelectedProject(project);
    onProjectSelect(project);
    
    // Store the selected project in localStorage for debugging tools
    try {
      localStorage.setItem('selectedProject', JSON.stringify(project));
    } catch (err) {
      console.warn("Failed to store selected project in localStorage:", err);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-8">
      <h2 className="text-xl font-semibold text-gray-700 mb-4">Project Selection</h2>
      
      <div className="mb-4">
        <div className="relative">
          <input
            type="text"
            value={filterTerm}
            onChange={handleFilterChange}
            placeholder="Start typing to filter projects..."
            className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
            <Search size={18} className="text-gray-400" />
          </div>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Type to instantly filter projects by name or address.
          {allProjects.length > 0 && !filterTerm && ` Showing ${Math.min(10, allProjects.length)} of ${allProjects.length} projects.`}
        </p>
      </div>
      
      {isLoading ? (
        <div className="py-4 text-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto"></div>
        </div>
      ) : error ? (
        <div className="py-3 text-center">
          <p className="text-red-500 text-sm">{error}</p>
          <button 
            onClick={fetchAllProjects}
            className="mt-2 px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-xs"
          >
            Retry
          </button>
        </div>
      ) : allProjects.length === 0 && !isLoading ? (
        <div className="py-4 text-center">
          <p className="text-gray-600">No projects found</p>
        </div>
      ) : (
        <div className="overflow-hidden">
          {filteredProjects.length > 0 ? (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
              {filteredProjects.map(project => (
                <div 
                  key={project.id}
                  className={`p-3 border rounded-md cursor-pointer hover:bg-gray-50 transition-colors
                    ${selectedProject?.id === project.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}
                  onClick={() => handleProjectSelect(project)}
                >
                  <h3 className="font-medium text-gray-800">{project.name}</h3>
                  <p className="text-sm text-gray-600">{project.address}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-4 text-center">
              <p className="text-gray-600">No projects found matching &quot;{filterTerm}&quot;</p>
            </div>
          )}
        </div>
      )}
      
      {selectedProject && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-md">
          <h3 className="font-medium text-gray-800">Selected Project:</h3>
          <p className="text-gray-700">{selectedProject.name}</p>
          <p className="text-sm text-gray-600">{selectedProject.address}</p>
        </div>
      )}
    </div>
  );
}

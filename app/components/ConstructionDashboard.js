// filepath: /Users/thomasgould/Desktop/Unit tracker/unit-tracker/app/components/ConstructionDashboard.js
"use client";

import { useState, useEffect } from "react";
import ProjectSelector from "./ProjectSelector";
import MinimalChecklist from "./MinimalChecklist";
import ApiDebugger from "./ApiDebugger";

export default function ConstructionDashboard() {
  // API Integration state
  const [apiConfigured, setApiConfigured] = useState(false);
  const [apiStatus, setApiStatus] = useState("Not connected");
  const [showApiConfig, setShowApiConfig] = useState(false);
  const [apiToken, setApiToken] = useState("");
  const [selectedProject, setSelectedProject] = useState(null);
  
  // Connect to API
  const connectToApi = (e) => {
    e.preventDefault();
    
    if (apiToken.trim()) {
      try {
        // Store API token securely (in a real app, this would be more secure)
        localStorage.setItem('companycamApiToken', apiToken);
        // You might also store it in sessionStorage for temporary use
        sessionStorage.setItem('companycamApiToken', apiToken);
        
        // Validate the token by making a test API call
        validateApiToken(apiToken);
      } catch (error) {
        console.error("Error storing API token:", error);
        setApiStatus("Error connecting");
      }
    } else {
      setApiStatus("Invalid token");
    }
  };
  
  // Validate the API token by making a test request
  const validateApiToken = async (token) => {
    try {
      // Use the projects endpoint for validation (more likely to exist)
      const response = await fetch('https://api.companycam.com/v2/projects?limit=1', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage;
        
        try {
          // Try to parse as JSON for structured error messages
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.message || errorJson.error || `API error: ${response.status}`;
        } catch {
          // If not JSON, use the raw text or status code
          errorMessage = errorText || `API error: ${response.status}`;
        }
        
        throw new Error(errorMessage);
      }
      
      // If successful, update the app state
      setApiConfigured(true);
      setApiStatus("Connected");
      setShowApiConfig(false);
      
      console.log("Connected to CompanyCam API successfully");
    } catch (error) {
      console.error("Error validating API token:", error.message);
      // Show more specific error messages to the user
      if (error.message.includes('404')) {
        setApiStatus("API endpoint not found");
      } else if (error.message.includes('401') || error.message.includes('403')) {
        setApiStatus("Invalid API token");
      } else {
        setApiStatus(`Authentication failed: ${error.message}`);
      }
      localStorage.removeItem('companycamApiToken');
      sessionStorage.removeItem('companycamApiToken');
    }
  };

  // Check for stored API token on component mount
  useEffect(() => {
    const storedToken = localStorage.getItem('companycamApiToken') || sessionStorage.getItem('companycamApiToken');
    
    if (storedToken) {
      setApiToken(storedToken);
      validateApiToken(storedToken);
    }
  }, []);

  // Handle project selection
  const handleProjectSelect = (project) => {
    // Ensure the project has the expected format before setting it
    if (project && typeof project === 'object' && project.id) {
      // Make sure name is a string
      if (typeof project.name !== 'string') {
        project.name = 'Unnamed Project';
      }
      
      // If address is an object, convert it to a string
      if (project.address && typeof project.address === 'object') {
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
        
        project.address = addressParts.join(', ') || 'No address provided';
      }
      
      setSelectedProject(project);
      console.log("Selected project:", project);
    } else {
      console.error("Invalid project data received:", project);
    }
  };

  return (
    <div className="flex flex-col p-6 bg-gray-50 min-h-screen">
      <header className="mb-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">CompanyCam Checklist Extractor</h1>
            <p className="text-gray-600">Extract and manage construction checklists from your CompanyCam projects</p>
          </div>
          <div className="flex items-center">
            <div className="text-sm mr-4 text-gray-600">CompanyCam API: <span className={apiStatus === "Error loading photos" ? "text-red-500" : "text-green-500"}>{apiStatus}</span></div>
            {!apiConfigured && (
              <button 
                onClick={() => setShowApiConfig(!showApiConfig)}
                className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
              >
                Connect API
              </button>
            )}
          </div>
        </div>
        
        {showApiConfig && (
          <div className="mt-4 p-4 bg-white rounded-lg shadow-md">
            <h3 className="text-lg font-medium mb-2">API Configuration</h3>
            <form onSubmit={connectToApi}>
              <div className="flex gap-2">
                <input 
                  type="text"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  placeholder="Enter your CompanyCam API token"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button 
                  type="submit"
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  Connect
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                You can get your API token from your CompanyCam account settings.
              </p>
            </form>
          </div>
        )}
      </header>
      
      {apiConfigured ? (
        <>
          <ProjectSelector onProjectSelect={handleProjectSelect} apiToken={apiToken} />
          <MinimalChecklist project={selectedProject} apiToken={apiToken} />
          {/* Add the API Debugger component for development purposes */}
          <ApiDebugger apiToken={apiToken} />
        </>
      ) : (
        <div className="bg-white rounded-lg shadow-md p-8 text-center">
          <p className="text-gray-600 mb-4">Please connect to the CompanyCam API to access your projects and checklists.</p>
          <button 
            onClick={() => setShowApiConfig(true)}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Connect API
          </button>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";

export default function ApiDebugger({ apiToken }) {
  const [endpoint, setEndpoint] = useState('');
  const [response, setResponse] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showDebugger, setShowDebugger] = useState(false);

  const testEndpoint = async (e) => {
    e.preventDefault();
    if (!endpoint.trim()) return;
    
    setIsLoading(true);
    setError(null);
    setResponse(null);
    
    try {
      // Add base URL if needed
      const url = endpoint.startsWith('http') 
        ? endpoint 
        : `https://api.companycam.com/v2/${endpoint.startsWith('/') ? endpoint.substr(1) : endpoint}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
      
      const data = await response.json();
      
      // Format the JSON response for readability
      setResponse({
        status: response.status,
        data: data
      });
    } catch (err) {
      setError(`${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mt-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-gray-700">API Debugger</h2>
        <button 
          onClick={() => setShowDebugger(!showDebugger)}
          className="text-sm px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
        >
          {showDebugger ? 'Hide' : 'Show'}
        </button>
      </div>
      
      {showDebugger && (
        <div>
          <form onSubmit={testEndpoint} className="mb-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="Enter endpoint (e.g., photos/123456)"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button 
                type="submit"
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
              >
                {isLoading ? 'Loading...' : 'Test'}
              </button>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Examples: projects/{'{project_id}'}/photos, photos/{'{photo_id}'}
            </div>
          </form>
          
          {error && (
            <div className="bg-red-50 border border-red-200 p-3 rounded-md mb-4">
              <p className="text-red-600">{error}</p>
            </div>
          )}
          
          {response && (
            <div className="border border-gray-200 rounded-md overflow-hidden">
              <div className="bg-gray-100 px-4 py-2 border-b border-gray-200">
                <span className="font-medium">Status: </span>
                <span className={response.status >= 200 && response.status < 300 ? 'text-green-600' : 'text-red-600'}>
                  {response.status}
                </span>
              </div>
              <pre className="p-4 overflow-auto max-h-60 text-sm">
                {JSON.stringify(response.data, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { CheckSquare, Square, ChevronDown, ChevronUp, Download, Printer, RefreshCw, X, Image } from "lucide-react";

export default function ChecklistExtractor({ project, apiToken }) {
  const [checklists, setChecklists] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [toastError, setToastError] = useState(null); // For non-fatal errors
  const [lastUpdated, setLastUpdated] = useState(null);
  const [cacheTimestamp, setCacheTimestamp] = useState({});
  const [updatingFields, setUpdatingFields] = useState([]); // Track fields being updated
  const [cacheStatus, setCacheStatus] = useState('fresh'); // 'fresh', 'cached', or 'expired'
  const [overallStats, setOverallStats] = useState({
    totalTasks: 0,
    completedTasks: 0,
    completionPercentage: 0
  });
  const [selectedSection, setSelectedSection] = useState(null);
  const [sectionDetails, setSectionDetails] = useState([]);
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [currentPhotos, setCurrentPhotos] = useState([]);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  
  // Process the checklist data from the API response
  const processChecklistData = useCallback((apiData) => {
    console.log("Processing API data for project:", project?.id, apiData);
    
    // Check if the API response has a data property (common for API responses)
    const checklistsData = apiData.data || apiData;
    
    // Handle different possible response formats
    let checklists = [];
    if (Array.isArray(checklistsData)) {
      // Filter to make sure we only process checklists for the current project
      checklists = checklistsData.filter(cl => 
        cl.project_id === project?.id || cl.project_id === project?.id?.toString()
      );
    } else if (checklistsData.checklists) {
      checklists = checklistsData.checklists.filter(cl => 
        cl.project_id === project?.id || cl.project_id === project?.id?.toString()
      );
    } else if (checklistsData.todos) {
      checklists = checklistsData.todos.filter(cl => 
        cl.project_id === project?.id || cl.project_id === project?.id?.toString()
      );
    } else {
      console.warn("Unexpected API response format:", checklistsData);
      checklists = [];
    }
    
    console.log(`Filtered to ${checklists.length} checklists for project ${project?.id}`);
    
    return checklists.map(checklist => {
      console.log("Processing checklist:", checklist);
      
      // Extract the raw ID for constructing the CompanyCam URL
      const rawId = checklist.id;
      
      // Create both web and mobile deep links
      const webUrl = `https://app.companycam.com/projects/${project?.id}/todos/${rawId}`;
      const mobileDeepLink = `ccam://projects/${project?.id}`;
      
      // Extract sections
      const sections = checklist.sections || [];
      
      // Handle tasks in different formats
      let allTasks = [];
      let tasksArray = [];
      
      // Try to get tasks using different possible property names
      if (Array.isArray(checklist.tasks)) {
        tasksArray = checklist.tasks;
      } else if (Array.isArray(checklist.fields)) {
        // Some APIs might still use "fields" terminology
        tasksArray = checklist.fields.map(field => ({
          ...field,
          // Map field properties to task properties if needed
          name: field.name || field.title,
          section_id: field.section_id
        }));
      }
      
      // If sections have their own tasks array, collect those too
      sections.forEach(section => {
        if (Array.isArray(section.tasks)) {
          // Map section tasks with section_id
          const sectionTasks = section.tasks.map(task => ({
            ...task,
            section_id: section.id,
            name: task.name || task.title
          }));
          tasksArray = [...tasksArray, ...sectionTasks];
        }
      });
      
      // Process tasks that don't belong to any section
      const sectionlessTasks = tasksArray.filter(task => !task.section_id);
      
      // Also check for a dedicated sectionless_tasks array
      if (Array.isArray(checklist.sectionless_tasks)) {
        const mappedSectionlessTasks = checklist.sectionless_tasks.map(task => ({
          ...task,
          name: task.name || task.title
        }));
        sectionlessTasks.push(...mappedSectionlessTasks);
      }
      
      // Process sections with their tasks
      const processedSections = sections.map(section => {
        // Find tasks that belong to this section
        const sectionTasks = tasksArray.filter(task => 
          task.section_id === section.id
        );
        
        // Calculate section completion percentage
        const completedTasksCount = sectionTasks.filter(task => task.completed_at).length;
        const completionPercentage = sectionTasks.length > 0 
          ? Math.round((completedTasksCount / sectionTasks.length) * 100) 
          : 0;
        
        return {
          id: section.id,
          name: section.name || section.title || 'Unnamed Section',
          expanded: false,
          completionPercentage,
          tasks: sectionTasks.map(task => ({
            id: task.id,
            text: task.name || task.title || task.description || 'Unnamed Task',
            completed: !!task.completed_at,
            notes: task.notes || task.description || '',
            required: !!task.required,
            photo_required: !!task.photo_required,
            has_photos: (task.photos && task.photos.length > 0) || false,
            photos: task.photos || [],
            photo_count: task.photos ? task.photos.length : 0
          }))
        };
      });
      
      // Process tasks that don't belong to a section
      const processedSectionlessTasks = sectionlessTasks.map(task => ({
        id: task.id,
        text: task.name || task.title || task.description || 'Unnamed Task',
        completed: !!task.completed_at,
        notes: task.notes || task.description || '',
        required: !!task.required,
        photo_required: !!task.photo_required,
        has_photos: (task.photos && task.photos.length > 0) || false,
        photos: task.photos || [],
        photo_count: task.photos ? task.photos.length : 0
      }));
      
      // Calculate overall completion percentage from API or calculate manually
      let overallCompletionPercentage = 0;
      
      if (typeof checklist.completed_tasks_count === 'number' && typeof checklist.tasks_count === 'number' && checklist.tasks_count > 0) {
        // Use API provided counts if available
        overallCompletionPercentage = Math.round((checklist.completed_tasks_count / checklist.tasks_count) * 100);
      } else {
        // Calculate from processed tasks
        const allTasks = [
          ...processedSectionlessTasks,
          ...processedSections.flatMap(section => section.tasks)
        ];
        
        const completedAllTasksCount = allTasks.filter(task => task.completed).length;
        overallCompletionPercentage = allTasks.length > 0 
          ? Math.round((completedAllTasksCount / allTasks.length) * 100) 
          : 0;
      }
      
      return {
        id: checklist.id,
        name: checklist.name || checklist.title || 'Unnamed Checklist',
        expanded: false,
        completionPercentage: overallCompletionPercentage,
        sections: processedSections,
        sectionlessTasks: processedSectionlessTasks,
        webUrl: webUrl,
        mobileDeepLink: mobileDeepLink,
        projectId: project?.id
      };
    });
  }, [project]);
  
  // Fetch checklists from the API
  const fetchChecklists = useCallback(async (forceFresh = false) => {
    // Clear any previous error
    setError(null);
    setIsLoading(true);
    
    // Make sure we have a valid project ID
    if (!project || !project.id) {
      setError("No project selected or invalid project ID");
      setIsLoading(false);
      return;
    }
    
    // Check cache first if not forcing a fresh fetch
    const cacheKey = `checklists-${project.id}`;
    const now = new Date().getTime();
    const CACHE_TTL = 5 * 60 * 1000; // 5 minute cache
    
    const cachedData = !forceFresh && localStorage.getItem(cacheKey);
    const cachedTime = cacheTimestamp[cacheKey] || 0;
    
    // Use cache if available and not expired
    if (cachedData && now - cachedTime < CACHE_TTL) {
      console.log("Using cached checklist data");
      const data = JSON.parse(cachedData);
      const processedChecklists = processChecklistData(data);
      setChecklists(processedChecklists);
      setLastUpdated(new Date(cachedTime));
      setCacheStatus('cached');
      setIsLoading(false);
      return;
    }
    
    // Cache exists but has expired
    if (cachedData && now - cachedTime >= CACHE_TTL) {
      setCacheStatus('expired');
    } else {
      setCacheStatus('fresh');
    }
    
    try {
      // Fetch checklists from the CompanyCam API
      // Try the checklists endpoint first
      let response = await fetch(`https://api.companycam.com/v2/checklists?project_id=${project.id}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
      
      // If we get a 404, try the todos endpoint instead
      if (response.status === 404) {
        console.log("Checklists endpoint not found, trying todos endpoint...");
        response = await fetch(`https://api.companycam.com/v2/todos?project_id=${project.id}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        });
      }
      
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
      
      const data = await response.json();
      console.log("Checklists data:", data);
      
      // Save response to cache
      try {
        localStorage.setItem(cacheKey, JSON.stringify(data));
        setCacheTimestamp(prev => ({ ...prev, [cacheKey]: now }));
      } catch (cacheError) {
        console.warn("Failed to cache checklist data:", cacheError);
      }
      
      // Process the checklist data directly
      const processedChecklists = processChecklistData(data);
      setChecklists(processedChecklists);
      setLastUpdated(new Date());
      setCacheStatus('fresh');
    } catch (err) {
      console.error("Error fetching checklists:", err);
      
      // Provide more specific error messages based on common API errors
      if (err.message.includes('404')) {
        setError(`Failed to fetch checklists: The requested endpoint was not found (404). This could indicate that the checklists feature is not available in your CompanyCam account or the API structure has changed.`);
      } else if (err.message.includes('401') || err.message.includes('403')) {
        setError(`Authentication error: Your API token may be invalid or you don't have permission to access checklists for this project.`);
      } else {
        setError(`Failed to fetch checklists: ${err.message}`);
      }
    } finally {
      setIsLoading(false);
    }
  }, [apiToken, project, cacheTimestamp, processChecklistData]);
  
  // Fetch checklists from CompanyCam API
  useEffect(() => {
    if (project && apiToken) {
      // Reset all data when project changes to avoid showing data from previous projects
      setChecklists([]);
      setOverallStats({
        totalTasks: 0,
        completedTasks: 0,
        completionPercentage: 0
      });
      setSelectedSection(null);
      setSectionDetails([]);
      setShowSectionModal(false);
      
      // Then fetch new data for the current project
      fetchChecklists();
    }
  }, [project, apiToken, fetchChecklists]);
      }
      
      // If sections have their own tasks array, collect those too
      sections.forEach(section => {
        if (Array.isArray(section.tasks)) {
          // Map section tasks with section_id
          const sectionTasks = section.tasks.map(task => ({
            ...task,
            section_id: section.id,
            name: task.name || task.title
          }));
          tasksArray = [...tasksArray, ...sectionTasks];
        }
      });
      
      // Process tasks that don't belong to any section
      const sectionlessTasks = tasksArray.filter(task => !task.section_id);
      
      // Also check for a dedicated sectionless_tasks array
      if (Array.isArray(checklist.sectionless_tasks)) {
        const mappedSectionlessTasks = checklist.sectionless_tasks.map(task => ({
          ...task,
          name: task.name || task.title
        }));
        sectionlessTasks.push(...mappedSectionlessTasks);
      }
      
      // Process sections with their tasks
      const processedSections = sections.map(section => {
        // Find tasks that belong to this section
        const sectionTasks = tasksArray.filter(task => 
          task.section_id === section.id
        );
        
        // Calculate section completion percentage
        const completedTasksCount = sectionTasks.filter(task => task.completed_at).length;
        const completionPercentage = sectionTasks.length > 0 
          ? Math.round((completedTasksCount / sectionTasks.length) * 100) 
          : 0;
        
        return {
          id: section.id,
          name: section.name || section.title || 'Unnamed Section',
          expanded: false,
          completionPercentage,
          tasks: sectionTasks.map(task => ({
            id: task.id,
            text: task.name || task.title || task.description || 'Unnamed Task',
            completed: !!task.completed_at,
            notes: task.notes || task.description || '',
            required: !!task.required,
            photo_required: !!task.photo_required,
            has_photos: (task.photos && task.photos.length > 0) || false,
            photos: task.photos || [],
            photo_count: task.photos ? task.photos.length : 0
          }))
        };
      });
      
      // Process tasks that don't belong to a section
      const processedSectionlessTasks = sectionlessTasks.map(task => ({
        id: task.id,
        text: task.name || task.title || task.description || 'Unnamed Task',
        completed: !!task.completed_at,
        notes: task.notes || task.description || '',
        required: !!task.required,
        photo_required: !!task.photo_required,
        has_photos: (task.photos && task.photos.length > 0) || false,
        photos: task.photos || [],
        photo_count: task.photos ? task.photos.length : 0
      }));
      
      // Calculate overall completion percentage from API or calculate manually
      let overallCompletionPercentage = 0;
      
      if (typeof checklist.completed_tasks_count === 'number' && typeof checklist.tasks_count === 'number' && checklist.tasks_count > 0) {
        // Use API provided counts if available
        overallCompletionPercentage = Math.round((checklist.completed_tasks_count / checklist.tasks_count) * 100);
      } else {
        // Calculate from processed tasks
        const allTasks = [
          ...processedSectionlessTasks,
          ...processedSections.flatMap(section => section.tasks)
        ];
        
        const completedAllTasksCount = allTasks.filter(task => task.completed).length;
        overallCompletionPercentage = allTasks.length > 0 
          ? Math.round((completedAllTasksCount / allTasks.length) * 100) 
          : 0;
      }
      
      return {
        id: checklist.id,
        name: checklist.name || checklist.title || 'Unnamed Checklist',
        expanded: false,
        completionPercentage: overallCompletionPercentage,
        sections: processedSections,
        sectionlessTasks: processedSectionlessTasks,
        webUrl: webUrl,
        mobileDeepLink: mobileDeepLink,
        projectId: project.id
      };
    });
  };
  
  // Toggle checklist expansion
  const toggleChecklist = (id) => {
    setChecklists(checklists.map(checklist => 
      checklist.id === id ? { ...checklist, expanded: !checklist.expanded } : checklist
    ));
  };
  
  // Toggle section expansion
  const toggleSection = (checklistId, sectionId) => {
    setChecklists(checklists.map(checklist => {
      if (checklist.id === checklistId) {
        const updatedSections = checklist.sections.map(section => 
          section.id === sectionId ? { ...section, expanded: !section.expanded } : section
        );
        return { ...checklist, sections: updatedSections };
      }
      return checklist;
    }));
  };
  
  // Toggle task completion status
  const toggleTaskCompletion = async (checklistId, taskId, isCompleted) => {
    // Add this task to the list of updating tasks
    setUpdatingFields(prev => [...prev, taskId]);
    
    // Create optimistic update first for better UX
    const updatedChecklists = checklists.map(checklist => {
      if (checklist.id === checklistId) {
        // Update sectionless tasks
        const updatedSectionlessTasks = checklist.sectionlessTasks.map(task => 
          task.id === taskId ? { ...task, completed: !isCompleted } : task
        );
        
        // Update sectioned tasks
        const updatedSections = checklist.sections.map(section => {
          const updatedTasks = section.tasks.map(task => 
            task.id === taskId ? { ...task, completed: !isCompleted } : task
          );
          
          // Recalculate section completion percentage
          const completedTasksCount = updatedTasks.filter(task => task.completed).length;
          const completionPercentage = updatedTasks.length > 0 
            ? Math.round((completedTasksCount / updatedTasks.length) * 100) 
            : 0;
          
          return { 
            ...section, 
            tasks: updatedTasks,
            completionPercentage 
          };
        });
        
        // Recalculate overall completion
        const allTasks = [
          ...updatedSectionlessTasks,
          ...updatedSections.flatMap(section => section.tasks)
        ];
        
        const completedAllTasksCount = allTasks.filter(task => task.completed).length;
        const overallCompletionPercentage = allTasks.length > 0 
          ? Math.round((completedAllTasksCount / allTasks.length) * 100) 
          : 0;
        
        return { 
          ...checklist, 
          sectionlessTasks: updatedSectionlessTasks,
          sections: updatedSections,
          completionPercentage: overallCompletionPercentage
        };
      }
      return checklist;
    });
    
    // Update UI immediately
    setChecklists(updatedChecklists);
    
    // Then make API request
    try {
      // First, try the tasks endpoint
      let endpoint = `https://api.companycam.com/v2/tasks/${taskId}`;
      let method = 'PUT';
      
      try {
        const response = await fetch(endpoint, {
          method,
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ 
            completed_at: isCompleted ? null : new Date().toISOString() 
          })
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
        
        // Task update successful
        console.log("Task updated successfully");
      } catch (taskError) {
        // If task endpoint failed, try the fields endpoint as fallback
        if (taskError.message.includes('404')) {
          console.log("Trying fields endpoint as fallback...");
          endpoint = `https://api.companycam.com/v2/fields/${taskId}`;
          
          const fieldResponse = await fetch(endpoint, {
            method,
            headers: {
              'Authorization': `Bearer ${apiToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
              completed_at: isCompleted ? null : new Date().toISOString() 
            })
          });
          
          if (!fieldResponse.ok) {
            const errorText = await fieldResponse.text();
            let errorMessage;
            
            try {
              const errorJson = JSON.parse(errorText);
              errorMessage = errorJson.message || errorJson.error || `API error: ${fieldResponse.status}`;
            } catch {
              errorMessage = errorText || `API error: ${fieldResponse.status}`;
            }
            
            throw new Error(errorMessage);
          }
          
          console.log("Field updated successfully");
        } else {
          // Re-throw the original error if it wasn't a 404
          throw taskError;
        }
      }
      
      // Optional: Refresh checklists to ensure we have latest data
      // This is now optional since we already updated the UI optimistically
      setLastUpdated(new Date());
      
      // Remove this task from the list of updating tasks
      setUpdatingFields(prev => prev.filter(id => id !== taskId));
      
    } catch (err) {
      console.error("Error updating task status:", err);
      
      // Provide more specific error messages
      if (err.message.includes('404')) {
        setToastError(`Failed to update task: The task endpoint was not found (404). The API structure may have changed.`);
      } else if (err.message.includes('401') || err.message.includes('403')) {
        setToastError(`Authentication error: Your API token may be invalid or you don't have permission to update tasks.`);
      } else {
        setToastError(`Failed to update task status: ${err.message}`);
      }
      
      // Auto-dismiss toast error after 5 seconds
      setTimeout(() => setToastError(null), 5000);
      
      // Remove this task from the list of updating tasks
      setUpdatingFields(prev => prev.filter(id => id !== taskId));
      
      // Revert optimistic update since API call failed
      fetchChecklists();
    }
  };

  // Export checklist data to CSV
  const exportToCSV = (checklistId) => {
    try {
      // Find the checklist to export
      const checklistToExport = checklists.find(cl => cl.id === checklistId);
      
      if (!checklistToExport) {
        setError("Checklist not found");
        return;
      }
      
      // Prepare the CSV data
      let csvContent = "Task,Section,Status,Notes,Required,Photo Required\n";
      
      // Add sectionless tasks
      checklistToExport.sectionlessTasks.forEach(task => {
        csvContent += `"${task.text.replace(/"/g, '""')}","No Section","${task.completed ? 'Completed' : 'Incomplete'}","${(task.notes || '').replace(/"/g, '""')}","${task.required ? 'Yes' : 'No'}","${task.photo_required ? 'Yes' : 'No'}"\n`;
      });
      
      // Add sectioned tasks
      checklistToExport.sections.forEach(section => {
        section.tasks.forEach(task => {
          csvContent += `"${task.text.replace(/"/g, '""')}","${section.name.replace(/"/g, '""')}","${task.completed ? 'Completed' : 'Incomplete'}","${(task.notes || '').replace(/"/g, '""')}","${task.required ? 'Yes' : 'No'}","${task.photo_required ? 'Yes' : 'No'}"\n`;
        });
      });
      
      // Create a downloadable blob
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      
      // Create a link and trigger download
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `${checklistToExport.name.replace(/\s+/g, '_')}_checklist.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
    } catch (err) {
      console.error("Error exporting checklist:", err);
      setError("Failed to export checklist");
    }
  };

  // Generate a printable view of a checklist
  const printChecklist = (checklistId) => {
    try {
      // Find the checklist to print
      const checklistToPrint = checklists.find(cl => cl.id === checklistId);
      
      if (!checklistToPrint) {
        setError("Checklist not found");
        return;
      }
      
      // Create a new window for printing
      const printWindow = window.open('', '_blank');
      
      // Generate the HTML content
      let htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>${checklistToPrint.name} - Checklist</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 30px; }
            h1 { color: #333; }
            .checklist-header { margin-bottom: 20px; }
            .section { margin-top: 20px; border-top: 1px solid #eee; padding-top: 10px; }
            .section-header { font-weight: bold; margin-bottom: 10px; }
            .task { margin-bottom: 8px; display: flex; align-items: flex-start; }
            .task-status { margin-right: 10px; }
            .completed { text-decoration: line-through; color: #888; }
            .project-info { color: #666; margin-bottom: 20px; }
            .progress { margin: 10px 0; background-color: #f3f4f6; border-radius: 9999px; height: 10px; }
            .progress-bar { height: 10px; border-radius: 9999px; }
            .progress-red { background-color: #ef4444; }
            .progress-yellow { background-color: #f59e0b; }
            .progress-green { background-color: #10b981; }
            @media print {
              body { margin: 0.5cm; }
              .no-print { display: none; }
              a { text-decoration: none; color: #000; }
            }
          </style>
        </head>
        <body>
          <div class="checklist-header">
            <h1>${checklistToPrint.name}</h1>
            <div class="project-info">Project: ${typeof project.name === 'string' ? project.name : 'Unknown Project'}</div>
            <div>Completion: ${checklistToPrint.completionPercentage}%</div>
            <div class="progress">
              <div class="progress-bar ${getProgressBarColor(checklistToPrint.completionPercentage).replace('bg-', 'progress-')}" 
                style="width: ${checklistToPrint.completionPercentage}%"></div>
            </div>
          </div>
      `;
      
      // Add sectionless tasks
      if (checklistToPrint.sectionlessTasks.length > 0) {
        htmlContent += `<div>`;
        checklistToPrint.sectionlessTasks.forEach(task => {
          htmlContent += `
            <div class="task">
              <div class="task-status">${task.completed ? '☑' : '☐'}</div>
              <div class="${task.completed ? 'completed' : ''}">
                <div>${task.text}${task.required ? ' <span style="color: red">*</span>' : ''}</div>
                ${task.notes ? `<div class="text-sm text-gray-500">${task.notes}</div>` : ''}
                ${task.photo_required ? `<div class="text-xs text-blue-500">${task.has_photos ? 'Photos attached' : 'Photo required'}</div>` : ''}
              </div>
            </div>
          `;
        });
        htmlContent += `</div>`;
      }
      
      // Add sectioned tasks
      checklistToPrint.sections.forEach(section => {
        htmlContent += `
          <div class="section">
            <div class="section-header">${section.name} (${section.completionPercentage}%)</div>
            <div class="progress">
              <div class="progress-bar ${getProgressBarColor(section.completionPercentage).replace('bg-', 'progress-')}" 
                style="width: ${section.completionPercentage}%"></div>
            </div>
        `;
        
        section.tasks.forEach(task => {
          htmlContent += `
            <div class="task">
              <div class="task-status">${task.completed ? '☑' : '☐'}</div>
              <div class="${task.completed ? 'completed' : ''}">
                <div>${task.text}${task.required ? ' <span style="color: red">*</span>' : ''}</div>
                ${task.notes ? `<div class="text-sm text-gray-500">${task.notes}</div>` : ''}
                ${task.photo_required ? `<div class="text-xs text-blue-500">${task.has_photos ? 'Photos attached' : 'Photo required'}</div>` : ''}
              </div>
            </div>
          `;
        });
        
        htmlContent += `</div>`;
      });
      
      // Close the HTML
      htmlContent += `
          <div class="no-print" style="margin-top: 30px; text-align: center;">
            <button onclick="window.print();" style="padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer;">
              Print Checklist
            </button>
          </div>
        </body>
        </html>
      `;
      
      // Write the content to the new window and trigger print dialog
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.focus();
      
    } catch (err) {
      console.error("Error printing checklist:", err);
      setError("Failed to generate printable view");
    }
  };

  // Helper function to handle "See Photos" click based on device
  const handleSeePhotosClick = (e, checklist) => {
    e.stopPropagation();
    
    // Try to detect if user is on mobile
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    if (isMobile) {
      // Use mobile deep link on mobile devices
      window.location.href = checklist.mobileDeepLink;
    } else {
      // Open web URL in new tab on desktop
      window.open(checklist.webUrl, '_blank');
    }
  };

  // Clear all checklist cache for this project
  const clearCache = () => {
    try {
      const cacheKey = `checklists-${project.id}`;
      localStorage.removeItem(cacheKey);
      setCacheTimestamp(prev => {
        const newTimestamps = {...prev};
        delete newTimestamps[cacheKey];
        return newTimestamps;
      });
      setCacheStatus('fresh');
      setToastError("Cache cleared successfully. Click refresh to load fresh data.");
      setTimeout(() => setToastError(null), 3000);
    } catch (err) {
      console.error("Error clearing cache:", err);
      setToastError("Failed to clear cache");
      setTimeout(() => setToastError(null), 3000);
    }
  };

  const getProgressBarColor = (percentage) => {
    if (percentage < 30) return 'bg-red-500';
    if (percentage < 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  // Get all sections from all checklists for the summary view
  const getAllSections = () => {
    // Create a map to collect sections by name
    const sectionsMap = new Map();
    
    checklists.forEach(checklist => {
      // Process regular sections - group by section name
      checklist.sections.forEach(section => {
        const sectionName = section.name;
        
        if (!sectionsMap.has(sectionName)) {
          sectionsMap.set(sectionName, {
            name: sectionName,
            totalTasks: 0,
            completedTasks: 0,
            checklists: new Set(),
            checklistDetails: [] // Store per-checklist details
          });
        }
        
        const sectionData = sectionsMap.get(sectionName);
        sectionData.checklists.add(checklist.name);
        
        // Add checklist-specific details
        const completedTasksCount = section.tasks.filter(task => task.completed).length;
        const totalTasksCount = section.tasks.length;
        const completionPercentage = totalTasksCount > 0 
          ? Math.round((completedTasksCount / totalTasksCount) * 100) 
          : 0;
        
        sectionData.checklistDetails.push({
          checklistId: checklist.id,
          checklistName: checklist.name,
          completedTasks: completedTasksCount,
          totalTasks: totalTasksCount,
          completionPercentage
        });
        
        // Count tasks in this section
        section.tasks.forEach(task => {
          sectionData.totalTasks++;
          if (task.completed) {
            sectionData.completedTasks++;
          }
        });
      });
      
      // Handle sectionless tasks - group them under "General Items"
      if (checklist.sectionlessTasks.length > 0) {
        const sectionName = "General Items";
        
        if (!sectionsMap.has(sectionName)) {
          sectionsMap.set(sectionName, {
            name: sectionName,
            totalTasks: 0,
            completedTasks: 0,
            checklists: new Set(),
            checklistDetails: []
          });
        }
        
        const sectionData = sectionsMap.get(sectionName);
        sectionData.checklists.add(checklist.name);
        
        // Add checklist-specific details
        const completedTasksCount = checklist.sectionlessTasks.filter(task => task.completed).length;
        const totalTasksCount = checklist.sectionlessTasks.length;
        const completionPercentage = totalTasksCount > 0 
          ? Math.round((completedTasksCount / totalTasksCount) * 100) 
          : 0;
        
        sectionData.checklistDetails.push({
          checklistId: checklist.id,
          checklistName: checklist.name,
          completedTasks: completedTasksCount,
          totalTasks: totalTasksCount,
          completionPercentage
        });
        
        // Count sectionless tasks
        checklist.sectionlessTasks.forEach(task => {
          sectionData.totalTasks++;
          if (task.completed) {
            sectionData.completedTasks++;
          }
        });
      }
    });
    
    // Convert map to array and calculate percentages
    const sectionsArray = Array.from(sectionsMap.entries()).map(([name, data]) => {
      const completionPercentage = data.totalTasks > 0 
        ? Math.round((data.completedTasks / data.totalTasks) * 100) 
        : 0;
      
      return {
        id: name, // Use name as ID since we're grouping by name
        name: name,
        checklistsCount: data.checklists.size,
        checklistNames: Array.from(data.checklists).join(', '),
        totalTasks: data.totalTasks,
        completedTasks: data.completedTasks,
        completionPercentage,
        checklistDetails: data.checklistDetails
      };
    });
    
    // Sort sections by completion percentage (lowest first)
    return sectionsArray.sort((a, b) => a.completionPercentage - b.completionPercentage);
  };

  // Handle section card click to show details
  const handleSectionClick = (section) => {
    setSelectedSection(section);
    
    // Sort checklist details by completion percentage (most complete first by default)
    const sortedDetails = [...section.checklistDetails].sort((a, b) => 
      b.completionPercentage - a.completionPercentage
    );
    
    setSectionDetails(sortedDetails);
    setShowSectionModal(true);
  };

  // Sort section details
  const sortSectionDetails = (sortBy) => {
    let sortedDetails;
    
    if (sortBy === 'name') {
      sortedDetails = [...sectionDetails].sort((a, b) => 
        a.checklistName.localeCompare(b.checklistName)
      );
    } else if (sortBy === 'completion-asc') {
      sortedDetails = [...sectionDetails].sort((a, b) => 
        a.completionPercentage - b.completionPercentage
      );
    } else if (sortBy === 'completion-desc') {
      sortedDetails = [...sectionDetails].sort((a, b) => 
        b.completionPercentage - a.completionPercentage
      );
    }
    
    setSectionDetails(sortedDetails);
  };

  // Jump to a specific checklist and expand/scroll to the section
  const jumpToSection = (checklistId, sectionName) => {
    // Set the checklist to expanded state
    setChecklists(checklists.map(checklist => {
      if (checklist.id === checklistId) {
        // Find and expand the matching section too
        const updatedSections = checklist.sections.map(section => {
          if (section.name === sectionName) {
            return { ...section, expanded: true };
          }
          return section;
        });
        
        return { 
          ...checklist, 
          expanded: true,
          sections: updatedSections
        };
      }
      return checklist;
    }));
    
    // Close the modal
    setShowSectionModal(false);
    
    // Find and scroll to the checklist element
    setTimeout(() => {
      const element = document.getElementById(`checklist-${checklistId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  // Simplified photo viewer function that just displays project photos
  const showTaskPhotos = async (taskId) => {
    setLoadingPhotos(true);
    setCurrentPhotos([]);
    setToastError(null);
    
    try {
      console.log("Fetching project photos for project ID:", project.id);
      
      // Get all photos for the project - simple and more reliable
      const projectPhotosUrl = `https://api.companycam.com/v2/projects/${project.id}/photos`;
      
      console.log("Requesting URL:", projectPhotosUrl);
      const response = await fetch(projectPhotosUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
      
      // Log the raw response for debugging
      console.log("Response status:", response.status);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch photos: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      console.log("Photos API response:", result);
      
      // Extract the photos array from the response
      const photos = result.data || result;
      
      if (!Array.isArray(photos) || photos.length === 0) {
        throw new Error("No photos found for this project");
      }
      
      console.log(`Found ${photos.length} photos`, photos[0]);
      
      // Update state with photos and show the modal
      setCurrentPhotos(photos);
      setPhotoModalOpen(true);
      setCurrentPhotoIndex(0);
    } catch (error) {
      console.error("Error showing photos:", error);
      setToastError(`Error loading photos: ${error.message}`);
      setTimeout(() => setToastError(null), 5000);
    } finally {
      setLoadingPhotos(false);
    }
  };
  
  // Navigate through photos in the carousel
  const navigatePhotos = (direction) => {
    if (!currentPhotos || currentPhotos.length === 0) return;
    
    if (direction === 'next') {
      setCurrentPhotoIndex((prev) => (prev + 1) % currentPhotos.length);
    } else {
      setCurrentPhotoIndex((prev) => (prev - 1 + currentPhotos.length) % currentPhotos.length);
    }
  };

  if (!project) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 text-center">
        <p className="text-gray-600">Please select a project to view checklists</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading checklists from CompanyCam...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-md mb-4 relative">
          <button 
            onClick={() => setError(null)} 
            className="absolute top-2 right-2 text-red-400 hover:text-red-600"
          >
            ✕
          </button>
          <p className="font-medium mb-2">Error:</p>
          <p className="mb-4">{error}</p>
          <div className="flex justify-end">
            <button 
              onClick={() => fetchChecklists(true)}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Try Again
            </button>
          </div>
        </div>
        
        {checklists.length > 0 && (
          <div className="mt-4">
            <p className="text-gray-600 mb-4">Showing previously loaded data. The error occurred while trying to update.</p>
            {/* Display the checklists UI here - you could refactor this into a separate component */}
            <div className="space-y-4">
              {/* ... checklist content ... */}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overall completion summary */}
      {checklists.length > 0 && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-700 mb-3">Project Completion Summary</h2>
          
          <div className="mb-4">
            <div className="flex justify-between items-end mb-1">
              <div className="text-lg font-medium">
                Overall Progress: {overallStats.completionPercentage}%
              </div>
              <div className="text-sm text-gray-500">
                {overallStats.completedTasks} of {overallStats.totalTasks} tasks completed
              </div>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-4">
              <div 
                className={`h-4 rounded-full ${getProgressBarColor(overallStats.completionPercentage)}`} 
                style={{ width: `${overallStats.completionPercentage}%` }}
              ></div>
            </div>
          </div>
          
          {/* Section summary */}
          <div className="mt-6">
            <h3 className="text-lg font-medium text-gray-700 mb-2">Section Progress</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {getAllSections().map(section => (
                <div 
                  key={section.id} 
                  className="border border-gray-200 rounded-md p-3 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
                  onClick={() => handleSectionClick(section)}
                >
                  <div className="flex justify-between items-start mb-1">
                    <div>
                      <div className="font-medium text-gray-800">{section.name}</div>
                      <div className="text-xs text-gray-600">
                        {section.completedTasks} of {section.totalTasks} tasks completed
                        {section.checklistsCount > 1 && 
                          <span className="ml-1">(across {section.checklistsCount} checklists)</span>
                        }
                      </div>
                    </div>
                    <div className="font-medium text-sm">
                      {section.completionPercentage}%
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full ${getProgressBarColor(section.completionPercentage)}`} 
                      style={{ width: `${section.completionPercentage}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Section details modal */}
      {showSectionModal && selectedSection && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-800">{selectedSection.name} Details</h3>
              <button 
                onClick={() => setShowSectionModal(false)} 
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-4 border-b">
              <div className="flex justify-between items-center mb-2">
                <div className="font-medium">Overall Completion: {selectedSection.completionPercentage}%</div>
                <div className="text-sm text-gray-600">
                  {selectedSection.completedTasks} of {selectedSection.totalTasks} tasks completed
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div 
                  className={`h-2.5 rounded-full ${getProgressBarColor(selectedSection.completionPercentage)}`} 
                  style={{ width: `${selectedSection.completionPercentage}%` }}
                ></div>
              </div>
            </div>
            
            <div className="p-4 border-b">
              <div className="flex justify-between mb-2">
                <div className="text-sm font-medium">Appears in {selectedSection.checklistsCount} checklists</div>
                <div className="flex space-x-2">
                  <button 
                    onClick={() => sortSectionDetails('name')} 
                    className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded"
                  >
                    Sort by Name
                  </button>
                  <button 
                    onClick={() => sortSectionDetails('completion-asc')} 
                    className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded"
                  >
                    Least Complete
                  </button>
                  <button 
                    onClick={() => sortSectionDetails('completion-desc')} 
                    className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded"
                  >
                    Most Complete
                  </button>
                </div>
              </div>
            </div>
            
            <div className="overflow-y-auto flex-grow">
              <div className="divide-y">
                {sectionDetails.map((detail) => (
                  <div 
                    key={detail.checklistId} 
                    className="p-3 hover:bg-gray-50 cursor-pointer"
                    onClick={() => jumpToSection(detail.checklistId, selectedSection.name)}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <div className="font-medium">{detail.checklistName}</div>
                      <div className="font-medium text-sm">
                        {detail.completionPercentage}%
                      </div>
                    </div>
                    <div className="text-xs text-gray-600 mb-1">
                      {detail.completedTasks} of {detail.totalTasks} tasks completed
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div 
                        className={`h-1.5 rounded-full ${getProgressBarColor(detail.completionPercentage)}`} 
                        style={{ width: `${detail.completionPercentage}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="p-4 border-t">
              <div className="flex justify-end">
                <button
                  onClick={() => setShowSectionModal(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Existing checklists component */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-700">
            Checklists for {typeof project.name === 'string' ? project.name : 'Selected Project'}
          </h2>
          <div className="flex items-center">
            {lastUpdated && (
              <span className="text-sm text-gray-500 mr-3">
                Last updated: {lastUpdated.toLocaleTimeString()}
                {cacheStatus === 'cached' && <span className="ml-1 text-blue-500">(cached)</span>}
                {cacheStatus === 'expired' && <span className="ml-1 text-yellow-500">(expired cache)</span>}
              </span>
            )}
            <div className="flex space-x-2">
              {cacheStatus === 'cached' && (
                <button 
                  onClick={() => fetchChecklists(true)} 
                  className="flex items-center px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm"
                  title="Reload from server instead of cache"
                >
                  <RefreshCw size={16} className="mr-1" />
                  Force Refresh
                </button>
              )}
              <button 
                onClick={clearCache} 
                className="flex items-center px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm"
                title="Clear the local cache"
              >
                Clear Cache
              </button>
              <button 
                onClick={() => fetchChecklists(true)} 
                className="flex items-center px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm"
                disabled={isLoading}
              >
                <RefreshCw size={16} className={`mr-1 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        </div>
        
        {checklists.length === 0 ? (
          <p className="text-gray-600 text-center py-8">No checklists found for this project</p>
        ) : (
          <div className="space-y-4">
            {checklists.map(checklist => (
              <div key={checklist.id} id={`checklist-${checklist.id}`} className="border border-gray-200 rounded-lg overflow-hidden">
                <div 
                  className="flex justify-between items-center p-4 bg-gray-100 cursor-pointer"
                  onClick={() => toggleChecklist(checklist.id)}
                >
                  <div>
                    <h3 className="font-medium text-gray-800">{checklist.name}</h3>
                  </div>
                  <div className="flex items-center">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        printChecklist(checklist.id);
                      }}
                      className="mr-2 p-1 text-gray-500 hover:text-blue-500 hover:bg-blue-50 rounded"
                      title="Print checklist"
                    >
                      <Printer size={18} />
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        exportToCSV(checklist.id);
                      }}
                      className="mr-3 p-1 text-gray-500 hover:text-blue-500 hover:bg-blue-50 rounded"
                      title="Export as CSV"
                    >
                      <Download size={18} />
                    </button>
                    <div className="text-sm text-gray-600 mr-4">
                      {checklist.completionPercentage}% Complete
                    </div>
                    {checklist.expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </div>
                </div>
                
                {checklist.expanded && (
                  <div className="p-4 bg-white">
                    <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
                      <div 
                        className={`h-2.5 rounded-full ${getProgressBarColor(checklist.completionPercentage)}`} 
                        style={{ width: `${checklist.completionPercentage}%` }}
                      ></div>
                    </div>
                    
                    {/* Sectionless Tasks */}
                    {checklist.sectionlessTasks.length > 0 && (
                      <div className="mb-4">
                        <ul className="space-y-3">
                          {checklist.sectionlessTasks.map(task => (
                            <li key={task.id} className="flex items-start">
                              <button 
                                className={`mt-0.5 mr-3 ${updatingFields.includes(task.id) ? 'opacity-50' : 'text-gray-400 hover:text-blue-500'}`}
                                onClick={() => !updatingFields.includes(task.id) && toggleTaskCompletion(checklist.id, task.id, task.completed)}
                                disabled={updatingFields.includes(task.id)}
                              >
                                {updatingFields.includes(task.id) ? (
                                  <div className="h-5 w-5 rounded-sm border border-gray-400 flex items-center justify-center">
                                    <div className="h-3 w-3 rounded-full border-t-2 border-blue-500 animate-spin"></div>
                                  </div>
                                ) : task.completed ? (
                                  <CheckSquare size={20} className="text-green-500" /> 
                                ) : (
                                  <Square size={20} />
                                )}
                              </button>
                              <div className="flex-1">
                                <span className={`${task.completed ? 'line-through text-gray-500' : 'text-gray-700'} ${task.required ? 'font-medium' : ''}`}>
                                  {task.text}
                                  {task.required && <span className="text-red-500 ml-1">*</span>}
                                </span>
                                {task.notes && (
                                  <p className="text-sm text-gray-500 mt-1">{task.notes}</p>
                                )}
                                <div className="flex items-center mt-1">
                                  {task.photo_required && (
                                    <div className="text-xs text-blue-500 mr-2">
                                      {task.has_photos ? 'Photos attached' : 'Photo required'}
                                    </div>
                                  )}
                                  {task.photo_count > 0 && (
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        showTaskPhotos(task.id);
                                      }}
                                      className="flex items-center text-xs text-blue-500 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded px-2 py-1"
                                    >
                                      <Image size={12} className="mr-1" />
                                      View Photos
                                    </button>
                                  )}
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {/* Sections with Tasks */}
                    {checklist.sections.map(section => (
                      <div key={section.id} className="mb-4 border-t pt-4">
                        <div 
                          className="flex justify-between items-center cursor-pointer mb-2"
                          onClick={() => toggleSection(checklist.id, section.id)}
                        >
                          <h4 className="font-medium text-gray-700">{section.name}</h4>
                          <div className="flex items-center">
                            <span className="text-sm text-gray-600 mr-2">
                              {section.completionPercentage}%
                            </span>
                            {section.expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </div>
                        </div>
                        
                        <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                          <div 
                            className={`h-2 rounded-full ${getProgressBarColor(section.completionPercentage)}`}
                            style={{ width: `${section.completionPercentage}%` }}
                          ></div>
                        </div>
                        
                        {section.expanded && (
                          <ul className="space-y-3 pl-2">
                            {section.tasks.map(task => (
                              <li key={task.id} className="flex items-start">
                                <button 
                                  className={`mt-0.5 mr-3 ${updatingFields.includes(task.id) ? 'opacity-50' : 'text-gray-400 hover:text-blue-500'}`}
                                  onClick={() => !updatingFields.includes(task.id) && toggleTaskCompletion(checklist.id, task.id, task.completed)}
                                  disabled={updatingFields.includes(task.id)}
                                >
                                  {updatingFields.includes(task.id) ? (
                                    <div className="h-5 w-5 rounded-sm border border-gray-400 flex items-center justify-center">
                                      <div className="h-3 w-3 rounded-full border-t-2 border-blue-500 animate-spin"></div>
                                    </div>
                                  ) : task.completed ? (
                                    <CheckSquare size={20} className="text-green-500" /> 
                                  ) : (
                                    <Square size={20} />
                                  )}
                                </button>
                                <div className="flex-1">
                                  <span className={`${task.completed ? 'line-through text-gray-500' : 'text-gray-700'} ${task.required ? 'font-medium' : ''}`}>
                                    {task.text}
                                    {task.required && <span className="text-red-500 ml-1">*</span>}
                                  </span>
                                  {task.notes && (
                                    <p className="text-sm text-gray-500 mt-1">{task.notes}</p>
                                  )}
                                  <div className="flex items-center mt-1">
                                    {task.photo_required && (
                                      <div className="text-xs text-blue-500 mr-2">
                                        {task.has_photos ? 'Photos attached' : 'Photo required'}
                                      </div>
                                    )}
                                    {task.photo_count > 0 && (
                                      <button 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          showTaskPhotos(task.id);
                                        }}
                                        className="flex items-center text-xs text-blue-500 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded px-2 py-1"
                                      >
                                        <Image size={12} className="mr-1" />
                                        View Photos
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Photo Carousel Modal */}
      {photoModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
            <div className="p-3 border-b flex justify-between items-center">
              <h3 className="font-medium text-gray-800">Photos ({currentPhotoIndex + 1}/{currentPhotos.length})</h3>
              <button 
                onClick={() => setPhotoModalOpen(false)} 
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-grow overflow-hidden relative">
              {loadingPhotos ? (
                <div className="flex items-center justify-center h-full">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                </div>
              ) : currentPhotos.length > 0 ? (
                <>
                  <div className="h-full flex items-center justify-center bg-gray-900 relative">
                    {currentPhotos.length > 0 && currentPhotoIndex < currentPhotos.length && (
                      <img 
                        src={currentPhotos[currentPhotoIndex]?.large_url || 
                             currentPhotos[currentPhotoIndex]?.medium_url || 
                             currentPhotos[currentPhotoIndex]?.url}
                        alt={`Project photo ${currentPhotoIndex + 1}`}
                        className="max-h-[60vh] max-w-full object-contain"
                        onError={(e) => {
                          console.error("Image failed to load:", e);
                          e.target.src = "https://via.placeholder.com/400x300?text=Image+Not+Available";
                        }}
                      />
                    )}
                    
                    {/* Navigation buttons */}
                    {currentPhotos.length > 1 && (
                      <>
                        <button 
                          onClick={() => navigatePhotos('prev')}
                          className="absolute left-2 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-70"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                          </svg>
                        </button>
                        <button 
                          onClick={() => navigatePhotos('next')}
                          className="absolute right-2 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-70"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
                  
                  {/* Thumbnails */}
                  {currentPhotos.length > 1 && (
                    <div className="flex overflow-x-auto p-2 bg-gray-100 border-t">
                      {currentPhotos.map((photo, index) => (
                        <div 
                          key={photo.id || index}
                          className={`h-16 w-16 flex-shrink-0 mx-1 cursor-pointer rounded border-2 ${index === currentPhotoIndex ? 'border-blue-500' : 'border-transparent'}`}
                          onClick={() => setCurrentPhotoIndex(index)}
                        >
                          <img 
                            src={photo.thumbnail_url || photo.small_url || photo.url} 
                            alt={`Thumbnail of project photo ${index + 1}`}
                            className="h-full w-full object-cover rounded"
                            onError={(e) => {
                              e.target.src = "https://via.placeholder.com/60x60?text=Thumb";
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-center h-full py-10">
                  <div className="text-center">
                    <p className="text-gray-500 mb-2">No photos available</p>
                    <button
                      onClick={() => showTaskPhotos(null)}
                      className="px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-3 border-t">
              {/* Action buttons */}
              <div className="flex justify-between items-center">
                <div>
                  {currentPhotos.length > 0 && currentPhotoIndex < currentPhotos.length && currentPhotos[currentPhotoIndex]?.created_at && (
                    <span className="text-sm text-gray-500">
                      Taken: {new Date(currentPhotos[currentPhotoIndex].created_at).toLocaleString()}
                    </span>
                  )}
                </div>
                <div className="space-x-2">
                  {currentPhotos.length > 0 && currentPhotoIndex < currentPhotos.length && currentPhotos[currentPhotoIndex]?.url && (
                    <a 
                      href={currentPhotos[currentPhotoIndex].url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                    >
                      Open Full Size
                    </a>
                  )}
                  <button
                    onClick={() => setPhotoModalOpen(false)}
                    className="px-3 py-1.5 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 text-sm"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Toast Error */}
      {toastError && (
        <div className="fixed top-4 right-4 z-50 max-w-md bg-red-50 border border-red-200 text-red-600 p-4 rounded-md shadow-lg">
          <button 
            onClick={() => setToastError(null)} 
            className="absolute top-2 right-2 text-red-400 hover:text-red-600"
          >
            ✕
          </button>
          <p className="pr-6">{toastError}</p>
        </div>
      )}
    </div>
  );
}
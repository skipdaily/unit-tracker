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
  const [checklistFilter, setChecklistFilter] = useState('default'); // For checklist filtering
  const [sectionFilter, setSectionFilter] = useState('default'); // For section filtering
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
  const [modalImageLoaded, setModalImageLoaded] = useState(false);
  const [expandedSectionSummaries, setExpandedSectionSummaries] = useState({});
  const [taskPhotos, setTaskPhotos] = useState({}); // Store photos for each task
  const [loadingTaskPhotos, setLoadingTaskPhotos] = useState({}); // Track loading state per task
  
  // Helper function to extract photo URLs from CompanyCam API response
  const getPhotoUrl = (photo, type = 'web') => {
    if (!photo) {
      return null;
    }
    
    // Handle legacy format where URL might be directly on the photo object
    if (!photo.uris && photo.url) {
      return photo.url;
    }
    
    if (!photo.uris || !Array.isArray(photo.uris)) {
      return null;
    }
    
    // Find the URI with the requested type
    const uri = photo.uris.find(u => u.type === type);
    if (uri && (uri.url || uri.uri)) {
      const url = uri.url || uri.uri;
      return url;
    }
    
    // If requested type not found, try fallbacks
    const fallbackOrder = {
      'original': ['original', 'web', 'thumbnail'],
      'web': ['web', 'original', 'thumbnail'], 
      'thumbnail': ['thumbnail', 'web', 'original']
    };
    
    const fallbacks = fallbackOrder[type] || ['web', 'original', 'thumbnail'];
    for (const fallbackType of fallbacks) {
      const fallbackUri = photo.uris.find(u => u.type === fallbackType);
      if (fallbackUri && (fallbackUri.url || fallbackUri.uri)) {
        const url = fallbackUri.url || fallbackUri.uri;
        return url;
      }
    }
    
    return null;
  };
  
  
  // Process the checklist data from the API response
  const processChecklistData = useCallback((apiData) => {
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
          tasks: sectionTasks.map(task => {
            console.log("Processing section task:", task.id, "has photos:", task.photos, "photo_required:", task.photo_required);
            return {
              id: task.id,
              text: task.name || task.title || task.description || 'Unnamed Task',
              completed: !!task.completed_at,
              notes: task.notes || task.description || '',
              required: !!task.required,
              photo_required: !!task.photo_required,
              has_photos: (task.photos && task.photos.length > 0) || false,
              photos: task.photos || [],
              photo_count: task.photos ? task.photos.length : 0
            };
          })
        };
      });
      
      // Process tasks that don't belong to a section
      const processedSectionlessTasks = sectionlessTasks.map(task => {
        console.log("Processing sectionless task:", task.id, "has photos:", task.photos, "photo_required:", task.photo_required);
        return {
          id: task.id,
          text: task.name || task.title || task.description || 'Unnamed Task',
          completed: !!task.completed_at,
          notes: task.notes || task.description || '',
          required: !!task.required,
          photo_required: !!task.photo_required,
          has_photos: (task.photos && task.photos.length > 0) || false,
          photos: task.photos || [],
          photo_count: task.photos ? task.photos.length : 0
        };
      });
      
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
  
  // Update overall stats whenever checklists change
  useEffect(() => {
    if (checklists.length === 0) {
      setOverallStats({
        totalTasks: 0,
        completedTasks: 0,
        completionPercentage: 0
      });
      return;
    }
    
    // Collect all tasks from all checklists
    let totalTasksCount = 0;
    let completedTasksCount = 0;
    
    checklists.forEach(checklist => {
      // Count sectionless tasks
      checklist.sectionlessTasks.forEach(task => {
        totalTasksCount++;
        if (task.completed) {
          completedTasksCount++;
        }
      });
      
      // Count tasks within sections
      checklist.sections.forEach(section => {
        section.tasks.forEach(task => {
          totalTasksCount++;
          if (task.completed) {
            completedTasksCount++;
          }
        });
      });
    });
    
    // Calculate overall completion percentage
    const completionPercentage = totalTasksCount > 0 
      ? Math.round((completedTasksCount / totalTasksCount) * 100) 
      : 0;
    
    // Update the overall stats
    setOverallStats({
      totalTasks: totalTasksCount,
      completedTasks: completedTasksCount,
      completionPercentage
    });
  }, [checklists]);
  
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
    
    // Safe localStorage access with checks for browser environment
    const cachedData = !forceFresh && typeof window !== 'undefined' ? localStorage.getItem(cacheKey) : null;
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
        if (typeof window !== 'undefined') {
          localStorage.setItem(cacheKey, JSON.stringify(data));
          setCacheTimestamp(prev => ({ ...prev, [cacheKey]: now }));
        }
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

  // Automatically fetch photos for tasks with photos when checklists are loaded or expanded
  useEffect(() => {
    if (checklists.length === 0 || !apiToken || !project) return;

    const tasksWithPhotos = [];
    
    // Collect all tasks that have photos from all checklists
    checklists.forEach(checklist => {
      // Check sectionless tasks
      checklist.sectionlessTasks.forEach(task => {
        if ((task.photo_count > 0 || task.has_photos || task.photo_required) && !taskPhotos[task.id] && !loadingTaskPhotos[task.id]) {
          tasksWithPhotos.push(task.id);
        }
      });
      
      // Check section tasks that are expanded
      checklist.sections.forEach(section => {
        if (section.expanded) {
          section.tasks.forEach(task => {
            if ((task.photo_count > 0 || task.has_photos || task.photo_required) && !taskPhotos[task.id] && !loadingTaskPhotos[task.id]) {
              tasksWithPhotos.push(task.id);
            }
          });
        }
      });
    });

    // Fetch photos for tasks that need them
    if (tasksWithPhotos.length > 0) {
      tasksWithPhotos.forEach(taskId => {
        fetchTaskPhotos(taskId);
      });
    }
  }, [checklists, taskPhotos, loadingTaskPhotos, apiToken, project]);

  // Keyboard navigation for photo modal
  useEffect(() => {
    const handleKeyPress = (event) => {
      if (!photoModalOpen) return;
      
      switch (event.key) {
        case 'Escape':
          setPhotoModalOpen(false);
          break;
        case 'ArrowLeft':
          event.preventDefault();
          navigatePhotos('prev');
          break;
        case 'ArrowRight':
          event.preventDefault();
          navigatePhotos('next');
          break;
        default:
          break;
      }
    };

    if (photoModalOpen) {
      document.addEventListener('keydown', handleKeyPress);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyPress);
      document.body.style.overflow = 'unset';
    };
  }, [photoModalOpen, currentPhotos]);

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
          task.id === taskId ? { 
            ...task, 
            completed: !isCompleted,
            completed_at: !isCompleted ? new Date().toISOString() : null 
          } : task
        );
        
        // Update sectioned tasks
        const updatedSections = checklist.sections.map(section => {
          const updatedTasks = section.tasks.map(task => 
            task.id === taskId ? { 
              ...task, 
              completed: !isCompleted,
              completed_at: !isCompleted ? new Date().toISOString() : null 
            } : task
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
    
    // Save to localStorage for the daily summary feature
    try {
      localStorage.setItem(`checklists_${project.id}`, JSON.stringify(updatedChecklists));
    } catch (error) {
      console.warn("Error storing checklists in localStorage:", error);
    }
    
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
      
      // Exit early if running on the server
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        console.log("Cannot download CSV on server side");
        return;
      }
      
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
      
      // Only execute window-related code on the client side
      if (typeof window === 'undefined') {
        console.log("Cannot print on server side");
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

  // Clear all checklist cache for this project
  const clearCache = () => {
    try {
      const cacheKey = `checklists-${project.id}`;
      if (typeof window !== 'undefined') {
        localStorage.removeItem(cacheKey);
      }
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

  // Modified getAllSections function to track completed checklists for each section
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
            checklistDetails: [], // Store per-checklist details
            tasks: [], // Store all tasks from all checklists
            completedChecklists: [] // Store names of checklists with all tasks completed
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
        
        // Check if all tasks in this section are completed for this checklist
        const isFullyCompleted = totalTasksCount > 0 && completedTasksCount === totalTasksCount;
        
        // If fully completed, add checklist name to the completedChecklists array
        if (isFullyCompleted) {
          sectionData.completedChecklists.push(checklist.name);
        }
        
        sectionData.checklistDetails.push({
          checklistId: checklist.id,
          checklistName: checklist.name,
          completedTasks: completedTasksCount,
          totalTasks: totalTasksCount,
          completionPercentage,
          isFullyCompleted
        });
        
        // Count tasks in this section and add them to the tasks array
        section.tasks.forEach(task => {
          sectionData.totalTasks++;
          if (task.completed) {
            sectionData.completedTasks++;
          }
          
          // Add task to the consolidated tasks list with checklist reference
          sectionData.tasks.push({
            ...task,
            checklistId: checklist.id,
            checklistName: checklist.name
          });
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
            checklistDetails: [],
            tasks: [] // Store all tasks from all checklists
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
        
        // Count sectionless tasks and add them to the tasks array
        checklist.sectionlessTasks.forEach(task => {
          sectionData.totalTasks++;
          if (task.completed) {
            sectionData.completedTasks++;
          }
          
          // Add task to the consolidated tasks list with checklist reference
          sectionData.tasks.push({
            ...task,
            checklistId: checklist.id,
            checklistName: checklist.name
          });
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
        checklistDetails: data.checklistDetails,
        tasks: data.tasks || [], // Include all tasks
        completedChecklists: data.completedChecklists || [] // Include names of completed checklists
      };
    });
    
    // Sort sections by completion percentage (lowest first)
    return sectionsArray.sort((a, b) => a.completionPercentage - b.completionPercentage);
  };

  // Get all sections from all checklists for the summary view
  const getAllSectionsOld = () => {
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

  // Toggle section summary expansion
  const toggleSectionSummary = (sectionId) => {
    setExpandedSectionSummaries(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
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
    
    // Find and scroll to the checklist element (client-side only)
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      setTimeout(() => {
        const element = document.getElementById(`checklist-${checklistId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
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
      
      console.log(`Found ${photos.length} photos`);
      console.log("First photo structure:", photos[0]);
      console.log("Sample photo uris:", photos[0]?.uris);
      
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

  // Fetch photos for a specific task and store in state
  const fetchTaskPhotos = async (taskId) => {
    if (taskPhotos[taskId] || loadingTaskPhotos[taskId]) {
      return; // Already loaded or loading
    }

    setLoadingTaskPhotos(prev => ({ ...prev, [taskId]: true }));
    
    try {
      // Get all photos for the project (we'll filter by task if needed)
      const projectPhotosUrl = `https://api.companycam.com/v2/projects/${project.id}/photos`;
      
      const response = await fetch(projectPhotosUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch photos: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      const photos = result.data || result;
      
      if (Array.isArray(photos) && photos.length > 0) {
        // Store the first few photos for this task (limiting to avoid performance issues)
        const taskPhotoData = photos.slice(0, 10); // Limit to 10 photos for performance
        setTaskPhotos(prev => ({ ...prev, [taskId]: taskPhotoData }));
      }
    } catch (error) {
      console.error("Error fetching task photos:", error);
    } finally {
      setLoadingTaskPhotos(prev => ({ ...prev, [taskId]: false }));
    }
  };
  
  // Inline photo carousel component
  const InlinePhotoCarousel = ({ taskId, photos, isLoading }) => {
    // Don't show anything when loading or when there are no photos
    if (isLoading || !photos || photos.length === 0) {
      return null;
    }
    
    return (
      <div className="mt-2">
        <div className="flex flex-col space-y-2">
          {/* Horizontal scrollable thumbnail row */}
          <div 
            className="flex overflow-x-auto space-x-3 pb-2"
            style={{ 
              scrollbarWidth: 'thin',
              scrollbarColor: '#cbd5e1 #f1f5f9'
            }}
          >
            {photos.map((photo, index) => (
              <div 
                key={photo.id || index}
                className="flex-shrink-0 h-32 w-32 bg-gray-200 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-blue-400 hover:shadow-lg transition-all duration-200"
                onClick={() => openPhotoModal(photos, index)}
              >
                <img 
                  src={getPhotoUrl(photo, 'thumbnail')}
                  alt={`Task photo ${index + 1}`}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.src = "https://via.placeholder.com/228x228?text=?";
                  }}
                />
              </div>
            ))}
          </div>
          
          {/* Photo count and click hint */}
          <div className="text-xs text-gray-500">
            {photos.length === 1 ? '1 photo' : `${photos.length} photos`}
            <div 
              className="text-xs text-blue-500 cursor-pointer hover:underline"
              onClick={() => openPhotoModal(photos, 0)}
            >
              Tap to view full size
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Simplified photo modal opening function
  const openPhotoModal = (photos, index = 0) => {
    // Simple approach - just set the state and open modal
    setCurrentPhotos(photos);
    setCurrentPhotoIndex(index);
    setLoadingPhotos(false);
    setModalImageLoaded(false);
    
    // Delay modal opening slightly to avoid flickering
    setTimeout(() => {
      setPhotoModalOpen(true);
    }, 10);
  };

  // Simplified photo navigation function
  const navigatePhotos = (direction) => {
    if (!currentPhotos || currentPhotos.length === 0) return;
        
    if (direction === 'next') {
      setCurrentPhotoIndex((prev) => (prev + 1) % currentPhotos.length);
    } else {
      setCurrentPhotoIndex((prev) => (prev - 1 + currentPhotos.length) % currentPhotos.length);
    }
  };

  // Filter and sort checklists based on selected filter
  const getFilteredChecklists = () => {
    if (!checklists || checklists.length === 0) return [];
    
    const checklistsCopy = [...checklists];
    
    switch (checklistFilter) {
      case 'name':
        return checklistsCopy.sort((a, b) => a.name.localeCompare(b.name));
      case 'completion-asc':
        return checklistsCopy.sort((a, b) => a.completionPercentage - b.completionPercentage);
      case 'completion-desc':
        return checklistsCopy.sort((a, b) => b.completionPercentage - a.completionPercentage);
      default:
        return checklistsCopy;
    }
  };
  
  // Get filtered and sorted sections based on the selected filter
  const getFilteredSections = () => {
    const sections = getAllSections();
    
    if (!sections || sections.length === 0) return [];
    
    switch (sectionFilter) {
      case 'name':
        return [...sections].sort((a, b) => a.name.localeCompare(b.name));
      case 'completion-asc':
        return [...sections].sort((a, b) => a.completionPercentage - b.completionPercentage);
      case 'completion-desc':
        return [...sections].sort((a, b) => b.completionPercentage - a.completionPercentage);
      default:
        return sections; // Default already sorts by completion (lowest first)
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
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-lg font-medium text-gray-700">Section Progress</h3>
              <div>
                <select
                  value={sectionFilter}
                  onChange={(e) => setSectionFilter(e.target.value)}
                  className="text-sm px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 border-none focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="default">Default Order</option>
                  <option value="name">Sort by Name</option>
                  <option value="completion-asc">Least Complete</option>
                  <option value="completion-desc">Most Complete</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {getFilteredSections().map(section => (
                <div key={section.id} className="border border-gray-200 rounded-md bg-gray-50 bg-opacity-75">
                  <div 
                    className="p-3 hover:bg-gray-100 transition-colors cursor-pointer"
                    onClick={(e) => {
                      toggleSectionSummary(section.id);
                    }}
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
                        {section.completedChecklists.length > 0 && (
                          <div className="text-xs text-green-600 mt-1">
                            Completed in: {section.completedChecklists.join(', ')}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center">
                        <div className="font-medium text-sm mr-2">
                          {section.completionPercentage}%
                        </div>
                        {expandedSectionSummaries[section.id] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full ${getProgressBarColor(section.completionPercentage)}`} 
                        style={{ width: `${section.completionPercentage}%` }}
                      ></div>
                    </div>
                  </div>
                  
                  {expandedSectionSummaries[section.id] && (
                    <div className="px-3 pb-3 pt-1 border-t border-gray-200 bg-white">
                      {/* "Tasks in this section" removed */}
                      
                      <div className="mt-2">
                        <div className="flex justify-between items-center mb-2">
                          <div className="text-xs font-medium text-gray-500">Appears in these checklists:</div>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSectionClick(section);
                            }}
                            className="text-xs px-2 py-1 bg-blue-50 text-blue-500 hover:bg-blue-100 rounded"
                          >
                            Show All Details
                          </button>
                        </div>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {section.checklistDetails.sort((a, b) => b.completionPercentage - a.completionPercentage).map(detail => (
                            <div 
                              key={detail.checklistId}
                              className={`flex items-center justify-between p-2 rounded cursor-pointer hover:bg-gray-100 
                               ${detail.isFullyCompleted ? 'bg-green-50' : 'bg-gray-50'}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                jumpToSection(detail.checklistId, section.name);
                              }}
                            >
                              <div className="text-sm">
                                {detail.checklistName}
                                {detail.isFullyCompleted && 
                                  <span className="ml-1 text-xs text-green-600">✓ Completed</span>
                                }
                              </div>
                              <div className="flex items-center">
                                <div className="text-xs text-gray-500 mr-2">
                                  {detail.completedTasks}/{detail.totalTasks}
                                </div>
                                <div className="font-medium text-xs">
                                  {detail.completionPercentage}%
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
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
              <div className="mr-3">
                <select
                  value={checklistFilter}
                  onChange={(e) => setChecklistFilter(e.target.value)}
                  className="text-sm px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 border-none focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="default">Default Order</option>
                  <option value="name">Sort by Name</option>
                  <option value="completion-asc">Least Complete</option>
                  <option value="completion-desc">Most Complete</option>
                </select>
              </div>
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
            {getFilteredChecklists().map(checklist => (
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
                                <div className="mt-1">
                                  {task.photo_required && (
                                    <div className="text-xs text-blue-500 mb-2">
                                      {task.has_photos ? 'Photos attached' : 'Photo required'}
                                    </div>
                                  )}
                                  {/* Show carousel only when photos are actually loaded */}
                                  {taskPhotos[task.id] && taskPhotos[task.id].length > 0 && (
                                    <InlinePhotoCarousel 
                                      taskId={task.id}
                                      photos={taskPhotos[task.id]}
                                      isLoading={loadingTaskPhotos[task.id] || false}
                                    />
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
                      <div 
                        key={section.id} 
                        className="mb-4 border border-gray-200 rounded-lg bg-gray-50 bg-opacity-75 pt-4 px-4 hover:shadow-lg transition-shadow"
                      >
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
                                  <div className="mt-1">
                                    {task.photo_required && (
                                      <div className="text-xs text-blue-500 mb-2">
                                        {task.has_photos ? 'Photos attached' : 'Photo required'}
                                      </div>
                                    )}
                                    {/* Show carousel only when photos are actually loaded */}
                                    {taskPhotos[task.id] && taskPhotos[task.id].length > 0 && (
                                      <InlinePhotoCarousel 
                                        taskId={task.id}
                                        photos={taskPhotos[task.id]}
                                        isLoading={loadingTaskPhotos[task.id] || false}
                                      />
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
      
      {/* Photo Carousel Modal - Full Screen - Simplified Version */}
     
      {photoModalOpen && (
        <div className="fixed inset-0 z-50 bg-black" style={{ isolation: 'isolate' }}>
          {/* Simple Header with Close Button */}
          <div className="absolute top-0 left-0 right-0 z-10 flex justify-between items-center p-4">
            <div className="text-white text-lg font-medium">
              Photo {currentPhotoIndex + 1} of {currentPhotos.length}
            </div>
            <button 
              onClick={() => setPhotoModalOpen(false)}
              className="text-white bg-black bg-opacity-50 rounded-full p-2"
            >
              <X size={24} />
            </button>
          </div>
          
          {/* Simple Photo Display */}
          <div className="absolute inset-0 flex items-center justify-center">
            {loadingPhotos ? (
              <div className="text-white text-center">
                <div className="animate-spin rounded-full h-16 w-16 border-4 border-white border-t-transparent mb-4 mx-auto"></div>
                <p>Loading photo...</p>
              </div>
            ) : currentPhotos.length > 0 ? (
              <img 
                src={getPhotoUrl(currentPhotos[currentPhotoIndex], 'web')}
                alt={`Photo ${currentPhotoIndex + 1}`}
                className="max-h-screen max-w-screen-lg object-contain"
                onLoad={() => setModalImageLoaded(true)}
                onError={(e) => {
                  e.target.src = "https://via.placeholder.com/800x600?text=Image+Not+Available";
                  setModalImageLoaded(true);
                }}
              />
            ) : (
              <div className="text-white text-center">
                <p>No photo available</p>
              </div>
            )}
          </div>
          
          {/* Simple Navigation */}
          {currentPhotos.length > 1 && (
            <div className="absolute inset-x-0 bottom-0 p-4 flex justify-center">
              <div className="flex space-x-2">
                <button
                  onClick={() => navigatePhotos('prev')}
                  className="bg-black bg-opacity-50 text-white p-2 rounded-full"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="94" height="94" viewBox="0 0 24 94" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                </button>
                <button
                  onClick={() => navigatePhotos('next')}
                  className="bg-black bg-opacity-50 text-white p-2 rounded-full"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="94" height="94" viewBox="0 0 24 94" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>
              </div>
            </div>
          )}
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
}// This is a small update to trigger a new build

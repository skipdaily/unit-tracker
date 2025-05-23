import React, { useState } from 'react';

const TaskSection = ({ title, tasks }) => {
  const [expanded, setExpanded] = useState(false);
  const progressPercent = Math.round((tasks.filter(task => task.completed).length / tasks.length) * 100);

  return (
    <div className="mb-4">
      {/* Section header - styled like the blue header */}
      <div className="flex justify-between items-center p-4 bg-gray-100 cursor-pointer rounded-t-lg" onClick={() => setExpanded(!expanded)}>
        <h4 className="font-medium text-gray-700">{title}</h4>
        <div className="flex items-center">
          <span className="text-sm text-gray-600 mr-2">{progressPercent}%</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`lucide ${expanded ? 'lucide-chevron-up' : 'lucide-chevron-down'}`}
            aria-hidden="true"
          >
            <path d={expanded ? "m18 15-6-6-6 6" : "m6 9 6 6 6-6"}></path>
          </svg>
        </div>
      </div>
      
      {/* Content area */}
      <div className="border border-t-0 border-gray-200 rounded-b-lg bg-white p-4">
        {/* Progress bar */}
        <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
          <div
            className="h-2 rounded-full bg-red-500"
            style={{ width: `${progressPercent}%` }}
          ></div>
        </div>
        
        {/* Task list if expanded */}
        {expanded && (
          <ul className="space-y-3 pl-2">
            {tasks.map(task => (
              <li key={task.id} className="flex justify-between items-center">
                <span className={`text-sm ${task.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                  {task.name}
                </span>
                <span className="text-xs text-gray-500">{task.dueDate}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default TaskSection;
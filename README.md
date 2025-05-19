# CompanyCam Checklist Extractor

A Next.js application for extracting and managing construction checklists from CompanyCam projects.

## Features

- Connect to your CompanyCam account via API
- Search and select from your projects
- View and manage checklists for each project
- Track completion status of checklist items
- Visual progress indicators for each checklist
- Interactive checklist management
- Export checklists to CSV format
- Generate printable checklist reports

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Using the Application

### API Connection

1. When you first open the application, you'll need to connect to the CompanyCam API.
2. Click the "Connect API" button in the top right corner.
3. Enter your CompanyCam API token. You can get this from your CompanyCam account settings.
4. Click "Connect" to authenticate with the CompanyCam API.

### Project Selection

1. Once connected, the application will load your projects from CompanyCam.
2. You can search for specific projects by name or address using the search bar.
3. Click on a project from the list to select it and view its checklists.

### Working with Checklists

1. After selecting a project, the application will display all checklists associated with that project.
2. Each checklist shows an overall completion percentage with a color-coded progress bar.
3. Click on a checklist to expand it and see its contents.
4. Checklists are organized by sections, each containing fields to be completed.
5. You can click on a section to expand/collapse it.
6. Toggle field completion by clicking the checkbox next to each field.
7. Required fields are marked with an asterisk (*).
8. Fields may include notes and photo requirements.
9. Changes to field completion status are automatically synced with your CompanyCam account.

### Caching and Data Management

1. Checklist data is cached locally for 5 minutes to improve performance and reduce API calls.
2. The cache status is displayed next to the last update time:
   - Fresh data is shown with no indicator
   - Cached data is indicated with "(cached)" in blue
   - Expired cache is indicated with "(expired cache)" in yellow
3. Use the "Force Refresh" button when cached data is shown to fetch fresh data from the API.
4. The "Clear Cache" button removes stored checklist data, allowing you to start fresh.
5. Optimistic updates are applied when toggling field status for a responsive experience.

### Export and Reporting

1. Each checklist has export options available in the top-right corner:
   - **CSV Export**: Click the download icon to export checklist data in CSV format
   - **Print Report**: Click the printer icon to generate a formatted, printable report

### Progress Tracking

- Red progress bars indicate low completion (< 30%)
- Yellow progress bars indicate medium completion (30% - 70%)
- Green progress bars indicate high completion (> 70%)

## Development

This application is built with:

- Next.js 14
- React
- Tailwind CSS
- CompanyCam API

## API Integration

The application integrates with the CompanyCam API to:

1. Fetch projects
2. Retrieve checklists for specific projects
3. Get detailed checklist structure including sections and fields/tasks
4. Update field/task completion status

API requests are authenticated using your CompanyCam API token, which is stored in local storage and session storage for convenience.

### API Debugging

The application includes an API Debugger tool to help you:

1. Test different CompanyCam API endpoints
2. Examine response structures and formats
3. Troubleshoot connection issues

The debugger provides:
- Quick access to common endpoints like projects, checklists, and todos
- Automatic project ID insertion in endpoints when a project is selected
- Detailed breakdown of API response structure 
- Complete JSON response data
- Error information when requests fail

This tool is invaluable when:
- Setting up the application for the first time
- Validating your API token permissions
- Understanding which endpoints are available in your account
- Troubleshooting issues with checklist data

### Supported API Structures

The application is designed to work with different CompanyCam API response formats:

1. **Endpoints**: The app tries both `/checklists` and `/todos` endpoints to retrieve checklist data
2. **Task vs Field terminology**: CompanyCam may refer to checklist items as either "tasks" or "fields"
3. **Data formats**: The app handles various response structures including:
   - Array of checklists
   - Object with `checklists` or `todos` property containing an array 
   - Objects with either `fields` or `tasks` arrays
   - Nested task arrays within sections
   - Sectionless tasks

When updating item completion status, the app first tries the `/fields/{id}` endpoint, and if that fails, it automatically falls back to the `/tasks/{id}` endpoint.

### Error Handling

The application implements robust error handling:

1. API connection issues are clearly communicated with specific error messages.
2. Field update errors appear as toast notifications without disrupting the user experience.
3. Fatal errors that prevent checklist loading display with options to retry.
4. Network issues and API structure changes are handled gracefully.

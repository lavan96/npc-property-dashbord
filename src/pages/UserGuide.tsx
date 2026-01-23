import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { 
  Home, 
  Building2, 
  Calendar, 
  Mail, 
  BarChart3, 
  FileText, 
  Settings,
  Search,
  Filter,
  Download,
  Eye,
  AlertCircle,
  CheckCircle,
  Clock,
  Target,
  Users,
  Phone,
  Zap,
  PieChart,
  Palette,
  Upload,
  Shield,
  Activity,
  Keyboard,
  Bot,
  Calculator,
  FolderOpen,
  MessageSquare,
  Headphones,
  Bell,
  Briefcase,
  TrendingUp,
  DollarSign,
  FileSpreadsheet,
  UserCog,
  Database,
  LayoutDashboard,
  Mic,
  Sparkles,
} from 'lucide-react';

interface GuideSection {
  id: string;
  title: string;
  icon: React.ElementType;
  description: string;
  items: GuideItem[];
}

interface GuideItem {
  title: string;
  description: string;
  features?: string[];
  steps?: string[];
  tips?: string[];
  shortcuts?: { keys: string[]; description: string }[];
}

export default function UserGuide() {
  const sections: GuideSection[] = [
    {
      id: 'getting-started',
      title: 'Getting Started',
      icon: Home,
      description: 'Essential navigation and dashboard overview',
      items: [
        {
          title: 'Dashboard Overview',
          description: 'The main dashboard provides a comprehensive view of your property data with key performance indicators (KPIs), charts, and recent activity.',
          features: [
            'Real-time data updates across all modules',
            'Interactive charts and visualizations',
            'Quick access to all sections via sidebar navigation',
            'Notification center for alerts and updates',
          ],
        },
        {
          title: 'Navigation & Sidebar',
          description: 'Use the collapsible sidebar to navigate between different sections. The active page is highlighted for easy reference.',
          features: [
            'Collapsible sidebar for more screen space',
            'Quick search functionality (Ctrl/⌘ + K)',
            'User profile and settings access',
            'Role-based menu visibility',
          ],
        },
      ],
    },
    {
      id: 'client-management',
      title: 'Client Management',
      icon: Users,
      description: 'Comprehensive CRM for managing investor clients',
      items: [
        {
          title: 'Client Tracker',
          description: 'The Client Tracker is your central hub for managing all client relationships, tracking their investment journey, and maintaining detailed records.',
          features: [
            'Client cards with key financial summaries',
            'Pipeline stage tracking for each client',
            'Favorite clients for quick access',
            'Advanced filtering by status, tags, and activity',
            'Bulk actions for efficient management',
          ],
          steps: [
            'Navigate to "Client Tracker" in the sidebar',
            'Use the search bar to find specific clients',
            'Click on a client card to view full details',
            'Use tabs to navigate between Personal, Employment, Financials, Properties, Emails, Notes, and Reports',
            'Update client information directly in the modal',
          ],
        },
        {
          title: 'Client Details & Financials',
          description: 'Each client profile contains comprehensive financial information for borrowing capacity and portfolio analysis.',
          features: [
            'Personal and employment details',
            'Income sources with multiple entry types',
            'Expense tracking by category',
            'Assets and liabilities management',
            'Property portfolio overview',
            'Borrowing capacity calculations',
          ],
        },
        {
          title: 'Client Notes & Reminders',
          description: 'Keep detailed notes and set reminders for follow-ups and important dates.',
          features: [
            'Rich text notes with timestamps',
            'Voice note recording capability',
            'Reminder scheduling with priority levels',
            'Activity timeline showing all interactions',
          ],
        },
        {
          title: 'Client Tags & Segmentation',
          description: 'Organize clients with custom tags for better segmentation and targeting.',
          features: [
            'Create custom colored tags',
            'Assign multiple tags per client',
            'Filter clients by tag combinations',
            'Bulk tag assignment',
          ],
        },
        {
          title: 'Portfolio Analysis Reports',
          description: 'Generate comprehensive portfolio health reports for your clients.',
          features: [
            'Overall portfolio health scoring',
            'Property-by-property breakdown',
            'Equity and cashflow analysis',
            'LVR and yield calculations',
            'PDF export with professional formatting',
          ],
          steps: [
            'Open a client\'s details modal',
            'Navigate to the "Reports" tab',
            'Click "Generate Portfolio Analysis"',
            'Wait for the AI to analyze all properties',
            'Download the PDF report',
          ],
        },
      ],
    },
    {
      id: 'email-copilot',
      title: 'Email Copilot',
      icon: Mail,
      description: 'AI-powered email management and automation',
      items: [
        {
          title: 'Email Overview',
          description: 'The Email Copilot centralizes all client communications with AI-powered features for drafting, summarizing, and managing emails.',
          features: [
            'Unified inbox for admin and personal mailboxes',
            'AI-generated email summaries',
            'Smart draft replies with context awareness',
            'Urgency detection and prioritization',
            'Client linking for organized communications',
          ],
        },
        {
          title: 'Managing Emails',
          description: 'Process and organize incoming emails efficiently with AI assistance.',
          steps: [
            'Navigate to "Email Copilot" in the sidebar',
            'View inbox organized by urgency and status',
            'Click on an email to see full content and AI summary',
            'Use "Generate AI Reply" for smart draft responses',
            'Link emails to specific clients for tracking',
            'Mark emails as processed when complete',
          ],
        },
        {
          title: 'Linking Emails to Clients',
          description: 'Associate email threads with specific clients for organized tracking.',
          features: [
            'Search and select clients from the dropdown',
            'View all linked emails in client details',
            'Track communication history per client',
            'Quick access from both Email Copilot and Client Tracker',
          ],
        },
        {
          title: 'Email Actions',
          description: 'Take action on emails directly from the copilot interface.',
          features: [
            'Generate AI-powered reply drafts',
            'Mark as processed/pending/follow-up',
            'Set urgency levels (low, normal, high, critical)',
            'Compose and send replies with signature',
            'Archive completed conversations',
          ],
        },
      ],
    },
    {
      id: 'report-qa',
      title: 'Report Q&A (AI Chat)',
      icon: Bot,
      description: 'AI-powered assistant for property report analysis',
      items: [
        {
          title: 'AI Chat Overview',
          description: 'The Report Q&A feature allows you to have natural conversations with an AI assistant that has access to your property reports and market data.',
          features: [
            'Natural language queries about properties',
            'Context-aware responses using your report data',
            'Multi-turn conversations with memory',
            'PDF document attachment and analysis',
            'Voice message input support',
          ],
        },
        {
          title: 'Using the AI Chat',
          description: 'Ask questions about properties, market trends, and investment analysis.',
          steps: [
            'Navigate to "Report Q&A" in the sidebar',
            'Select reports from the sidebar to provide context',
            'Type your question in the message input',
            'Use voice recording for hands-free input',
            'Review AI responses with source citations',
            'Follow up with clarifying questions',
          ],
          tips: [
            'Attach specific reports for more accurate answers',
            'Ask comparative questions across multiple properties',
            'Request summaries of complex report sections',
            'Use follow-up suggestions for deeper analysis',
          ],
        },
        {
          title: 'Conversation Management',
          description: 'Organize and manage your AI chat history.',
          features: [
            'Pin important conversations',
            'Tag conversations by topic',
            'Search conversation history (⌘/Ctrl + K)',
            'Export conversations as PDF or text',
            'Start new chats (⌘/Ctrl + N)',
          ],
        },
        {
          title: 'Advanced Features',
          description: 'Power user features for enhanced productivity.',
          features: [
            'Full-screen mode (⌘/Ctrl + Enter)',
            'Text-to-speech for responses',
            'Message reactions for feedback',
            'Auto-summarize long responses',
            'Theme customization',
            'Accessibility settings',
          ],
        },
      ],
    },
    {
      id: 'property-management',
      title: 'Property Management',
      icon: Building2,
      description: 'View and manage property listings',
      items: [
        {
          title: 'Listings Page',
          description: 'View and manage all property listings with advanced filtering and search capabilities.',
          features: [
            'Search by address, suburb, or postcode',
            'Filter by property type, price range, and status',
            'View detailed property information',
            'Generate investment reports for individual properties',
            'Compare multiple properties side-by-side',
          ],
        },
        {
          title: 'Property Filters',
          description: 'Use filters to narrow down properties based on your criteria.',
          features: [
            'State and suburb filtering',
            'Property type selection (house, unit, land, etc.)',
            'Price range filtering with min/max',
            'Status filtering (active, pending, sold, withdrawn)',
            'Save filter presets for quick access',
          ],
        },
        {
          title: 'Property Details',
          description: 'View comprehensive information about each property.',
          features: [
            'Property specifications and features',
            'Price history and market comparison',
            'Location insights and amenities',
            'Agent and agency information',
            'Quick report generation buttons',
          ],
        },
      ],
    },
    {
      id: 'cash-flow-analysis',
      title: 'Cash Flow Analysis',
      icon: DollarSign,
      description: 'Detailed property cash flow modeling',
      items: [
        {
          title: 'Cash Flow Calculator',
          description: 'Model the cash flow of investment properties with detailed income and expense projections.',
          features: [
            'Rental income projections',
            'Operating expense calculations',
            'Loan repayment modeling',
            'Tax benefit analysis',
            'Net cash flow visualization',
          ],
        },
        {
          title: 'Scenario Comparison',
          description: 'Compare different investment scenarios side-by-side.',
          features: [
            'Multiple property comparison',
            'Interest rate sensitivity analysis',
            'Occupancy rate impact modeling',
            'Growth rate projections',
            'Export comparison reports',
          ],
        },
      ],
    },
    {
      id: 'borrowing-capacity',
      title: 'Borrowing Capacity',
      icon: Calculator,
      description: 'Calculate client borrowing power',
      items: [
        {
          title: 'Capacity Calculator',
          description: 'Calculate borrowing capacity based on income, expenses, and existing commitments using bank-approved methodologies.',
          features: [
            'Gross and net income calculation',
            'Living expense modeling (HEM/declared)',
            'Existing commitment factoring',
            'Buffer rate application',
            'Serviceability assessment',
          ],
        },
        {
          title: 'Conservative Mode',
          description: 'Apply stricter lending criteria for more realistic capacity estimates.',
          features: [
            '$1,000/mo minimum surplus floor',
            '$1,500 residual income floor',
            '85% surplus utilization',
            '6x DTI (debt-to-income) cap',
            'Lender-specific adjustments',
          ],
          tips: [
            'Use Conservative Mode for client-facing quotes',
            'Standard mode shows theoretical maximum',
            'Compare both modes to set expectations',
          ],
        },
        {
          title: 'Saving Assessments',
          description: 'Save borrowing capacity assessments to client profiles.',
          steps: [
            'Complete the borrowing capacity calculation',
            'Review the results and recommendations',
            'Click "Save to Client" button',
            'Select the client from the dropdown',
            'Access saved assessments from client details',
          ],
        },
      ],
    },
    {
      id: 'call-logs',
      title: 'Call Logs',
      icon: Phone,
      description: 'AI-powered call recording and analysis',
      items: [
        {
          title: 'Call Management',
          description: 'Track and analyze all client calls with AI-powered transcription and insights.',
          features: [
            'Automatic call recording',
            'AI transcription of conversations',
            'Sentiment analysis',
            'Key topic extraction',
            'Call duration and status tracking',
          ],
        },
        {
          title: 'Call Analysis',
          description: 'Extract insights from recorded calls.',
          features: [
            'Full transcript review',
            'Speaker identification',
            'Action item extraction',
            'Follow-up task creation',
            'Client linking for context',
          ],
        },
        {
          title: 'Alert Rules',
          description: 'Set up automated alerts based on call content or metrics.',
          features: [
            'Keyword-based triggers',
            'Duration thresholds',
            'Sentiment-based alerts',
            'Custom notification rules',
            'Team notification routing',
          ],
        },
      ],
    },
    {
      id: 'automation',
      title: 'Automation',
      icon: Zap,
      description: 'Automated report generation and workflows',
      items: [
        {
          title: 'Auto-Report Switches',
          description: 'Configure automated report generation based on property criteria.',
          features: [
            'Criteria-based triggers (price, location, type)',
            'Priority ordering for multiple switches',
            'Enable/disable individual switches',
            'Generation logging and history',
            'Master toggle for all automation',
          ],
          steps: [
            'Navigate to "Automation" in the sidebar',
            'Click "Add Switch" to create a new automation',
            'Configure trigger criteria (state, price range, property type)',
            'Set priority order for switch evaluation',
            'Enable the switch and master toggle',
            'Monitor generation logs for activity',
          ],
        },
        {
          title: 'Generation Logs',
          description: 'View history of all automated report generations.',
          features: [
            'Success/failure status for each generation',
            'Property details and switch that triggered',
            'Error messages for troubleshooting',
            'Timestamp and duration tracking',
            'Link to generated reports',
          ],
        },
      ],
    },
    {
      id: 'reports-analytics',
      title: 'Reports & Analytics',
      icon: BarChart3,
      description: 'Investment reports and data visualization',
      items: [
        {
          title: 'Investment Report Generation',
          description: 'Create comprehensive property investment analysis reports with AI-powered insights.',
          features: [
            '13-section comprehensive analysis',
            'Market KPIs and pricing trends',
            'Demographics and demand analysis',
            'Risk assessment (flood, bushfire, crime)',
            'Financial projections and scenarios',
            'Investment scoring (0-100)',
          ],
          steps: [
            'Go to "Listings" and find your target property',
            'Click "Generate Report" on the property card',
            'Choose analysis mode (Address/Postcode/State)',
            'Configure financial assumptions',
            'Wait for AI analysis (2-5 minutes)',
            'Review and download the report',
          ],
        },
        {
          title: 'Generated Reports',
          description: 'Access and manage all your generated investment reports.',
          features: [
            'Report library with search and filters',
            'PDF download and sharing',
            'Report versioning history',
            'Bookmarking for quick access',
            'Usage analytics',
          ],
        },
        {
          title: 'Charts & Visualization',
          description: 'Create custom charts for market analysis and presentations.',
          features: [
            'Multiple chart types (bar, line, pie, scatter)',
            'Custom data filtering and grouping',
            'Export as images or PDFs',
            'Real-time data updates',
            'Comparative analysis tools',
          ],
        },
        {
          title: 'Portfolio Reports',
          description: 'Generate portfolio-level analysis across multiple properties.',
          features: [
            'Multi-property health scoring',
            'Diversification analysis',
            'Combined cash flow projections',
            'Risk distribution overview',
            'Client-ready PDF exports',
          ],
        },
      ],
    },
    {
      id: 'data-import',
      title: 'Data Import',
      icon: Upload,
      description: 'Import client and property data',
      items: [
        {
          title: 'Excel Import',
          description: 'Bulk import clients and properties from Excel spreadsheets.',
          features: [
            'Template download for correct formatting',
            'Column mapping assistance',
            'Validation and error reporting',
            'Duplicate detection',
            'Import history logging',
          ],
          steps: [
            'Navigate to "Data Import" in the sidebar',
            'Download the import template',
            'Fill in your data following the template format',
            'Upload the completed spreadsheet',
            'Review validation results',
            'Confirm and complete the import',
          ],
        },
        {
          title: 'VowNet Forms',
          description: 'Import client data from VowNet form submissions.',
          features: [
            'Automatic form parsing',
            'Client profile creation',
            'Income and expense extraction',
            'Property detail import',
            'Document attachment linking',
          ],
        },
      ],
    },
    {
      id: 'white-label',
      title: 'White Label',
      icon: Palette,
      description: 'Customize branding for client-facing reports',
      items: [
        {
          title: 'Brand Settings',
          description: 'Customize the appearance of generated reports with your company branding.',
          features: [
            'Company logo upload',
            'Primary and secondary color schemes',
            'Custom font selection',
            'Header and footer styling',
            'Contact information display',
          ],
        },
        {
          title: 'Client Branding Profiles',
          description: 'Create multiple branding profiles for different clients or use cases.',
          features: [
            'Multiple saved profiles',
            'Quick profile switching',
            'Default profile setting',
            'Preview before applying',
            'Per-report branding selection',
          ],
        },
      ],
    },
    {
      id: 'calendar',
      title: 'Calendar & Scheduling',
      icon: Calendar,
      description: 'Track appointments and important dates',
      items: [
        {
          title: 'Calendar View',
          description: 'Manage appointments, follow-ups, and property-related events.',
          features: [
            'Day, week, and month views',
            'Client appointment scheduling',
            'Property inspection tracking',
            'Reminder notifications',
            'Integration with client reminders',
          ],
        },
        {
          title: 'Keyboard Navigation',
          description: 'Navigate the calendar efficiently with keyboard shortcuts.',
          shortcuts: [
            { keys: ['T'], description: 'Go to today' },
            { keys: ['←'], description: 'Previous period' },
            { keys: ['→'], description: 'Next period' },
            { keys: ['D'], description: 'Day view' },
            { keys: ['W'], description: 'Week view' },
            { keys: ['M'], description: 'Month view' },
          ],
        },
      ],
    },
    {
      id: 'monitoring',
      title: 'Monitoring & Logs',
      icon: Activity,
      description: 'System health and activity tracking',
      items: [
        {
          title: 'System Monitoring',
          description: 'Monitor the health of data sources and integrations.',
          features: [
            'API health status indicators',
            'Data sync monitoring',
            'Response time tracking',
            'Error rate visualization',
            'Uptime statistics',
          ],
        },
        {
          title: 'Error Logs',
          description: 'View and troubleshoot system errors.',
          features: [
            'Error categorization',
            'Stack trace details',
            'Timestamp and frequency',
            'Resolution status tracking',
            'Export for support',
          ],
        },
        {
          title: 'Activity Logs',
          description: 'Track user actions and system events.',
          features: [
            'User action history',
            'Entity change tracking',
            'Login/logout events',
            'Report generation history',
            'Filtering by user, action, or date',
          ],
        },
        {
          title: 'Quality Assurance',
          description: 'Monitor data quality across the system.',
          features: [
            'Data completeness scoring',
            'Validation error tracking',
            'Missing field identification',
            'Quality trend analysis',
            'Improvement recommendations',
          ],
        },
      ],
    },
    {
      id: 'admin',
      title: 'Administration',
      icon: UserCog,
      description: 'User management and system settings',
      items: [
        {
          title: 'User Management',
          description: 'Manage team members and their access levels.',
          features: [
            'User creation and deactivation',
            'Role assignment (Admin, User, Viewer)',
            'Password management',
            'Email configuration',
            'Personal mailbox settings',
          ],
        },
        {
          title: 'Integrations',
          description: 'Configure external service connections.',
          features: [
            'GoHighLevel (GHL) CRM integration',
            'Email provider settings',
            'API key management',
            'Webhook configuration',
            'Sync status monitoring',
          ],
        },
        {
          title: 'System Settings',
          description: 'Configure global application settings.',
          features: [
            'Default values and assumptions',
            'Notification preferences',
            'Data retention policies',
            'Export/backup options',
            'Theme and display settings',
          ],
        },
      ],
    },
    {
      id: 'keyboard-shortcuts',
      title: 'Keyboard Shortcuts',
      icon: Keyboard,
      description: 'Quick actions for power users',
      items: [
        {
          title: 'Global Shortcuts',
          description: 'Shortcuts available throughout the application.',
          shortcuts: [
            { keys: ['⌘/Ctrl', 'K'], description: 'Open search / history search' },
            { keys: ['⌘/Ctrl', 'N'], description: 'New chat (in Report Q&A)' },
            { keys: ['⌘/Ctrl', '/'], description: 'Focus message input' },
            { keys: ['Esc'], description: 'Close dialogs / Exit full screen' },
          ],
        },
        {
          title: 'Report Q&A Shortcuts',
          description: 'Shortcuts specific to the AI chat interface.',
          shortcuts: [
            { keys: ['⌘/Ctrl', '⇧', 'C'], description: 'Copy last response' },
            { keys: ['⌘/Ctrl', 'J'], description: 'Scroll to bottom' },
            { keys: ['⌘/Ctrl', 'B'], description: 'Toggle reports panel' },
            { keys: ['⌘/Ctrl', 'Enter'], description: 'Toggle full screen' },
            { keys: ['Enter'], description: 'Send message' },
            { keys: ['Shift', 'Enter'], description: 'New line in message' },
          ],
        },
        {
          title: 'Calendar Shortcuts',
          description: 'Shortcuts for calendar navigation.',
          shortcuts: [
            { keys: ['T'], description: 'Go to today' },
            { keys: ['←', '→'], description: 'Navigate periods' },
            { keys: ['D'], description: 'Day view' },
            { keys: ['W'], description: 'Week view' },
            { keys: ['M'], description: 'Month view' },
            { keys: ['?'], description: 'Show shortcuts help' },
          ],
        },
      ],
    },
    {
      id: 'troubleshooting',
      title: 'Troubleshooting',
      icon: AlertCircle,
      description: 'Common issues and solutions',
      items: [
        {
          title: 'Report Generation Issues',
          description: 'Solutions for common report generation problems.',
          tips: [
            'If "Data Unavailable" appears, try a broader analysis mode (Address → Postcode → State)',
            'Complex analysis can take 3-7 minutes depending on data availability',
            'Avoid generating multiple reports simultaneously',
            'Check your internet connection for timeouts',
            'Verify property addresses are correctly formatted',
          ],
        },
        {
          title: 'Data Sync Issues',
          description: 'Troubleshooting data synchronization problems.',
          tips: [
            'Check the Monitoring page for API health status',
            'Manual sync can be triggered from Sources page',
            'Allow up to 24 hours for market data updates',
            'Contact support if sync failures persist',
          ],
        },
        {
          title: 'Email Copilot Issues',
          description: 'Solutions for email-related problems.',
          tips: [
            'Verify email credentials in Settings',
            'Check mailbox permissions for OAuth connections',
            'AI summaries require email body content',
            'Refresh the page if emails aren\'t loading',
          ],
        },
        {
          title: 'Best Practices',
          description: 'Tips for optimal system usage.',
          tips: [
            'Use complete addresses with suburb, state, and postcode',
            'Generate reports after major market events for current data',
            'Use consistent financial assumptions when comparing properties',
            'Regularly review and update client information',
            'Export important reports for offline access',
          ],
        },
      ],
    },
  ];

  const quickTips = [
    { icon: Search, text: 'Use ⌘/Ctrl + K to quickly search across the application' },
    { icon: Filter, text: 'Combine multiple filters for precise property and client searches' },
    { icon: Download, text: 'Download reports in PDF format for offline viewing and sharing' },
    { icon: Eye, text: 'Click on any property card to view detailed information and generate reports' },
    { icon: Target, text: 'Use the Overview dashboard for a quick snapshot of portfolio performance' },
    { icon: Bot, text: 'Ask the Report Q&A AI natural language questions about your properties' },
  ];

  const statusGuide = [
    { status: 'Active', color: 'bg-green-500', description: 'Property is currently listed and available' },
    { status: 'Pending', color: 'bg-yellow-500', description: 'Property has an offer pending or under contract' },
    { status: 'Sold', color: 'bg-blue-500', description: 'Property has been successfully sold' },
    { status: 'Withdrawn', color: 'bg-gray-500', description: 'Property has been removed from the market' },
    { status: 'Expired', color: 'bg-red-500', description: 'Listing has expired and needs renewal' },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">User Guide</h1>
        <p className="text-muted-foreground">
          Complete guide to navigating and using the NPC Property Intake Dashboard
        </p>
      </div>

      {/* Quick Tips */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            Quick Tips
          </CardTitle>
          <CardDescription>
            Essential tips to get the most out of your dashboard
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {quickTips.map((tip, index) => (
              <div key={index} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <tip.icon className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <span className="text-sm">{tip.text}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Property Status Guide */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-blue-500" />
            Property Status Guide
          </CardTitle>
          <CardDescription>
            Understanding property status indicators throughout the dashboard
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {statusGuide.map((item, index) => (
              <div key={index} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
                <div className={`w-3 h-3 rounded-full ${item.color}`} />
                <Badge variant="outline">{item.status}</Badge>
                <span className="text-sm text-muted-foreground">{item.description}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Main Sections with Accordion */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Feature Documentation
          </CardTitle>
          <CardDescription>
            Click on any section to expand and view detailed documentation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" className="w-full">
            {sections.map((section) => (
              <AccordionItem key={section.id} value={section.id}>
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <section.icon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="text-left">
                      <div className="font-semibold">{section.title}</div>
                      <div className="text-sm text-muted-foreground font-normal">
                        {section.description}
                      </div>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-6 pt-4 pl-4 border-l-2 border-primary/20 ml-5">
                    {section.items.map((item, itemIndex) => (
                      <div key={itemIndex} className="space-y-3">
                        <div>
                          <h4 className="font-semibold text-foreground">{item.title}</h4>
                          <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                        </div>

                        {item.features && (
                          <div className="space-y-2">
                            <h5 className="text-sm font-medium text-foreground">Key Features:</h5>
                            <ul className="grid gap-1 sm:grid-cols-2">
                              {item.features.map((feature, featureIndex) => (
                                <li key={featureIndex} className="flex items-start gap-2 text-sm">
                                  <CheckCircle className="h-3 w-3 text-green-500 mt-1 flex-shrink-0" />
                                  <span>{feature}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {item.steps && (
                          <div className="space-y-2">
                            <h5 className="text-sm font-medium text-foreground">Step-by-Step Guide:</h5>
                            <ol className="space-y-2">
                              {item.steps.map((step, stepIndex) => (
                                <li key={stepIndex} className="flex items-start gap-3 text-sm">
                                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center mt-0.5 font-medium">
                                    {stepIndex + 1}
                                  </span>
                                  <span className="leading-relaxed">{step}</span>
                                </li>
                              ))}
                            </ol>
                          </div>
                        )}

                        {item.tips && (
                          <div className="space-y-2">
                            <h5 className="text-sm font-medium text-foreground">Tips:</h5>
                            <ul className="space-y-1">
                              {item.tips.map((tip, tipIndex) => (
                                <li key={tipIndex} className="flex items-start gap-2 text-sm">
                                  <Sparkles className="h-3 w-3 text-amber-500 mt-1 flex-shrink-0" />
                                  <span>{tip}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {item.shortcuts && (
                          <div className="space-y-2">
                            <h5 className="text-sm font-medium text-foreground">Shortcuts:</h5>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {item.shortcuts.map((shortcut, shortcutIndex) => (
                                <div
                                  key={shortcutIndex}
                                  className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                                >
                                  <span className="text-sm text-muted-foreground">
                                    {shortcut.description}
                                  </span>
                                  <div className="flex gap-1">
                                    {shortcut.keys.map((key, keyIndex) => (
                                      <kbd
                                        key={keyIndex}
                                        className="px-2 py-1 text-xs font-semibold text-muted-foreground bg-background rounded border border-border"
                                      >
                                        {key}
                                      </kbd>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {itemIndex < section.items.length - 1 && <Separator className="my-4" />}
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      {/* Support Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Headphones className="h-5 w-5 text-primary" />
            Need Help?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            If you need additional assistance or encounter any issues:
          </p>
          <ul className="space-y-2">
            <li className="flex items-start gap-2 text-sm">
              <CheckCircle className="h-3 w-3 text-green-500 mt-1 flex-shrink-0" />
              <span>Check the Settings page for configuration options</span>
            </li>
            <li className="flex items-start gap-2 text-sm">
              <CheckCircle className="h-3 w-3 text-green-500 mt-1 flex-shrink-0" />
              <span>Use the Report Q&A AI to ask questions about features</span>
            </li>
            <li className="flex items-start gap-2 text-sm">
              <CheckCircle className="h-3 w-3 text-green-500 mt-1 flex-shrink-0" />
              <span>Review Error Logs for troubleshooting system issues</span>
            </li>
            <li className="flex items-start gap-2 text-sm">
              <CheckCircle className="h-3 w-3 text-green-500 mt-1 flex-shrink-0" />
              <span>Contact your system administrator for technical support</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

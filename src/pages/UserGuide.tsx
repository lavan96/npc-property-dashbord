import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
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
  Target
} from 'lucide-react';

export default function UserGuide() {
  const sections = [
    {
      title: "Getting Started",
      icon: Home,
      items: [
        {
          title: "Dashboard Overview",
          description: "The main dashboard provides a comprehensive view of your property data with key performance indicators (KPIs), charts, and recent activity.",
          features: ["Real-time data updates", "Interactive charts", "Quick access to all sections"]
        },
        {
          title: "Navigation",
          description: "Use the sidebar to navigate between different sections. The active page is highlighted for easy reference.",
          features: ["Collapsible sidebar", "Quick search", "User profile access"]
        }
      ]
    },
    {
      title: "Property Management",
      icon: Building2,
      items: [
        {
          title: "Listings Page",
          description: "View and manage all property listings with advanced filtering and search capabilities.",
          features: [
            "Search by address, suburb, or postcode",
            "Filter by property type, price range, and status",
            "View detailed property information",
            "Generate investment reports for individual properties"
          ]
        },
        {
          title: "Property Filters",
          description: "Use filters to narrow down properties based on your criteria.",
          features: ["State and suburb filtering", "Property type selection", "Price range filtering", "Status filtering"]
        }
      ]
    },
    {
      title: "Data Sources",
      icon: Mail,
      items: [
        {
          title: "Sources Management",
          description: "Monitor and manage your data sources to ensure consistent property information flow.",
          features: [
            "View data source status",
            "Monitor last sync times",
            "Configure data refresh settings",
            "Handle data quality issues"
          ]
        }
      ]
    },
    {
      title: "Calendar & Scheduling",
      icon: Calendar,
      items: [
        {
          title: "Calendar View",
          description: "Track important dates, inspections, and property-related events.",
          features: [
            "View upcoming inspections",
            "Track listing expiry dates",
            "Schedule property viewings",
            "Monitor important deadlines"
          ]
        }
      ]
    },
    {
      title: "Reports & Analytics",
      icon: BarChart3,
      items: [
        {
          title: "Reports Dashboard",
          description: "Create and manage comprehensive property investment reports.",
          features: [
            "Generate detailed investment analyses",
            "Market trend reports",
            "Comparative market analysis",
            "Risk assessment reports"
          ]
        },
        {
          title: "Generated Reports",
          description: "View, download, and share previously generated reports.",
          features: [
            "Report history and versioning",
            "Download as PDF",
            "Share with stakeholders",
            "Report templates and customization"
          ]
        },
        {
          title: "Charts & Visualizations",
          description: "Interactive charts and data visualizations for market analysis.",
          features: [
            "Market trend charts",
            "Property performance graphs",
            "Geographic heat maps",
            "Comparative analysis charts"
          ]
        }
      ]
    },
    {
      title: "Investment Reports",
      icon: FileText,
      items: [
        {
          title: "Creating Reports",
          description: "Generate comprehensive investment reports for specific properties or areas.",
          steps: [
            "Navigate to the property of interest",
            "Click 'Generate Investment Report'",
            "Select report parameters and analysis depth",
            "Review and customize the generated report",
            "Download or share the final report"
          ]
        },
        {
          title: "Report Features",
          description: "Each investment report includes detailed analysis and insights.",
          features: [
            "Market analysis and trends",
            "Property valuation estimates",
            "Investment risk assessment",
            "Rental yield calculations",
            "Comparable property analysis",
            "Future growth projections"
          ]
        }
      ]
    }
  ];

  const tipsList = [
    { icon: Search, text: "Use the global search bar to quickly find properties across all your data" },
    { icon: Filter, text: "Combine multiple filters for precise property searches" },
    { icon: Download, text: "Download reports in PDF format for offline viewing and sharing" },
    { icon: Eye, text: "Click on any property card to view detailed information and generate reports" },
    { icon: Target, text: "Use the Overview dashboard to get a quick snapshot of your portfolio performance" }
  ];

  const statusGuide = [
    { status: "Active", color: "bg-green-500", description: "Property is currently listed and available" },
    { status: "Pending", color: "bg-yellow-500", description: "Property has an offer pending or under contract" },
    { status: "Sold", color: "bg-blue-500", description: "Property has been successfully sold" },
    { status: "Withdrawn", color: "bg-gray-500", description: "Property has been removed from the market" },
    { status: "Expired", color: "bg-red-500", description: "Listing has expired and needs renewal" }
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
          <div className="grid gap-3">
            {tipsList.map((tip, index) => (
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
          <div className="grid gap-3">
            {statusGuide.map((item, index) => (
              <div key={index} className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${item.color}`} />
                <Badge variant="outline">{item.status}</Badge>
                <span className="text-sm text-muted-foreground">{item.description}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Main Sections */}
      <div className="space-y-6">
        {sections.map((section, sectionIndex) => (
          <Card key={sectionIndex}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <section.icon className="h-5 w-5 text-primary" />
                {section.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {section.items.map((item, itemIndex) => (
                <div key={itemIndex} className="space-y-3">
                  <div>
                    <h4 className="font-semibold text-foreground">{item.title}</h4>
                    <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                  </div>
                  
                  {item.features && (
                    <div className="space-y-2">
                      <h5 className="text-sm font-medium text-foreground">Key Features:</h5>
                      <ul className="space-y-1">
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
                      <h5 className="text-sm font-medium text-foreground">Steps:</h5>
                      <ol className="space-y-1">
                        {item.steps.map((step, stepIndex) => (
                          <li key={stepIndex} className="flex items-start gap-2 text-sm">
                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center mt-0.5">
                              {stepIndex + 1}
                            </span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                  
                  {itemIndex < section.items.length - 1 && <Separator />}
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Support Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
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
              <span>Use the search functionality to find specific properties quickly</span>
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
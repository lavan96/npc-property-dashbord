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
          description: "Access the main reports hub to create quantitative market analysis and data reports.",
          features: [
            "Market trend analysis",
            "Property performance metrics",
            "Geographic market comparisons",
            "Agent and source performance tracking"
          ],
          steps: [
            "Navigate to 'Reports' in the sidebar",
            "Choose from available report templates",
            "Configure report parameters (date range, filters, metrics)",
            "Click 'Generate Report' to create the analysis",
            "Review the generated charts and data visualizations",
            "Download or save the report for future reference"
          ]
        },
        {
          title: "Investment Report Generation",
          description: "Create comprehensive property investment analysis reports for specific properties or areas.",
          features: [
            "Detailed property market analysis",
            "Investment risk assessment",
            "Rental yield calculations and projections",
            "Comparable property analysis",
            "Growth potential evaluation",
            "Financial modeling and scenarios"
          ],
          steps: [
            "Go to 'Listings' page and find your target property",
            "Click on the property card to open detailed view",
            "Look for 'Generate Investment Report' button",
            "Choose analysis mode: Address, Postcode, or State",
            "Configure report parameters:",
            "  • Analysis depth (basic, detailed, comprehensive)",
            "  • Financial assumptions (loan terms, deposit amount)",
            "  • Time horizon for projections",
            "  • Risk tolerance settings",
            "Click 'Generate Report' to start the AI analysis",
            "Wait for the report generation (typically 2-5 minutes)",
            "Review the comprehensive 13-section report including:",
            "  • Location overview and demographics",
            "  • Market KPIs and pricing trends", 
            "  • Investment risk assessment",
            "  • Financial analysis and projections",
            "  • Overall investment score and recommendation",
            "Download the report as PDF or save to your dashboard"
          ]
        },
        {
          title: "Generated Reports Management",
          description: "View, organize, and manage all your previously generated reports.",
          features: [
            "Report history and versioning",
            "Search and filter reports by property or date",
            "Download reports in multiple formats",
            "Share reports with team members or clients",
            "Bookmark important reports for quick access"
          ],
          steps: [
            "Navigate to 'Generated Reports' in the sidebar",
            "Browse your report library organized by date",
            "Use search bar to find specific property reports",
            "Apply filters by report type, property, or date range",
            "Click on any report to view full details",
            "Use action buttons to download, share, or bookmark",
            "Access report analytics and usage statistics"
          ]
        },
        {
          title: "Charts & Data Visualization",
          description: "Create and customize interactive charts for market analysis and presentations.",
          features: [
            "Multiple chart types (bar, line, pie, scatter)",
            "Custom data filtering and grouping",
            "Export charts as images or interactive widgets",
            "Real-time data updates",
            "Comparative analysis tools"
          ],
          steps: [
            "Go to 'Charts' section from the sidebar",
            "Select chart type based on your analysis needs",
            "Choose data source and metrics to visualize",
            "Apply filters for specific regions, time periods, or property types",
            "Customize chart appearance and styling",
            "Preview the chart with live data",
            "Save chart configuration for future use",
            "Export as image or embed in reports"
          ]
        }
      ]
    },
    {
      title: "Investment Analysis Deep Dive",
      icon: FileText,
      items: [
        {
          title: "Understanding Investment Reports",
          description: "Learn what each section of the investment report contains and how to interpret the analysis.",
          features: [
            "13 comprehensive analysis sections",
            "AI-powered market research and data compilation",
            "Professional-grade investment scoring system",
            "Risk assessment with government data integration",
            "Financial modeling with multiple scenarios"
          ],
          sections: [
            {
              name: "Location Overview", 
              details: "Suburb profile, distance to CBD, lifestyle attributes, and administrative boundaries (SA2, SA3, SA4, LGA)"
            },
            {
              name: "Market KPIs", 
              details: "Median prices, historical growth, rental yields, vacancy rates, days on market, and sales volumes"
            },
            {
              name: "Demographics & Demand", 
              details: "Population trends, income levels, employment data, and household composition"
            },
            {
              name: "Infrastructure & Amenities", 
              details: "Transport links, planned developments, schools, hospitals, and recreational facilities"
            },
            {
              name: "Property-Level Analysis", 
              details: "Specific property details, asking price analysis, and comparison to local median"
            },
            {
              name: "Investment Costs", 
              details: "Stamp duty, land tax, council rates, management fees, and ongoing expenses"
            },
            {
              name: "Risk Assessment", 
              details: "Flood risk, bushfire risk, crime data, and market volatility analysis"
            },
            {
              name: "Comparable Evidence", 
              details: "Recent sales and rental comparisons within 1.5km radius"
            },
            {
              name: "Financial Analysis", 
              details: "Yield calculations, cashflow projections, and sensitivity analysis"
            },
            {
              name: "10-Year Projections", 
              details: "Conservative, base, and optimistic growth scenarios with detailed modeling"
            },
            {
              name: "Investment Score", 
              details: "Weighted scoring system (100 points) covering momentum, yield, risk, demand, and supply"
            },
            {
              name: "Opportunities & Risks", 
              details: "Key factors that could positively or negatively impact investment performance"
            },
            {
              name: "Data Sources", 
              details: "Transparency section listing all data sources, dates, and methodology"
            }
          ]
        },
        {
          title: "Report Generation Modes",
          description: "Choose the appropriate analysis mode based on your investment focus.",
          modes: [
            {
              name: "Address Mode",
              usage: "For analyzing a specific property",
              example: "5 Lawrence Street, Bayswater WA 6053",
              benefits: ["Property-specific analysis", "Exact location data", "Precise comparable sales", "Detailed property information"]
            },
            {
              name: "Postcode Mode", 
              usage: "For analyzing an entire postcode area",
              example: "Postcode 6053, WA",
              benefits: ["Broader market analysis", "Multiple suburb comparison", "Area-wide trends", "Investment opportunity scanning"]
            },
            {
              name: "State Mode",
              usage: "For high-level state market analysis", 
              example: "Western Australia",
              benefits: ["State-wide market overview", "Policy impact analysis", "Inter-state comparisons", "Macro economic factors"]
            }
          ]
        },
        {
          title: "Advanced Report Features",
          description: "Leverage advanced features for more sophisticated investment analysis.",
          features: [
            "Multi-scenario financial modeling",
            "Sensitivity analysis for key variables",
            "Risk-adjusted return calculations",
            "Market cycle timing analysis",
            "Portfolio diversification insights"
          ],
          steps: [
            "Access advanced options during report generation",
            "Configure custom financial assumptions:",
            "  • Loan-to-value ratio (LVR)",
            "  • Interest rate assumptions",
            "  • Property management fees",
            "  • Maintenance and vacancy allowances",
            "Adjust analysis parameters:",
            "  • Investment time horizon",
            "  • Growth rate assumptions", 
            "  • Risk tolerance settings",
            "  • Target return expectations",
            "Review sensitivity analysis showing impact of:",
            "  • Interest rate changes (+/-1%)",
            "  • Rental growth variations",
            "  • Capital growth scenarios",
            "  • Market cycle fluctuations",
            "Interpret the investment score breakdown:",
            "  • Market momentum (25 points)",
            "  • Yield and cashflow (30 points)",
            "  • Risk factors (20 points)",
            "  • Demand drivers (15 points)",
            "  • Supply factors (10 points)",
            "Use the final recommendation (Buy/Hold/Sell/Wait) as guidance"
          ]
        }
      ]
    },
    {
      title: "Troubleshooting & Best Practices",
      icon: Settings,
      items: [
        {
          title: "Report Generation Issues",
          description: "Common issues and solutions when generating investment reports.",
          issues: [
            {
              problem: "Report shows 'Data Unavailable' for key metrics",
              solutions: [
                "Try switching to a broader analysis mode (Address → Postcode → State)",
                "Check if the property/area has sufficient market data",
                "Verify the property address is correctly formatted",
                "Wait for market data to update (daily refresh cycle)"
              ]
            },
            {
              problem: "Report generation takes longer than expected",
              solutions: [
                "Complex analysis can take 3-7 minutes depending on data availability",
                "Check your internet connection stability",
                "Avoid generating multiple reports simultaneously",
                "Monitor the progress indicator for status updates"
              ]
            },
            {
              problem: "Investment score seems inconsistent",
              solutions: [
                "Review the score breakdown to understand weighting factors",
                "Compare with similar properties in the same area",
                "Consider market conditions and data quality indicators",
                "Check the data sources section for transparency"
              ]
            }
          ]
        },
        {
          title: "Optimizing Report Quality",
          description: "Best practices to get the most accurate and useful investment reports.",
          practices: [
            {
              tip: "Property Address Formatting",
              description: "Use complete addresses with suburb, state, and postcode for best results",
              example: "Correct: '123 Main Street, Suburbs NSW 2000' vs Incorrect: '123 Main St'"
            },
            {
              tip: "Timing Your Analysis",
              description: "Generate reports after major market events or data releases for most current insights",
              example: "Best after RBA interest rate decisions, census data releases, or major infrastructure announcements"
            },
            {
              tip: "Comparing Multiple Properties",
              description: "Generate reports for several properties in the same session for consistent comparison",
              example: "Use the same financial assumptions across properties for accurate relative analysis"
            }
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

                  {item.sections && (
                    <div className="space-y-3">
                      <h5 className="text-sm font-medium text-foreground">Report Sections Explained:</h5>
                      <div className="grid gap-3">
                        {item.sections.map((section, sectionIndex) => (
                          <div key={sectionIndex} className="p-3 rounded-lg bg-muted/30 border border-border/50">
                            <h6 className="font-medium text-sm text-foreground mb-1">{section.name}</h6>
                            <p className="text-xs text-muted-foreground">{section.details}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {item.modes && (
                    <div className="space-y-3">
                      <h5 className="text-sm font-medium text-foreground">Analysis Modes:</h5>
                      <div className="grid gap-3">
                        {item.modes.map((mode, modeIndex) => (
                          <div key={modeIndex} className="p-4 rounded-lg bg-muted/30 border border-border/50">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="outline" className="text-xs">{mode.name}</Badge>
                              <span className="text-sm font-medium">{mode.usage}</span>
                            </div>
                            <p className="text-xs text-muted-foreground mb-2">Example: {mode.example}</p>
                            <ul className="space-y-1">
                              {mode.benefits.map((benefit, benefitIndex) => (
                                <li key={benefitIndex} className="flex items-start gap-2 text-xs">
                                  <CheckCircle className="h-3 w-3 text-green-500 mt-0.5 flex-shrink-0" />
                                  <span>{benefit}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {item.issues && (
                    <div className="space-y-3">
                      <h5 className="text-sm font-medium text-foreground">Common Issues & Solutions:</h5>
                      <div className="space-y-3">
                        {item.issues.map((issue, issueIndex) => (
                          <div key={issueIndex} className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800">
                            <h6 className="font-medium text-sm text-foreground mb-2 flex items-center gap-2">
                              <AlertCircle className="h-4 w-4 text-yellow-600" />
                              {issue.problem}
                            </h6>
                            <ul className="space-y-1">
                              {issue.solutions.map((solution, solutionIndex) => (
                                <li key={solutionIndex} className="flex items-start gap-2 text-xs">
                                  <CheckCircle className="h-3 w-3 text-green-500 mt-0.5 flex-shrink-0" />
                                  <span>{solution}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {item.practices && (
                    <div className="space-y-3">
                      <h5 className="text-sm font-medium text-foreground">Best Practices:</h5>
                      <div className="space-y-3">
                        {item.practices.map((practice, practiceIndex) => (
                          <div key={practiceIndex} className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                            <h6 className="font-medium text-sm text-foreground mb-1">{practice.tip}</h6>
                            <p className="text-xs text-muted-foreground mb-2">{practice.description}</p>
                            <div className="text-xs bg-white dark:bg-gray-800 p-2 rounded border">
                              <span className="font-medium">Example: </span>{practice.example}
                            </div>
                          </div>
                        ))}
                      </div>
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
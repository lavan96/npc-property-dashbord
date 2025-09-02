import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

interface ChartData {
  id: string;
  chart_type: string;
  title: string;
  image_data: string;
  created_at: string;
  report_id: string;
  generated_reports: {
    id: string;
    title: string;
    created_at: string;
  } | null;
}

export default function Charts() {
  const [charts, setCharts] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCharts();
  }, []);

  const fetchCharts = async () => {
    try {
      console.log('Fetching charts...');
      
      // First, get charts with a simpler query
      const { data: chartsData, error: chartsError } = await supabase
        .from('charts')
        .select('*')
        .order('created_at', { ascending: false });

      if (chartsError) {
        console.error('Error fetching charts:', chartsError);
        return;
      }

      console.log('Charts data:', chartsData);

      // Then get the reports separately if needed
      const reportIds = [...new Set(chartsData?.map(chart => chart.report_id).filter(Boolean) || [])];
      let reportsMap = new Map();

      if (reportIds.length > 0) {
        const { data: reportsData, error: reportsError } = await supabase
          .from('generated_reports')
          .select('id, title, created_at')
          .in('id', reportIds);

        if (!reportsError && reportsData) {
          reportsData.forEach(report => {
            reportsMap.set(report.id, report);
          });
        }
      }

      // Transform the data to match our interface
      const transformedData = (chartsData || []).map(chart => ({
        ...chart,
        generated_reports: chart.report_id ? reportsMap.get(chart.report_id) || null : null
      }));

      console.log('Transformed data:', transformedData);
      setCharts(transformedData);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 space-y-4 p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <h2 className="text-3xl font-bold tracking-tight">Charts</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="space-y-2">
                <div className="h-4 bg-muted rounded w-3/4"></div>
                <div className="h-3 bg-muted rounded w-1/2"></div>
              </CardHeader>
              <CardContent>
                <div className="h-48 bg-muted rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Charts</h2>
          <p className="text-muted-foreground">
            Generated charts from all reports
          </p>
        </div>
        <Badge variant="secondary">{charts.length} charts</Badge>
      </div>

      {charts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-96 space-y-4">
            <div className="text-6xl text-muted-foreground">📊</div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold">No charts generated yet</h3>
              <p className="text-muted-foreground">
                Generate your first report to see charts here
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {charts.map((chart) => (
            <Card key={chart.id} className="overflow-hidden">
              <CardHeader>
                <CardTitle className="text-lg">{chart.title}</CardTitle>
                <CardDescription>
                  From report: {chart.generated_reports?.title || 'Unknown Report'}
                </CardDescription>
                <CardDescription className="text-xs">
                  Generated on {format(new Date(chart.created_at), 'PPp')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${
                      chart.chart_type === 'bar' ? 'bg-blue-500' :
                      chart.chart_type === 'pie' ? 'bg-green-500' :
                      chart.chart_type === 'line' ? 'bg-purple-500' : 'bg-gray-500'
                    }`} />
                    <h4 className="text-sm font-medium capitalize">
                      {chart.chart_type} Chart
                    </h4>
                  </div>
                  <div className="bg-white p-2 rounded-lg border">
                    {chart.image_data ? (
                      <div 
                        dangerouslySetInnerHTML={{
                          __html: chart.image_data.startsWith('data:image/svg+xml;base64,') 
                            ? atob(chart.image_data.replace('data:image/svg+xml;base64,', ''))
                            : chart.image_data.startsWith('<svg') 
                              ? chart.image_data 
                              : ''
                        }}
                        className="w-full"
                        onError={(e) => {
                          console.error('SVG rendering error:', e);
                        }}
                      />
                    ) : (
                      <div className="h-48 flex items-center justify-center text-muted-foreground">
                        No chart data available
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
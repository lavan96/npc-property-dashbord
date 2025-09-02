import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

interface ChartData {
  id: string;
  title: string;
  created_at: string;
  chart_images: any;
}

export default function Charts() {
  const [charts, setCharts] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCharts();
  }, []);

  const fetchCharts = async () => {
    try {
      const { data, error } = await supabase
        .from('generated_reports')
        .select('id, title, created_at, chart_images')
        .not('chart_images', 'is', null)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching charts:', error);
        return;
      }

      setCharts(data || []);
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
        <Badge variant="secondary">{charts.length} reports with charts</Badge>
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
          {charts.map((report) => (
            <Card key={report.id} className="overflow-hidden">
              <CardHeader>
                <CardTitle className="text-lg">{report.title}</CardTitle>
                <CardDescription>
                  Generated on {format(new Date(report.created_at), 'PPp')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {report.chart_images && typeof report.chart_images === 'object' && Object.entries(report.chart_images).map(([chartType, imageData]) => (
                  <div key={chartType} className="space-y-2">
                    <h4 className="text-sm font-medium capitalize">
                      {chartType.replace(/_/g, ' ')} Chart
                    </h4>
                    <div className="bg-white p-2 rounded-lg border">
                      <img
                        src={imageData as string}
                        alt={`${chartType} chart`}
                        className="w-full h-auto rounded"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                        }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
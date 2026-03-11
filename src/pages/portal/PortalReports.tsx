import { useState } from 'react';
import { usePortalReportsData } from '@/hooks/usePortalData';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  FileText, Search, Loader2, Download, Eye, Clock,
  BarChart3, PiggyBank, TrendingUp, FileBarChart, Inbox
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

const SUPABASE_URL = "https://dduzbchuswwbefdunfct.supabase.co";

const reportTypeConfig: Record<string, { label: string; icon: typeof FileText; color: string }> = {
  investment: { label: 'Investment Report', icon: FileBarChart, color: 'bg-blue-500/10 text-blue-600' },
  portfolio: { label: 'Portfolio Review', icon: BarChart3, color: 'bg-emerald-500/10 text-emerald-600' },
  borrowing_capacity: { label: 'Borrowing Capacity', icon: PiggyBank, color: 'bg-amber-500/10 text-amber-600' },
  cash_flow: { label: 'Cash Flow Analysis', icon: TrendingUp, color: 'bg-purple-500/10 text-purple-600' },
};

function getReportConfig(type: string) {
  return reportTypeConfig[type] || { label: type, icon: FileText, color: 'bg-muted text-muted-foreground' };
}

const filterOptions = [
  { value: 'all', label: 'All Reports' },
  { value: 'investment', label: 'Investment' },
  { value: 'portfolio', label: 'Portfolio' },
  { value: 'borrowing_capacity', label: 'Borrowing Capacity' },
  { value: 'cash_flow', label: 'Cash Flow' },
];

export default function PortalReports() {
  const { data, isLoading } = usePortalReportsData();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const reports = data?.reports || [];

  const filtered = reports.filter((r: any) => {
    const matchesSearch = !search ||
      r.report_title?.toLowerCase().includes(search.toLowerCase()) ||
      r.notes?.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === 'all' || r.report_type === typeFilter;
    return matchesSearch && matchesType;
  });

  const handleDownload = (report: any) => {
    if (!report.storage_path) return;
    const url = `${SUPABASE_URL}/storage/v1/object/public/client-files/${report.storage_path}`;
    window.open(url, '_blank');
  };

  const handleView = (report: any) => {
    if (!report.storage_path) return;
    const url = `${SUPABASE_URL}/storage/v1/object/public/client-files/${report.storage_path}`;
    window.open(url, '_blank');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Reports</h1>
        <p className="text-muted-foreground mt-1">Reports shared with you by your advisor</p>
      </div>

      {/* Filters */}
      {reports.length > 0 && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search reports..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {filterOptions.map((opt) => (
              <Button
                key={opt.value}
                variant={typeFilter === opt.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTypeFilter(opt.value)}
                className="text-xs"
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Reports List */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Inbox className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">
              {search || typeFilter !== 'all' ? 'No reports match your filters.' : 'No reports have been shared with you yet.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((report: any) => {
            const config = getReportConfig(report.report_type);
            const Icon = config.icon;
            return (
              <Card key={report.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-start gap-3 sm:gap-4">
                    <div className={`p-2.5 rounded-xl ${config.color} shrink-0`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <p className="text-sm font-semibold text-foreground truncate">{report.report_title}</p>
                            {!report.is_read && (
                              <Badge className="bg-primary/10 text-primary text-[10px] px-1.5 py-0">New</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-[10px]">{config.label}</Badge>
                            {report.report_tier && (
                              <Badge variant="secondary" className="text-[10px] capitalize">{report.report_tier}</Badge>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-muted-foreground">
                            {report.published_at ? format(new Date(report.published_at), 'dd MMM yyyy') : '—'}
                          </p>
                          <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                            {report.published_at ? formatDistanceToNow(new Date(report.published_at), { addSuffix: true }) : ''}
                          </p>
                        </div>
                      </div>

                      {report.notes && (
                        <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{report.notes}</p>
                      )}

                      {report.storage_path && (
                        <div className="flex items-center gap-2 mt-3">
                          <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => handleView(report)}>
                            <Eye className="h-3.5 w-3.5 mr-1.5" />
                            View
                          </Button>
                          <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => handleDownload(report)}>
                            <Download className="h-3.5 w-3.5 mr-1.5" />
                            Download
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {filtered.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          Showing {filtered.length} report{filtered.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}

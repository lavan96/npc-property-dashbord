import { Archive, Building2, Calendar, Compass, FileText, Globe, Home, Map, SlidersHorizontal, Star, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { InvestmentReport } from './types';

interface Props {
  isMobile: boolean; investmentSearchQuery: string; setInvestmentSearchQuery: (v:string)=>void; setInvestmentPage:(v:number)=>void;
  scopeFilter:string; setScopeFilter:(v:string)=>void; gradeFilter:string; setGradeFilter:(v:string)=>void; tierFilter:string; setTierFilter:(v:string)=>void; sourceFilter:string; setSourceFilter:(v:string)=>void;
  scoreRange:[number,number]; setScoreRange:(v:[number,number])=>void; showArchived:boolean; setShowArchived:(v:boolean)=>void;
  dateRange:string; setDateRange:(v:string)=>void; customFrom:string; setCustomFrom:(v:string)=>void; customTo:string; setCustomTo:(v:string)=>void; dateRangeLabel:string;
  filteredCount:number; investmentReports:InvestmentReport[]; getGradeColor:(grade:string)=>string;
}

export function ReportLibraryToolbar(props: Props) {
  const { isMobile, investmentSearchQuery, setInvestmentSearchQuery, setInvestmentPage, scopeFilter, setScopeFilter, gradeFilter, setGradeFilter, tierFilter, setTierFilter, sourceFilter, setSourceFilter, scoreRange, setScoreRange, showArchived, setShowArchived, dateRange, setDateRange, customFrom, setCustomFrom, customTo, setCustomTo, dateRangeLabel, filteredCount, investmentReports, getGradeColor } = props;
  const setFilter = (setter: (v: string) => void) => (value: string) => { setter(value); setInvestmentPage(1); };
  return (
    <div className="flex flex-col gap-4 mb-4">
      <div className="flex items-center gap-2 md:gap-4">
        <div className="relative flex-1"><Input type="text" placeholder="Search by property address..." value={investmentSearchQuery} onChange={(e) => { setInvestmentSearchQuery(e.target.value); setInvestmentPage(1); }} /></div>
        {isMobile ? (
          <Sheet><SheetTrigger asChild><Button variant="outline" size="icon" className="shrink-0"><SlidersHorizontal className="h-4 w-4" /></Button></SheetTrigger><SheetContent side="bottom" className="h-[70vh] flex flex-col p-0"><SheetHeader className="p-4 border-b"><SheetTitle>Report Filters</SheetTitle></SheetHeader><ScrollArea className="flex-1 p-4"><div className="space-y-4">
            <FilterSelect label="Scope" value={scopeFilter} onValueChange={setFilter(setScopeFilter)} items={[['all','All Reports'],['address','Property Analysis'],['suburb','Suburb Analysis'],['zipcode','Postcode Analysis'],['state','State Analysis']]} />
            <FilterSelect label="Grade" value={gradeFilter} onValueChange={setFilter(setGradeFilter)} items={['all','A+','A','B+','B','C+','C','D','F'].map(g => [g, g === 'all' ? 'All Grades' : `Grade ${g}`])} />
            <FilterSelect label="Tier" value={tierFilter} onValueChange={setFilter(setTierFilter)} items={[['all','All Tiers'],['compass','Compass (Full)'],['briefing','Briefing (~20p)'],['snapshot','Snapshot (~5p)']]} />
            <FilterSelect label="Source" value={sourceFilter} onValueChange={setFilter(setSourceFilter)} items={[['all','All Sources'],['manual','Manual'],['auto','Auto-generated']]} />
            <div className="space-y-2"><label className="text-sm font-medium">Score Range: {scoreRange[0]} - {scoreRange[1]}</label><Slider value={scoreRange} onValueChange={(value) => { setScoreRange(value as [number, number]); setInvestmentPage(1); }} min={0} max={100} step={5} /></div>
            <Button variant={showArchived ? 'secondary' : 'outline'} className="w-full gap-2" onClick={() => setShowArchived(!showArchived)}><Archive className="h-4 w-4" />{showArchived ? 'Viewing Archived' : 'Show Archived'}</Button>
          </div></ScrollArea></SheetContent></Sheet>
        ) : (<>
          <Select value={scopeFilter} onValueChange={setFilter(setScopeFilter)}><SelectTrigger className="w-[180px]"><SelectValue placeholder="Filter by scope" /></SelectTrigger><SelectContent className="bg-background z-50"><SelectItem value="all">All Reports</SelectItem><SelectItem value="address"><div className="flex items-center gap-2"><Home className="h-4 w-4" />Property Analysis</div></SelectItem><SelectItem value="suburb"><div className="flex items-center gap-2"><Building2 className="h-4 w-4" />Suburb Analysis</div></SelectItem><SelectItem value="zipcode"><div className="flex items-center gap-2"><Map className="h-4 w-4" />Postcode Analysis</div></SelectItem><SelectItem value="state"><div className="flex items-center gap-2"><Globe className="h-4 w-4" />State Analysis</div></SelectItem></SelectContent></Select>
          <Select value={gradeFilter} onValueChange={setFilter(setGradeFilter)}><SelectTrigger className="w-[140px]"><SelectValue placeholder="Filter by grade" /></SelectTrigger><SelectContent className="bg-background z-50"><SelectItem value="all">All Grades</SelectItem>{['A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'F'].map(g => <SelectItem key={g} value={g}><div className="flex items-center gap-2"><span className={`w-5 h-5 rounded text-xs font-bold flex items-center justify-center ${getGradeColor(g)}`}>{g}</span>Grade {g}</div></SelectItem>)}</SelectContent></Select>
          <Select value={tierFilter} onValueChange={setFilter(setTierFilter)}><SelectTrigger className="w-[160px]"><SelectValue placeholder="Filter by tier" /></SelectTrigger><SelectContent className="bg-background z-50"><SelectItem value="all">All Tiers</SelectItem><SelectItem value="compass"><div className="flex items-center gap-2"><Compass className="h-4 w-4 text-amber-500" />Compass (Full)</div></SelectItem><SelectItem value="briefing"><div className="flex items-center gap-2"><FileText className="h-4 w-4 text-blue-500" />Briefing (~20p)</div></SelectItem><SelectItem value="snapshot"><div className="flex items-center gap-2"><Zap className="h-4 w-4 text-green-500" />Snapshot (~5p)</div></SelectItem></SelectContent></Select>
          <Select value={sourceFilter} onValueChange={setFilter(setSourceFilter)}><SelectTrigger className="w-[160px]"><SelectValue placeholder="Filter by source" /></SelectTrigger><SelectContent className="bg-background z-50"><SelectItem value="all">All Sources</SelectItem><SelectItem value="manual">Manual</SelectItem><SelectItem value="auto">Auto-generated</SelectItem></SelectContent></Select>
          <Button variant={showArchived ? 'secondary' : 'outline'} size="sm" onClick={() => setShowArchived(!showArchived)} className="gap-2"><Archive className="h-4 w-4" />{showArchived ? 'Viewing Archived' : 'Show Archived'}</Button>
        </>)}
        {!showArchived && <div className="flex items-center gap-2 flex-wrap"><Select value={dateRange} onValueChange={setDateRange}><SelectTrigger className="w-[170px] h-9"><Calendar className="h-4 w-4 mr-1 text-muted-foreground" /><SelectValue placeholder="Date range" /></SelectTrigger><SelectContent className="bg-background z-50"><SelectItem value="7">Last 7 days</SelectItem><SelectItem value="30">Last 30 days</SelectItem><SelectItem value="90">Last 90 days</SelectItem><SelectItem value="180">Last 6 months</SelectItem><SelectItem value="365">Last 12 months</SelectItem><SelectItem value="all">All time</SelectItem><SelectItem value="custom">Custom range…</SelectItem></SelectContent></Select>{dateRange === 'custom' && <div className="flex items-center gap-1"><Input type="date" value={customFrom} max={customTo || undefined} onChange={(e) => setCustomFrom(e.target.value)} className="h-9 w-[150px]" aria-label="From date" /><span className="text-muted-foreground text-xs">→</span><Input type="date" value={customTo} min={customFrom || undefined} onChange={(e) => setCustomTo(e.target.value)} className="h-9 w-[150px]" aria-label="To date" /></div>}</div>}
        <Badge variant="secondary" className="hidden md:inline-flex">{filteredCount} of {investmentReports.filter(r => showArchived ? r.is_archived : !r.is_archived).length} reports</Badge>
        {!showArchived && <span className="text-xs text-muted-foreground hidden md:inline">{dateRangeLabel}</span>}
      </div>
      {!isMobile && <div className="flex items-center gap-4 px-1"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Star className="h-4 w-4" /><span>Score Range:</span></div><div className="flex-1 max-w-md flex items-center gap-4"><span className="text-sm font-medium w-8">{scoreRange[0]}</span><Slider value={scoreRange} onValueChange={(value) => { setScoreRange(value as [number, number]); setInvestmentPage(1); }} min={0} max={100} step={5} className="flex-1" /><span className="text-sm font-medium w-8">{scoreRange[1]}</span></div>{(scoreRange[0] > 0 || scoreRange[1] < 100) && <Button variant="ghost" size="sm" onClick={() => setScoreRange([0, 100])} className="text-xs">Reset</Button>}</div>}
      {isMobile && (scopeFilter !== 'all' || gradeFilter !== 'all' || tierFilter !== 'all' || sourceFilter !== 'all' || scoreRange[0] > 0 || scoreRange[1] < 100) && <div className="flex items-center gap-2 flex-wrap"><Badge variant="secondary" className="text-xs">{[scopeFilter !== 'all', gradeFilter !== 'all', tierFilter !== 'all', sourceFilter !== 'all', scoreRange[0] > 0 || scoreRange[1] < 100].filter(Boolean).length} filter(s)</Badge><Badge variant="outline" className="text-xs">{filteredCount} reports</Badge></div>}
    </div>
  );
}

function FilterSelect({ label, value, onValueChange, items }: { label: string; value: string; onValueChange: (v:string)=>void; items: string[][] }) {
  return <div className="space-y-2"><label className="text-sm font-medium">{label}</label><Select value={value} onValueChange={onValueChange}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent className="bg-background z-50">{items.map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>;
}

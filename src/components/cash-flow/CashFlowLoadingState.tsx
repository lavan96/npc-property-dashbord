import { Card, CardContent, CardHeader } from '@/components/ui/card';

export function CashFlowLoadingState() {
  return <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{[1,2,3,4,5,6].map((i)=><Card key={i} className="animate-pulse"><CardHeader><div className="h-4 w-3/4 rounded bg-muted"/><div className="mt-2 h-3 w-1/2 rounded bg-muted"/></CardHeader><CardContent><div className="h-28 rounded bg-muted"/></CardContent></Card>)}</div>;
}

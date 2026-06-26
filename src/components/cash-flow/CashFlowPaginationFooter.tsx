import { Button } from '@/components/ui/button';

interface CashFlowPaginationFooterProps { filteredCount: number; loadedCount: number; hasMore: boolean; loadingMore: boolean; onLoadMore: () => void; }
export function CashFlowPaginationFooter({ filteredCount, loadedCount, hasMore, loadingMore, onLoadMore }: CashFlowPaginationFooterProps) {
  return <div className="flex flex-col items-center justify-between gap-3 rounded-2xl border bg-muted/20 p-4 sm:flex-row"><p className="text-sm text-muted-foreground">Showing {filteredCount} of {loadedCount} loaded report{loadedCount === 1 ? '' : 's'}{hasMore ? ' — more available' : ''}</p>{hasMore && <Button variant="outline" onClick={onLoadMore} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Load more reports'}</Button>}</div>;
}

import { useState, useEffect } from 'react';
import { FileText, Eye, X, Loader2, FileWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface PDFThumbnailProps {
  fileName: string;
  content: string;
  uploadedAt: Date;
  onRemove?: () => void;
  isActive?: boolean;
  onClick?: () => void;
  className?: string;
}

export function PDFThumbnail({
  fileName,
  content,
  uploadedAt,
  onRemove,
  isActive,
  onClick,
  className
}: PDFThumbnailProps) {
  const [showPreview, setShowPreview] = useState(false);
  
  // Extract first ~500 chars as preview text
  const previewText = content.substring(0, 500).replace(/\n+/g, ' ').trim();
  const wordCount = content.split(/\s+/).length;
  const pageEstimate = Math.ceil(wordCount / 300); // Rough estimate: ~300 words per page
  
  // Get file size estimate based on content length
  const contentSizeKB = Math.round(content.length / 1024);
  
  return (
    <div 
      className={cn(
        "group relative rounded-lg border-2 transition-all cursor-pointer overflow-hidden",
        isActive 
          ? "border-primary bg-primary/5 ring-2 ring-primary/20" 
          : "border-border hover:border-primary/50 bg-muted/30",
        className
      )}
      onClick={onClick}
    >
      {/* Thumbnail preview area */}
      <div className="aspect-[3/4] relative bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
        {/* Decorative PDF icon with lines */}
        <div className="absolute inset-4 flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded bg-red-500/20 flex items-center justify-center">
              <FileText className="h-3.5 w-3.5 text-red-500" />
            </div>
            <div className="flex-1 h-2 bg-muted-foreground/10 rounded" />
          </div>
          {/* Fake content lines */}
          <div className="flex-1 space-y-1.5">
            {[...Array(6)].map((_, i) => (
              <div 
                key={i} 
                className="h-1.5 bg-muted-foreground/10 rounded" 
                style={{ width: `${70 + Math.random() * 30}%` }}
              />
            ))}
          </div>
        </div>
        
        {/* Active indicator */}
        {isActive && (
          <div className="absolute top-2 right-2">
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary text-primary-foreground">
              ACTIVE
            </span>
          </div>
        )}
        
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <Dialog open={showPreview} onOpenChange={setShowPreview}>
            <DialogTrigger asChild>
              <Button 
                variant="secondary" 
                size="sm" 
                className="gap-1.5"
                onClick={(e) => e.stopPropagation()}
              >
                <Eye className="h-3.5 w-3.5" />
                Preview
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-red-500" />
                  {fileName}
                </DialogTitle>
              </DialogHeader>
              <ScrollArea className="max-h-[60vh]">
                <div className="p-4 bg-muted/50 rounded-lg font-mono text-xs whitespace-pre-wrap">
                  {content.substring(0, 5000)}
                  {content.length > 5000 && (
                    <span className="text-muted-foreground italic">
                      ... ({content.length - 5000} more characters)
                    </span>
                  )}
                </div>
              </ScrollArea>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      
      {/* Info footer */}
      <div className="p-2 border-t bg-background">
        <div className="flex items-start justify-between gap-1">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate" title={fileName}>
              {fileName.replace('.pdf', '')}
            </p>
            <p className="text-[10px] text-muted-foreground">
              ~{pageEstimate} pages • {contentSizeKB}KB
            </p>
          </div>
          {onRemove && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

interface UploadProgressItemProps {
  fileName: string;
  progress: number;
  status: 'uploading' | 'processing' | 'complete' | 'error';
  error?: string;
}

export function UploadProgressItem({ fileName, progress, status, error }: UploadProgressItemProps) {
  return (
    <div className="flex items-center gap-3 p-2 bg-muted/50 rounded-lg">
      <div className="flex-shrink-0">
        {status === 'error' ? (
          <FileWarning className="h-5 w-5 text-destructive" />
        ) : status === 'complete' ? (
          <FileText className="h-5 w-5 text-green-500" />
        ) : (
          <Loader2 className="h-5 w-5 text-primary animate-spin" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{fileName}</p>
        <div className="flex items-center gap-2 mt-1">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div 
              className={cn(
                "h-full transition-all duration-300",
                status === 'error' ? "bg-destructive" : "bg-primary"
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground min-w-[40px] text-right">
            {status === 'error' ? 'Error' : 
             status === 'complete' ? 'Done' :
             status === 'processing' ? 'Processing...' :
             `${progress}%`}
          </span>
        </div>
        {error && (
          <p className="text-xs text-destructive mt-1">{error}</p>
        )}
      </div>
    </div>
  );
}

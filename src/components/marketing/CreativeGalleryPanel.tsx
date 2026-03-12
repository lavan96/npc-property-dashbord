import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Loader2, Image, DollarSign, MousePointerClick, Eye, Target, Trophy, Play, Volume2, VolumeX, Maximize2, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CreativeGalleryProps {
  datePreset: string;
}

function formatCurrency(val: number) {
  return `$${val.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNum(val: number) {
  return val.toLocaleString('en-AU');
}

interface Creative {
  ad_id: string;
  ad_name: string;
  status: string;
  thumbnail_url: string | null;
  image_url: string | null;
  title: string | null;
  body: string | null;
  is_video: boolean;
  video_url: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  reach: number;
  leads: number;
  cpl: number;
}

export function CreativeGalleryPanel({ datePreset }: CreativeGalleryProps) {
  const [previewCreative, setPreviewCreative] = useState<Creative | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['meta-ads-creatives', datePreset],
    queryFn: async () => {
      const { data, error } = await invokeSecureFunction('analyze-meta-ads-phase5', {
        action: 'creatives',
        datePreset,
        limit: 20,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const creatives: Creative[] = data?.creatives || [];

  const bestCTR = creatives.length > 0 ? creatives.reduce((best, c) => c.ctr > (best?.ctr || 0) ? c : best, creatives[0]) : null;
  const bestCPL = creatives.filter(c => c.leads > 0).sort((a, b) => a.cpl - b.cpl)[0] || null;

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Image className="h-5 w-5 text-primary" />
            Creative Performance Gallery
          </CardTitle>
          <CardDescription>Ad creatives ranked by spend with performance metrics</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading creatives...</span>
            </div>
          ) : creatives.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <Image className="h-10 w-10 mx-auto mb-2 opacity-30" />
              No ad creatives with spend found for this period
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {creatives.map((creative) => {
                const isBestCTR = bestCTR?.ad_id === creative.ad_id;
                const isBestCPL = bestCPL?.ad_id === creative.ad_id;
                // Use full image_url for display, fall back to thumbnail
                const displayUrl = creative.image_url || creative.thumbnail_url;

                return (
                  <div
                    key={creative.ad_id}
                    className={cn(
                      'rounded-lg border border-border overflow-hidden transition-shadow hover:shadow-md group',
                      (isBestCTR || isBestCPL) && 'ring-1 ring-primary/30'
                    )}
                  >
                    {/* Media */}
                    <div
                      className="aspect-video bg-muted relative overflow-hidden cursor-pointer"
                      onClick={() => setPreviewCreative(creative)}
                    >
                      {displayUrl ? (
                        <img
                          src={displayUrl}
                          alt={creative.ad_name}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Image className="h-8 w-8 text-muted-foreground/30" />
                        </div>
                      )}

                      {/* Video indicator */}
                      {creative.is_video && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="h-10 w-10 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center shadow-lg transition-transform group-hover:scale-110">
                            <Play className="h-5 w-5 text-foreground ml-0.5" />
                          </div>
                        </div>
                      )}

                      {/* Expand hint */}
                      <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="h-6 w-6 rounded bg-background/80 backdrop-blur-sm flex items-center justify-center">
                          <Maximize2 className="h-3 w-3 text-foreground" />
                        </div>
                      </div>

                      {/* Status badge */}
                      <Badge
                        variant={creative.status === 'ACTIVE' ? 'default' : 'secondary'}
                        className="absolute top-2 right-2 text-[9px] px-1.5 py-0"
                      >
                        {creative.status}
                      </Badge>

                      {/* Winner badges */}
                      {(isBestCTR || isBestCPL) && (
                        <div className="absolute top-2 left-2 flex gap-1">
                          {isBestCTR && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge className="bg-primary text-primary-foreground text-[9px] px-1.5 py-0 gap-0.5">
                                  <Trophy className="h-2.5 w-2.5" /> CTR
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>Best click-through rate</TooltipContent>
                            </Tooltip>
                          )}
                          {isBestCPL && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge className="bg-emerald-600 text-white text-[9px] px-1.5 py-0 gap-0.5">
                                  <Trophy className="h-2.5 w-2.5" /> CPL
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>Lowest cost per lead</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-3 space-y-2">
                      <p className="text-sm font-medium text-foreground truncate" title={creative.ad_name}>
                        {creative.ad_name}
                      </p>
                      {creative.title && (
                        <p className="text-xs text-muted-foreground truncate">{creative.title}</p>
                      )}

                      {/* Metrics grid */}
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 pt-1">
                        <MetricItem icon={<DollarSign className="h-3 w-3" />} label="Spend" value={formatCurrency(creative.spend)} />
                        <MetricItem icon={<Eye className="h-3 w-3" />} label="Impr" value={formatNum(creative.impressions)} />
                        <MetricItem icon={<MousePointerClick className="h-3 w-3" />} label="CTR" value={`${creative.ctr.toFixed(2)}%`} highlight={isBestCTR} />
                        <MetricItem icon={<Target className="h-3 w-3" />} label="Leads" value={formatNum(creative.leads)} />
                        {creative.leads > 0 && (
                          <MetricItem icon={<DollarSign className="h-3 w-3" />} label="CPL" value={formatCurrency(creative.cpl)} highlight={isBestCPL} />
                        )}
                        <MetricItem icon={<MousePointerClick className="h-3 w-3" />} label="CPC" value={formatCurrency(creative.cpc)} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview Modal */}
      <CreativePreviewModal
        creative={previewCreative}
        onClose={() => setPreviewCreative(null)}
      />
    </>
  );
}

/* ── Preview Modal ── */

function CreativePreviewModal({ creative, onClose }: { creative: Creative | null; onClose: () => void }) {
  return (
    <Dialog open={!!creative} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl w-[calc(100vw-32px)] p-0 overflow-hidden bg-background border-border">
        {creative && (
          <div className="flex flex-col">
            {/* Media area */}
            <div className="relative bg-muted">
              {creative.is_video && creative.video_url ? (
                <VideoPlayer
                  src={creative.video_url}
                  poster={creative.image_url || creative.thumbnail_url || undefined}
                />
              ) : (
                <div className="flex items-center justify-center max-h-[70vh]">
                  {(creative.image_url || creative.thumbnail_url) ? (
                    <img
                      src={creative.image_url || creative.thumbnail_url!}
                      alt={creative.ad_name}
                      className="max-w-full max-h-[70vh] object-contain"
                    />
                  ) : (
                    <div className="py-24 flex items-center justify-center">
                      <Image className="h-16 w-16 text-muted-foreground/20" />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Info bar */}
            <div className="p-4 border-t border-border space-y-2">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="font-semibold text-foreground truncate">{creative.ad_name}</h3>
                  {creative.title && (
                    <p className="text-sm text-muted-foreground truncate">{creative.title}</p>
                  )}
                </div>
                <Badge variant={creative.status === 'ACTIVE' ? 'default' : 'secondary'} className="shrink-0">
                  {creative.status}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                <span className="text-muted-foreground">Spend: <span className="text-foreground font-medium">{formatCurrency(creative.spend)}</span></span>
                <span className="text-muted-foreground">Impr: <span className="text-foreground font-medium">{formatNum(creative.impressions)}</span></span>
                <span className="text-muted-foreground">CTR: <span className="text-foreground font-medium">{creative.ctr.toFixed(2)}%</span></span>
                <span className="text-muted-foreground">CPC: <span className="text-foreground font-medium">{formatCurrency(creative.cpc)}</span></span>
                {creative.leads > 0 && (
                  <>
                    <span className="text-muted-foreground">Leads: <span className="text-foreground font-medium">{creative.leads}</span></span>
                    <span className="text-muted-foreground">CPL: <span className="text-foreground font-medium">{formatCurrency(creative.cpl)}</span></span>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── Video Player ── */

function VideoPlayer({ src, poster }: { src: string; poster?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [showControls, setShowControls] = useState(true);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsMuted(videoRef.current.muted);
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    setProgress((videoRef.current.currentTime / videoRef.current.duration) * 100);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    videoRef.current.currentTime = pct * videoRef.current.duration;
  };

  return (
    <div
      className="relative group/video"
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        muted={isMuted}
        playsInline
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => setIsPlaying(false)}
        onClick={togglePlay}
        className="w-full max-h-[70vh] object-contain cursor-pointer bg-black"
      />

      {/* Play overlay when paused */}
      {!isPlaying && (
        <div
          className="absolute inset-0 flex items-center justify-center cursor-pointer bg-black/20"
          onClick={togglePlay}
        >
          <div className="h-16 w-16 rounded-full bg-background/90 backdrop-blur-sm flex items-center justify-center shadow-xl">
            <Play className="h-8 w-8 text-foreground ml-1" />
          </div>
        </div>
      )}

      {/* Controls bar */}
      <div className={cn(
        'absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3 transition-opacity duration-200',
        showControls || !isPlaying ? 'opacity-100' : 'opacity-0'
      )}>
        {/* Progress bar */}
        <div
          className="w-full h-1.5 bg-white/20 rounded-full cursor-pointer mb-2 group/progress"
          onClick={handleSeek}
        >
          <div
            className="h-full bg-primary rounded-full relative transition-all"
            style={{ width: `${progress}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-primary opacity-0 group-hover/progress:opacity-100 transition-opacity" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-white hover:bg-white/20"
            onClick={(e) => { e.stopPropagation(); togglePlay(); }}
          >
            {isPlaying ? (
              <div className="flex gap-0.5">
                <div className="w-1 h-3 bg-white rounded-sm" />
                <div className="w-1 h-3 bg-white rounded-sm" />
              </div>
            ) : (
              <Play className="h-4 w-4 ml-0.5" />
            )}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-white hover:bg-white/20"
            onClick={toggleMute}
          >
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── Metric Item ── */

function MetricItem({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={highlight ? 'text-primary' : 'text-muted-foreground'}>{icon}</span>
      <div>
        <p className="text-[9px] uppercase tracking-wider text-muted-foreground leading-none">{label}</p>
        <p className={cn('text-xs font-mono font-medium leading-tight', highlight ? 'text-primary' : 'text-foreground')}>{value}</p>
      </div>
    </div>
  );
}

import { useState, useRef, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Type, Image as ImageIcon, Trash2, Save, Copy, MoveUp, MoveDown } from 'lucide-react';

import type { OverlayElement, CoverPageOverlay } from './types';
import { FONT_FAMILIES, REPORT_TYPE_OPTIONS, DEFAULT_BACKGROUND_IMAGES } from './types';

interface CoverPageEditorProps {
  overlay: Partial<CoverPageOverlay>;
  onSave: (overlay: Partial<CoverPageOverlay>) => void;
  onCancel: () => void;
  isSaving: boolean;
}

export function CoverPageEditor({ overlay, onSave, onCancel, isSaving }: CoverPageEditorProps) {
  const [name, setName] = useState(overlay.name || '');
  const [reportType, setReportType] = useState(overlay.report_type || 'investment');
  const [backgroundImageUrl, setBackgroundImageUrl] = useState(overlay.background_image_url || '');
  const [elements, setElements] = useState<OverlayElement[]>(overlay.overlay_elements || []);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);
  const clickedOnElementRef = useRef(false);

  const selectedElement = elements.find(e => e.id === selectedElementId);

  const effectiveBgImage = backgroundImageUrl || DEFAULT_BACKGROUND_IMAGES[reportType] || '';

  const addTextElement = useCallback(() => {
    const id = crypto.randomUUID();
    const newEl: OverlayElement = {
      id,
      type: 'text',
      x: 30,
      y: 40,
      width: 40,
      height: 10,
      rotation: 0,
      opacity: 1,
      content: 'New Text',
      fontFamily: 'Helvetica',
      fontSize: 24,
      fontColor: '#FFFFFF',
      fontWeight: 'bold',
      textAlign: 'center',
    };
    setElements(prev => [...prev, newEl]);
    setSelectedElementId(id);
  }, []);

  const addImageElement = useCallback(() => {
    const id = crypto.randomUUID();
    const newEl: OverlayElement = {
      id,
      type: 'image',
      x: 35,
      y: 10,
      width: 30,
      height: 15,
      rotation: 0,
      opacity: 1,
      imageUrl: '',
      objectFit: 'contain',
    };
    setElements(prev => [...prev, newEl]);
    setSelectedElementId(id);
  }, []);

  const updateElement = useCallback((id: string, updates: Partial<OverlayElement>) => {
    setElements(prev => prev.map(el => el.id === id ? { ...el, ...updates } : el));
  }, []);

  const deleteElement = useCallback((id: string) => {
    setElements(prev => prev.filter(el => el.id !== id));
    if (selectedElementId === id) setSelectedElementId(null);
  }, [selectedElementId]);

  const duplicateElement = useCallback((id: string) => {
    const el = elements.find(e => e.id === id);
    if (!el) return;
    const newId = crypto.randomUUID();
    const dup = { ...el, id: newId, x: Math.min(el.x + 5, 90), y: Math.min(el.y + 5, 90) };
    setElements(prev => [...prev, dup]);
    setSelectedElementId(newId);
  }, [elements]);

  const moveElementLayer = useCallback((id: string, direction: 'up' | 'down') => {
    setElements(prev => {
      const idx = prev.findIndex(e => e.id === id);
      if (idx === -1) return prev;
      const target = direction === 'up' ? idx + 1 : idx - 1;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[target]] = [copy[target], copy[idx]];
      return copy;
    });
  }, []);

  // Drag handlers
  const handleElementMouseDown = useCallback((e: React.MouseEvent, elementId: string) => {
    e.stopPropagation();
    e.preventDefault();
    clickedOnElementRef.current = true;
    setSelectedElementId(elementId);
    setIsDragging(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const el = elements.find(el => el.id === elementId);
    if (!el) return;
    const mouseXPct = ((e.clientX - rect.left) / rect.width) * 100;
    const mouseYPct = ((e.clientY - rect.top) / rect.height) * 100;
    setDragOffset({ x: mouseXPct - el.x, y: mouseYPct - el.y });
  }, [elements]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !selectedElementId) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseXPct = ((e.clientX - rect.left) / rect.width) * 100;
    const mouseYPct = ((e.clientY - rect.top) / rect.height) * 100;
    const newX = Math.max(0, Math.min(100, mouseXPct - dragOffset.x));
    const newY = Math.max(0, Math.min(100, mouseYPct - dragOffset.y));
    updateElement(selectedElementId, { x: newX, y: newY });
  }, [isDragging, selectedElementId, dragOffset, updateElement]);

  const handleCanvasMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    // Only deselect if the click was on the canvas background, not on an element
    if (clickedOnElementRef.current) {
      clickedOnElementRef.current = false;
      return;
    }
    setSelectedElementId(null);
  }, []);

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      ...overlay,
      name: name.trim(),
      report_type: reportType,
      background_image_url: backgroundImageUrl || null,
      overlay_elements: elements,
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Left: Canvas Preview */}
      <div className="lg:col-span-2 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Overlay name..."
            className="max-w-[200px]"
          />
          <Select value={reportType} onValueChange={setReportType}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REPORT_TYPE_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={addTextElement}>
            <Type className="h-4 w-4 mr-1" /> Text
          </Button>
          <Button size="sm" variant="outline" onClick={addImageElement}>
            <ImageIcon className="h-4 w-4 mr-1" /> Image
          </Button>
        </div>

        {/* Canvas */}
        <div
          ref={canvasRef}
          className="relative border border-border rounded-lg overflow-hidden cursor-crosshair select-none"
          style={{
            aspectRatio: '595 / 842',
            maxHeight: '600px',
            backgroundImage: effectiveBgImage ? `url(${effectiveBgImage})` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundColor: effectiveBgImage ? undefined : 'hsl(var(--muted))',
          }}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
          onClick={handleCanvasClick}
        >
          {!effectiveBgImage && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
              No background configured
            </div>
          )}
          {elements.map((el, idx) => (
            <div
              key={el.id}
              className={`absolute transition-shadow ${
                selectedElementId === el.id
                  ? 'ring-2 ring-primary shadow-lg cursor-move'
                  : 'hover:ring-1 hover:ring-primary/50 cursor-pointer'
              }`}
              style={{
                left: `${el.x}%`,
                top: `${el.y}%`,
                width: `${el.width}%`,
                height: `${el.height}%`,
                transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                opacity: el.opacity,
                zIndex: idx + 1,
                pointerEvents: 'auto',
              }}
              onMouseDown={e => handleElementMouseDown(e, el.id)}
              onClick={e => {
                e.stopPropagation();
                clickedOnElementRef.current = true;
                setSelectedElementId(el.id);
              }}
            >
              {el.type === 'text' ? (
                <div
                  className="w-full h-full flex items-center overflow-hidden pointer-events-none"
                  style={{
                    fontFamily: el.fontFamily,
                    fontSize: `${Math.max(8, (el.fontSize || 24) * 0.5)}px`,
                    color: el.fontColor || '#FFFFFF',
                    fontWeight: el.fontWeight || 'normal',
                    textAlign: el.textAlign || 'left',
                    justifyContent: el.textAlign === 'center' ? 'center' : el.textAlign === 'right' ? 'flex-end' : 'flex-start',
                  }}
                >
                  {el.content || 'Text'}
                </div>
              ) : (
                <div className="w-full h-full bg-muted/30 border border-dashed border-muted-foreground/50 flex items-center justify-center text-xs text-muted-foreground pointer-events-none">
                  {el.imageUrl ? (
                    <img src={el.imageUrl} alt="" className="w-full h-full" style={{ objectFit: el.objectFit || 'contain' }} />
                  ) : (
                    <ImageIcon className="h-6 w-6" />
                  )}
                </div>
              )}
              {/* Resize handle */}
              {selectedElementId === el.id && (
                <div
                  className="absolute bottom-0 right-0 w-3 h-3 bg-primary rounded-tl cursor-se-resize"
                  onMouseDown={e => {
                    e.stopPropagation();
                    clickedOnElementRef.current = true;
                    const canvas = canvasRef.current;
                    if (!canvas) return;
                    const rect = canvas.getBoundingClientRect();
                    const onMove = (ev: MouseEvent) => {
                      const xPct = ((ev.clientX - rect.left) / rect.width) * 100;
                      const yPct = ((ev.clientY - rect.top) / rect.height) * 100;
                      updateElement(el.id, {
                        width: Math.max(5, xPct - el.x),
                        height: Math.max(3, yPct - el.y),
                      });
                    };
                    const onUp = () => {
                      window.removeEventListener('mousemove', onMove);
                      window.removeEventListener('mouseup', onUp);
                    };
                    window.addEventListener('mousemove', onMove);
                    window.addEventListener('mouseup', onUp);
                  }}
                />
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={isSaving || !name.trim()}>
            <Save className="h-4 w-4 mr-1" /> {isSaving ? 'Saving...' : 'Save'}
          </Button>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
        </div>
      </div>

      {/* Right: Properties Panel */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Background</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label className="text-xs">Custom Image URL</Label>
            <Input
              value={backgroundImageUrl}
              onChange={e => setBackgroundImageUrl(e.target.value)}
              placeholder="Leave empty for default"
              className="text-xs"
            />
            {effectiveBgImage && (
              <p className="text-xs text-muted-foreground truncate">Using: {effectiveBgImage}</p>
            )}
          </CardContent>
        </Card>

        {selectedElement ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center justify-between">
                {selectedElement.type === 'text' ? 'Text Properties' : 'Image Properties'}
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => duplicateElement(selectedElement.id)}>
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => moveElementLayer(selectedElement.id, 'up')}>
                    <MoveUp className="h-3 w-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => moveElementLayer(selectedElement.id, 'down')}>
                    <MoveDown className="h-3 w-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => deleteElement(selectedElement.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {selectedElement.type === 'text' && (
                <>
                  <div>
                    <Label className="text-xs">Content</Label>
                    <Textarea
                      value={selectedElement.content || ''}
                      onChange={e => updateElement(selectedElement.id, { content: e.target.value })}
                      rows={2}
                      className="text-xs"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Font</Label>
                      <Select value={selectedElement.fontFamily || 'Helvetica'} onValueChange={v => updateElement(selectedElement.id, { fontFamily: v })}>
                        <SelectTrigger className="text-xs h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FONT_FAMILIES.map(f => (
                            <SelectItem key={f} value={f}>{f}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Size</Label>
                      <Input
                        type="number"
                        value={selectedElement.fontSize || 24}
                        onChange={e => updateElement(selectedElement.id, { fontSize: parseInt(e.target.value) || 24 })}
                        className="text-xs h-8"
                        min={8}
                        max={120}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Color</Label>
                      <div className="flex gap-1 items-center">
                        <input
                          type="color"
                          value={selectedElement.fontColor || '#FFFFFF'}
                          onChange={e => updateElement(selectedElement.id, { fontColor: e.target.value })}
                          className="w-8 h-8 rounded cursor-pointer border-0"
                        />
                        <Input
                          value={selectedElement.fontColor || '#FFFFFF'}
                          onChange={e => updateElement(selectedElement.id, { fontColor: e.target.value })}
                          className="text-xs h-8 flex-1"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Weight</Label>
                      <Select value={selectedElement.fontWeight || 'normal'} onValueChange={v => updateElement(selectedElement.id, { fontWeight: v as 'normal' | 'bold' })}>
                        <SelectTrigger className="text-xs h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="bold">Bold</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Alignment</Label>
                    <Select value={selectedElement.textAlign || 'left'} onValueChange={v => updateElement(selectedElement.id, { textAlign: v as 'left' | 'center' | 'right' })}>
                      <SelectTrigger className="text-xs h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="left">Left</SelectItem>
                        <SelectItem value="center">Center</SelectItem>
                        <SelectItem value="right">Right</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {selectedElement.type === 'image' && (
                <>
                  <div>
                    <Label className="text-xs">Image URL</Label>
                    <Input
                      value={selectedElement.imageUrl || ''}
                      onChange={e => updateElement(selectedElement.id, { imageUrl: e.target.value })}
                      placeholder="https://..."
                      className="text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Fit</Label>
                    <Select value={selectedElement.objectFit || 'contain'} onValueChange={v => updateElement(selectedElement.id, { objectFit: v as 'cover' | 'contain' | 'fill' })}>
                      <SelectTrigger className="text-xs h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="contain">Contain</SelectItem>
                        <SelectItem value="cover">Cover</SelectItem>
                        <SelectItem value="fill">Fill</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {/* Common: Position & Size */}
              <div className="border-t pt-3 mt-3">
                <Label className="text-xs font-medium">Position & Size</Label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">X %</Label>
                    <Input type="number" value={Math.round(selectedElement.x)} onChange={e => updateElement(selectedElement.id, { x: parseFloat(e.target.value) || 0 })} className="text-xs h-7" min={0} max={100} />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Y %</Label>
                    <Input type="number" value={Math.round(selectedElement.y)} onChange={e => updateElement(selectedElement.id, { y: parseFloat(e.target.value) || 0 })} className="text-xs h-7" min={0} max={100} />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">W %</Label>
                    <Input type="number" value={Math.round(selectedElement.width)} onChange={e => updateElement(selectedElement.id, { width: parseFloat(e.target.value) || 10 })} className="text-xs h-7" min={1} max={100} />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">H %</Label>
                    <Input type="number" value={Math.round(selectedElement.height)} onChange={e => updateElement(selectedElement.id, { height: parseFloat(e.target.value) || 5 })} className="text-xs h-7" min={1} max={100} />
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-xs">Opacity</Label>
                <Slider
                  value={[selectedElement.opacity * 100]}
                  onValueChange={v => updateElement(selectedElement.id, { opacity: v[0] / 100 })}
                  min={0}
                  max={100}
                  step={5}
                />
              </div>

              <div>
                <Label className="text-xs">Rotation (°)</Label>
                <Input
                  type="number"
                  value={selectedElement.rotation}
                  onChange={e => updateElement(selectedElement.id, { rotation: parseFloat(e.target.value) || 0 })}
                  className="text-xs h-8"
                  min={-360}
                  max={360}
                />
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              Click an element on the canvas to edit its properties, or add a new text/image element.
            </CardContent>
          </Card>
        )}

        {/* Elements List */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Layers ({elements.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {elements.length === 0 ? (
              <p className="text-xs text-muted-foreground">No elements yet</p>
            ) : (
              elements.map((el) => (
                <div
                  key={el.id}
                  className={`flex items-center gap-2 text-xs p-1.5 rounded cursor-pointer ${
                    selectedElementId === el.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
                  }`}
                  onClick={() => setSelectedElementId(el.id)}
                >
                  {el.type === 'text' ? <Type className="h-3 w-3 shrink-0" /> : <ImageIcon className="h-3 w-3 shrink-0" />}
                  <span className="truncate flex-1">
                    {el.type === 'text' ? (el.content || 'Text').slice(0, 25) : 'Image'}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

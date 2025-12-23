import { useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  Upload, 
  Image as ImageIcon, 
  Trash2, 
  Loader2, 
  Check,
  AlertCircle,
  Palette,
  Monitor,
  LogIn,
  PanelLeft,
  Globe,
  Minimize2
} from 'lucide-react';
import { useWhiteLabel, hexToHsl, hslToHex } from '@/contexts/WhiteLabelContext';
import { removeBackground, loadImage, blobToBase64 } from '@/utils/backgroundRemoval';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface LogoUploadCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  currentLogo: string | null;
  logoType: 'auth' | 'sidebar' | 'sidebar-icon' | 'favicon';
  onUpload: (url: string) => void;
  onRemove: () => void;
}

function LogoUploadCard({ title, description, icon, currentLogo, logoType, onUpload, onRemove }: LogoUploadCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [removeBackgroundEnabled, setRemoveBackgroundEnabled] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const uploadToSupabase = async (file: Blob, fileName: string): Promise<string> => {
    const fileExt = fileName.split('.').pop() || 'png';
    const filePath = `${logoType}/${Date.now()}.${fileExt}`;
    
    const { data, error } = await supabase.storage
      .from('branding-assets')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true
      });

    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from('branding-assets')
      .getPublicUrl(data.path);

    return urlData.publicUrl;
  };

  const processFile = async (file: File) => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    setIsProcessing(true);

    try {
      let fileToUpload: Blob = file;
      
      if (removeBackgroundEnabled) {
        toast.info('Processing image...', { description: 'Removing background, this may take a moment' });
        const img = await loadImage(file);
        fileToUpload = await removeBackground(img);
      }

      // Upload to Supabase storage
      const publicUrl = await uploadToSupabase(fileToUpload, file.name);
      onUpload(publicUrl);
      toast.success(removeBackgroundEnabled ? 'Background removed and logo uploaded' : 'Logo uploaded successfully');
    } catch (error) {
      console.error('Error processing image:', error);
      toast.error('Failed to process image', { 
        description: removeBackgroundEnabled 
          ? 'Background removal failed. Try uploading without background removal.' 
          : 'Please try again with a different image.'
      });
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(file);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      await processFile(file);
    }
  }, [removeBackgroundEnabled]);

  const handleRemove = async () => {
    // Optionally delete from Supabase storage
    if (currentLogo && currentLogo.includes('branding-assets')) {
      try {
        const path = currentLogo.split('branding-assets/')[1];
        if (path) {
          await supabase.storage.from('branding-assets').remove([path]);
        }
      } catch (error) {
        console.error('Failed to delete from storage:', error);
      }
    }
    onRemove();
    toast.success('Logo removed');
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          {icon}
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {currentLogo ? (
          <div className="space-y-4">
            <div className="relative w-full h-32 bg-muted rounded-lg flex items-center justify-center overflow-hidden border">
              <img 
                src={currentLogo} 
                alt={`${title} preview`}
                className="max-w-full max-h-full object-contain"
              />
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
              >
                <Upload className="h-4 w-4 mr-2" />
                Replace
              </Button>
              <Button 
                variant="destructive" 
                size="sm" 
                onClick={handleRemove}
                disabled={isProcessing}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Remove
              </Button>
            </div>
          </div>
        ) : (
          <div 
            className={`w-full h-32 border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${
              isDragOver 
                ? 'border-primary bg-primary/5 scale-[1.02]' 
                : 'hover:border-primary hover:bg-muted/50'
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
                <span className="text-sm text-muted-foreground">Processing...</span>
              </>
            ) : (
              <>
                <Upload className={`h-8 w-8 transition-colors ${isDragOver ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className={`text-sm transition-colors ${isDragOver ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                  {isDragOver ? 'Drop image here' : 'Drag & drop or click to upload'}
                </span>
                <span className="text-xs text-muted-foreground">PNG, JPG, SVG (max 5MB)</span>
              </>
            )}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor={`bg-remove-${title}`} className="text-sm font-medium">
              Remove Background
            </Label>
            <p className="text-xs text-muted-foreground">
              Automatically remove image background
            </p>
          </div>
          <Switch
            id={`bg-remove-${title}`}
            checked={removeBackgroundEnabled}
            onCheckedChange={setRemoveBackgroundEnabled}
            disabled={isProcessing}
          />
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelect}
        />
      </CardContent>
    </Card>
  );
}

export default function WhiteLabel() {
  const { settings, updateSettings, isLoading } = useWhiteLabel();
  const [companyName, setCompanyName] = useState(settings.companyName);

  const handleCompanyNameSave = () => {
    updateSettings({ companyName });
    toast.success('Company name updated');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Branding</h1>
          <p className="text-muted-foreground">
            Customize the dashboard appearance with your brand identity
          </p>
        </div>
        <Badge variant="outline" className="gap-1">
          <Palette className="h-3 w-3" />
          White Label
        </Badge>
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>How it works</AlertTitle>
        <AlertDescription>
          Drag and drop or click to upload your logo images. The background removal feature uses AI to automatically remove backgrounds. Logos are stored securely in the cloud and will persist across sessions.
        </AlertDescription>
      </Alert>

      <Separator />

      {/* Company Name */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Monitor className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-lg">Company Name</CardTitle>
              <CardDescription>This will appear in the browser tab and sidebar</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Enter company name"
              className="max-w-sm"
            />
            <Button onClick={handleCompanyNameSave} disabled={companyName === settings.companyName}>
              <Check className="h-4 w-4 mr-2" />
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Color Theme */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-lg">Color Theme</CardTitle>
              <CardDescription>Customize the primary and accent colors of the dashboard</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            {/* Primary Color */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Primary Color</Label>
              <p className="text-xs text-muted-foreground">
                Used for buttons, links, and key UI elements
              </p>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <input
                    type="color"
                    value={settings.primaryColor ? hslToHex(settings.primaryColor) : '#D4A017'}
                    onChange={(e) => {
                      const hsl = hexToHsl(e.target.value);
                      updateSettings({ primaryColor: hsl });
                    }}
                    className="w-12 h-12 rounded-lg cursor-pointer border-2 border-border overflow-hidden"
                    style={{ padding: 0 }}
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="text-sm font-mono">
                    {settings.primaryColor ? hslToHex(settings.primaryColor) : '#D4A017'}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">
                    hsl({settings.primaryColor || '43 74% 49%'})
                  </div>
                </div>
                {settings.primaryColor && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => {
                      updateSettings({ primaryColor: null });
                      toast.success('Primary color reset to default');
                    }}
                  >
                    Reset
                  </Button>
                )}
              </div>
              {/* Preview swatches */}
              <div className="flex gap-2 pt-2">
                <div 
                  className="h-8 w-8 rounded-md border"
                  style={{ backgroundColor: `hsl(${settings.primaryColor || '43 74% 49%'})` }}
                  title="Primary"
                />
                <div 
                  className="h-8 w-8 rounded-md border"
                  style={{ backgroundColor: `hsl(${settings.primaryColor || '43 74% 49%'} / 0.8)` }}
                  title="80%"
                />
                <div 
                  className="h-8 w-8 rounded-md border"
                  style={{ backgroundColor: `hsl(${settings.primaryColor || '43 74% 49%'} / 0.5)` }}
                  title="50%"
                />
                <div 
                  className="h-8 w-8 rounded-md border"
                  style={{ backgroundColor: `hsl(${settings.primaryColor || '43 74% 49%'} / 0.2)` }}
                  title="20%"
                />
              </div>
            </div>

            {/* Accent Color */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Accent Color</Label>
              <p className="text-xs text-muted-foreground">
                Used for highlights and secondary emphasis
              </p>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <input
                    type="color"
                    value={settings.accentColor ? hslToHex(settings.accentColor) : '#D4A017'}
                    onChange={(e) => {
                      const hsl = hexToHsl(e.target.value);
                      updateSettings({ accentColor: hsl });
                    }}
                    className="w-12 h-12 rounded-lg cursor-pointer border-2 border-border overflow-hidden"
                    style={{ padding: 0 }}
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="text-sm font-mono">
                    {settings.accentColor ? hslToHex(settings.accentColor) : '#D4A017'}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">
                    hsl({settings.accentColor || '43 74% 49%'})
                  </div>
                </div>
                {settings.accentColor && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => {
                      updateSettings({ accentColor: null });
                      toast.success('Accent color reset to default');
                    }}
                  >
                    Reset
                  </Button>
                )}
              </div>
              {/* Preview swatches */}
              <div className="flex gap-2 pt-2">
                <div 
                  className="h-8 w-8 rounded-md border"
                  style={{ backgroundColor: `hsl(${settings.accentColor || '43 74% 49%'})` }}
                  title="Accent"
                />
                <div 
                  className="h-8 w-8 rounded-md border"
                  style={{ backgroundColor: `hsl(${settings.accentColor || '43 74% 49%'} / 0.8)` }}
                  title="80%"
                />
                <div 
                  className="h-8 w-8 rounded-md border"
                  style={{ backgroundColor: `hsl(${settings.accentColor || '43 74% 49%'} / 0.5)` }}
                  title="50%"
                />
                <div 
                  className="h-8 w-8 rounded-md border"
                  style={{ backgroundColor: `hsl(${settings.accentColor || '43 74% 49%'} / 0.2)` }}
                  title="20%"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Logo Upload Cards */}
      <div className="grid gap-6 md:grid-cols-2">
        <LogoUploadCard
          title="Auth Page Logo"
          description="Displayed prominently on the login page (recommended: wide format)"
          icon={<LogIn className="h-5 w-5 text-primary" />}
          currentLogo={settings.authLogo}
          logoType="auth"
          onUpload={(url) => updateSettings({ authLogo: url })}
          onRemove={() => updateSettings({ authLogo: null })}
        />

        <LogoUploadCard
          title="Sidebar Logo"
          description="Displayed in the expanded sidebar (recommended: horizontal)"
          icon={<PanelLeft className="h-5 w-5 text-primary" />}
          currentLogo={settings.sidebarLogo}
          logoType="sidebar"
          onUpload={(url) => updateSettings({ sidebarLogo: url })}
          onRemove={() => updateSettings({ sidebarLogo: null })}
        />

        <LogoUploadCard
          title="Collapsed Sidebar Icon"
          description="Shown when sidebar is minimized (recommended: square, 32x32)"
          icon={<Minimize2 className="h-5 w-5 text-primary" />}
          currentLogo={settings.sidebarIcon}
          logoType="sidebar-icon"
          onUpload={(url) => updateSettings({ sidebarIcon: url })}
          onRemove={() => updateSettings({ sidebarIcon: null })}
        />

        <LogoUploadCard
          title="Favicon"
          description="Browser tab icon (recommended: square, 32x32)"
          icon={<Globe className="h-5 w-5 text-primary" />}
          currentLogo={settings.favicon}
          logoType="favicon"
          onUpload={(url) => updateSettings({ favicon: url })}
          onRemove={() => updateSettings({ favicon: null })}
        />
      </div>

      {/* Preview Section */}
      <Card>
        <CardHeader>
          <CardTitle>Live Preview</CardTitle>
          <CardDescription>See how your branding will appear across the dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            {/* Auth Page Preview */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Login Page</Label>
              <div className="border rounded-lg p-6 bg-background flex flex-col items-center gap-4">
                {settings.authLogo ? (
                  <img src={settings.authLogo} alt="Auth logo preview" className="h-12 object-contain" />
                ) : (
                  <div className="h-12 w-12 bg-primary rounded-lg flex items-center justify-center">
                    <Monitor className="h-6 w-6 text-primary-foreground" />
                  </div>
                )}
                <div className="text-center">
                  <p className="font-semibold">{settings.companyName} Dashboard</p>
                  <p className="text-sm text-muted-foreground">Sign in to continue</p>
                </div>
              </div>
            </div>

            {/* Sidebar Preview - Expanded */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Sidebar (Expanded)</Label>
              <div className="border rounded-lg bg-card overflow-hidden">
                <div className="p-4 border-b flex items-center gap-3">
                  {settings.sidebarLogo ? (
                    <img src={settings.sidebarLogo} alt="Sidebar logo preview" className="h-10 max-w-[100px] object-contain" />
                  ) : (
                    <div className="h-8 w-8 bg-primary rounded flex items-center justify-center">
                      <PanelLeft className="h-5 w-5 text-primary-foreground" />
                    </div>
                  )}
                  <div className="flex flex-col">
                    <span className="font-semibold text-sm">{settings.companyName}</span>
                    <span className="text-xs text-muted-foreground">Intake Dashboard</span>
                  </div>
                </div>
                <div className="p-2 space-y-1">
                  {['Overview', 'Listings', 'Reports'].map((item) => (
                    <div key={item} className="px-3 py-2 text-sm rounded-md hover:bg-muted">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Sidebar Preview - Collapsed */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Sidebar (Collapsed)</Label>
              <div className="border rounded-lg bg-card overflow-hidden w-16">
                <div className="p-3 border-b flex items-center justify-center">
                  {(settings.sidebarIcon || settings.sidebarLogo) ? (
                    <img 
                      src={settings.sidebarIcon || settings.sidebarLogo || ''} 
                      alt="Sidebar icon preview" 
                      className="h-8 w-8 object-contain" 
                    />
                  ) : (
                    <div className="h-8 w-8 bg-primary rounded flex items-center justify-center">
                      <PanelLeft className="h-4 w-4 text-primary-foreground" />
                    </div>
                  )}
                </div>
                <div className="p-1 space-y-1">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-8 w-8 mx-auto rounded-md bg-muted/50" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reset Section */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Reset Branding</CardTitle>
          <CardDescription>Remove all custom branding and restore defaults</CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            variant="destructive" 
            onClick={() => {
              updateSettings({
                authLogo: null,
                sidebarLogo: null,
                sidebarIcon: null,
                favicon: null,
                companyName: 'NPC Property',
                primaryColor: null,
                accentColor: null,
              });
              setCompanyName('NPC Property');
              toast.success('Branding reset to defaults');
            }}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Reset All Branding
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

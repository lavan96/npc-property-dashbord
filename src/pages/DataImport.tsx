import { useState } from 'react';
import { useModulePermissions } from '@/hooks/useModulePermissions';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, FileText, Database, CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { logActivityDirect } from '@/hooks/useActivityLogger';
import { useNotifications } from '@/contexts/NotificationsContext';

const DATA_TYPES = [
  { value: 'suburb_directory', label: 'Suburb Directory', table: 'suburb_directory', requiresState: false },
  { value: 'schools', label: 'Schools Directory', table: 'schools_directory', requiresState: true },
  { value: 'abs_census', label: 'ABS Census Data', table: 'abs_census_cache', requiresState: true },
  { value: 'crime_stats', label: 'Crime Statistics', table: 'crime_statistics_cache', requiresState: true },
  { value: 'economic', label: 'Economic Data (National)', table: 'economic_data_cache', requiresState: false },
  { value: 'transport', label: 'Transport Data', table: 'transport_data_cache', requiresState: true },
  { value: 'risk', label: 'Risk Assessment', table: 'risk_assessment_cache', requiresState: true },
  { value: 'climate', label: 'Climate Data', table: 'climate_data_cache', requiresState: true },
  { value: 'median_rent', label: 'Median Rent Cache', table: 'median_rent_cache', requiresState: false },
];

const AUSTRALIAN_STATES = [
  { value: 'NSW', label: 'New South Wales (NSW)' },
  { value: 'VIC', label: 'Victoria (VIC)' },
  { value: 'QLD', label: 'Queensland (QLD)' },
  { value: 'SA', label: 'South Australia (SA)' },
  { value: 'WA', label: 'Western Australia (WA)' },
  { value: 'TAS', label: 'Tasmania (TAS)' },
  { value: 'NT', label: 'Northern Territory (NT)' },
  { value: 'ACT', label: 'Australian Capital Territory (ACT)' },
];

export default function DataImport() {
  const { canEdit: canEditImport } = useModulePermissions('data_import');
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedState, setSelectedState] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const { toast } = useToast();
  const { addNotification } = useNotifications();

  const selectedDataType = DATA_TYPES.find(t => t.value === selectedType);
  const requiresState = selectedDataType?.requiresState ?? false;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type !== 'text/csv' && !selectedFile.name.endsWith('.csv')) {
        toast({
          title: "Invalid File Type",
          description: "Please upload a CSV file",
          variant: "destructive",
        });
        return;
      }
      setFile(selectedFile);
      setResult(null);
    }
  };

  const parseCSV = (text: string): any[] => {
    const lines = text.split('\n').filter(line => line.trim());
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    
    return lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim());
      const obj: any = {};
      headers.forEach((header, index) => {
        obj[header] = values[index] || null;
      });
      return obj;
    });
  };

  const handleUpload = async () => {
    if (!file || !selectedType) {
      toast({
        title: "Missing Information",
        description: "Please select a data type and file",
        variant: "destructive",
      });
      return;
    }

    if (requiresState && !selectedState) {
      toast({
        title: "Missing State",
        description: "Please select a state for this data type",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    setResult(null);

    try {
      const text = await file.text();
      const records = parseCSV(text);

      if (selectedType === 'schools') {
        // Use the import-schools-data edge function
        const { data, error } = await invokeSecureFunction('import-schools-data', {
          schools: records.map(r => ({
            name: r.name || r.school_name,
            suburb: r.suburb,
            postcode: r.postcode,
            state: selectedState || r.state,
            school_type: r.school_type || r.type,
            school_level: r.school_level || r.level,
            icsea_score: r.icsea_score ? parseInt(r.icsea_score) : null,
            student_count: r.student_count ? parseInt(r.student_count) : null,
            latitude: r.latitude ? parseFloat(r.latitude) : null,
            longitude: r.longitude ? parseFloat(r.longitude) : null,
            address: r.address,
            website_url: r.website_url || r.website,
          })),
          overwrite: true
        });

        if (error) throw error;
        setResult(data);
        
        toast({
          title: "Upload Successful",
          description: `Imported ${data.summary.imported} schools, updated ${data.summary.updated}, skipped ${data.summary.skipped}`,
        });
        
        addNotification({
          type: 'data_import_complete',
          title: 'Schools Data Import Complete',
          message: `Imported ${data.summary.imported} schools for ${selectedState}`,
        });
      } else {
        // Direct database insert for cache tables
        const dataType = DATA_TYPES.find(t => t.value === selectedType);
        if (!dataType) throw new Error('Invalid data type');

        // Transform records based on table schema
        const transformedRecords = records.map(r => {
          const base: any = {
            fetched_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
            data_quality: 'imported'
          };

          switch (selectedType) {
            case 'suburb_directory':
              return {
                suburb: r.suburb?.trim(),
                postcode: r.postcode?.trim(),
                state: r.state?.toUpperCase()?.trim()
              };
            case 'median_rent':
              return {
                ...base,
                suburb: r.suburb?.toLowerCase()?.trim(),
                postcode: r.postcode?.trim(),
                state: r.state?.toUpperCase()?.trim(),
                property_type: r.property_type?.toLowerCase()?.trim() || 'house',
                bedrooms: r.bedrooms ? parseInt(r.bedrooms) : 3,
                median_weekly_rent: r.median_weekly_rent ? parseFloat(r.median_weekly_rent) : null,
                vacancy_rate: r.vacancy_rate ? parseFloat(r.vacancy_rate) : null,
                stock_on_market: r.stock_on_market ? parseInt(r.stock_on_market) : null,
                source_url: r.source_url || null
              };
            case 'abs_census':
              return {
                ...base,
                postcode: r.postcode,
                state: selectedState || r.state?.toUpperCase(),
                dataset: r.dataset,
                data: JSON.parse(r.data || '{}')
              };
            case 'crime_stats':
              return {
                ...base,
                suburb: r.suburb?.toLowerCase(),
                postcode: r.postcode,
                state: selectedState || r.state?.toUpperCase(),
                data: JSON.parse(r.data || '{}')
              };
            case 'economic':
              return {
                ...base,
                data_type: r.data_type,
                data: JSON.parse(r.data || '{}')
              };
            case 'transport':
              return {
                ...base,
                latitude: parseFloat(r.latitude),
                longitude: parseFloat(r.longitude),
                state: selectedState || r.state?.toUpperCase(),
                suburb: r.suburb?.toLowerCase(),
                data: JSON.parse(r.data || '{}')
              };
            case 'risk':
              return {
                ...base,
                suburb: r.suburb?.toLowerCase(),
                postcode: r.postcode,
                state: selectedState || r.state?.toUpperCase(),
                latitude: r.latitude ? parseFloat(r.latitude) : null,
                longitude: r.longitude ? parseFloat(r.longitude) : null,
                flood_risk: JSON.parse(r.flood_risk || '{}'),
                bushfire_risk: JSON.parse(r.bushfire_risk || '{}')
              };
            case 'climate':
              return {
                ...base,
                suburb: r.suburb?.toLowerCase(),
                postcode: r.postcode,
                state: selectedState || r.state?.toUpperCase(),
                climate_zone: r.climate_zone,
                temperature_data: JSON.parse(r.temperature_data || '{}'),
                rainfall_data: JSON.parse(r.rainfall_data || '{}'),
                humidity_data: JSON.parse(r.humidity_data || '{}'),
                extreme_weather: JSON.parse(r.extreme_weather || '{}'),
                projections: JSON.parse(r.projections || '{}')
              };
            default:
              return r;
          }
        });

        const { data, error } = await invokeSecureFunction('manage-data-import', {
          operation: 'insert',
          table: dataType.table as any,
          data: transformedRecords
        });

        if (error) throw new Error(error.message);

        setResult({
          success: true,
          summary: {
            total: records.length,
            imported: data?.summary?.imported || records.length,
            table: dataType.table
          }
        });

        toast({
          title: "Upload Successful",
          description: `Imported ${records.length} records into ${dataType.label}`,
        });
        
        addNotification({
          type: 'data_import_complete',
          title: `${dataType.label} Import Complete`,
          message: `Successfully imported ${records.length} records`,
        });
        
        // Log data import
        logActivityDirect({
          actionType: 'data_imported',
          entityType: 'data_import',
          entityName: dataType.label,
          metadata: { 
            action: 'import',
            table: dataType.table,
            records_count: records.length,
            state: selectedState || undefined
          }
        });
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      setResult({
        success: false,
        error: error.message
      });
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const [importingSuburbs, setImportingSuburbs] = useState(false);

  const handleImportSuburbDirectory = async () => {
    setImportingSuburbs(true);
    try {
      const { data, error } = await invokeSecureFunction('import-suburb-directory', {
        body: {}
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: "Suburb Directory Imported",
          description: `Imported ${data.summary.inserted} suburbs from ${data.summary.source}`,
        });
        
        addNotification({
          type: 'data_import_complete',
          title: 'Suburb Directory Import Complete',
          message: `Imported ${data.summary.inserted} suburbs`,
        });
      } else {
        throw new Error(data?.error || 'Import failed');
      }
    } catch (error: any) {
      console.error('Suburb import error:', error);
      toast({
        title: "Import Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setImportingSuburbs(false);
    }
  };

  return (
    <>
      <div className="space-y-4 sm:space-y-6 px-1 sm:px-0">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Data Import</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Upload CSV files to populate cache tables and directories
          </p>
        </div>

        {/* Quick Import Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Quick Import from External Sources
            </CardTitle>
            <CardDescription>
              Import data directly from trusted external sources
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <Button 
                onClick={handleImportSuburbDirectory}
                disabled={importingSuburbs}
                variant="outline"
              >
                {importingSuburbs ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importing Suburbs...
                  </>
                ) : (
                  <>
                    <Database className="mr-2 h-4 w-4" />
                    Import Australian Suburb Directory
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground self-center">
                ~18,500 suburbs from matthewproctor.com (community-sourced postcode database)
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload CSV Data
            </CardTitle>
            <CardDescription>
              Select a data type and upload a properly formatted CSV file
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="dataType">Data Type</Label>
                <Select value={selectedType} onValueChange={(value) => {
                  setSelectedType(value);
                  setSelectedState('');
                }}>
                  <SelectTrigger id="dataType">
                    <SelectValue placeholder="Select data type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {DATA_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex items-center gap-2">
                          <Database className="h-4 w-4" />
                          {type.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {requiresState && (
                <div className="space-y-2">
                  <Label htmlFor="state">
                    State/Territory <span className="text-destructive">*</span>
                  </Label>
                  <Select value={selectedState} onValueChange={setSelectedState}>
                    <SelectTrigger id="state">
                      <SelectValue placeholder="Select state..." />
                    </SelectTrigger>
                    <SelectContent>
                      {AUSTRALIAN_STATES.map(state => (
                        <SelectItem key={state.value} value={state.value}>
                          {state.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Data will be tagged for {selectedState || 'the selected state'}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="csvFile">CSV File</Label>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                <input
                  id="csvFile"
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                />
                {file && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
                    <FileText className="h-4 w-4" />
                    <span className="truncate max-w-[200px]">{file.name}</span>
                  </div>
                )}
              </div>
            </div>

            <Button 
              onClick={handleUpload} 
              disabled={!file || !selectedType || (requiresState && !selectedState) || uploading}
              className="w-full"
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Data
                </>
              )}
            </Button>

            {result && (
              <Alert variant={result.success ? "default" : "destructive"}>
                {result.success ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                <AlertDescription>
                  {result.success ? (
                    <div className="space-y-2">
                      <p className="font-medium">Upload completed successfully!</p>
                      {result.summary && (
                        <ul className="text-sm space-y-1 mt-2">
                          <li>Total records: {result.summary.total}</li>
                          <li>Imported: {result.summary.imported}</li>
                          {result.summary.updated !== undefined && (
                            <li>Updated: {result.summary.updated}</li>
                          )}
                          {result.summary.skipped !== undefined && (
                            <li>Skipped: {result.summary.skipped}</li>
                          )}
                        </ul>
                      )}
                    </div>
                  ) : (
                    <div>
                      <p className="font-medium">Upload failed</p>
                      <p className="text-sm mt-1">{result.error}</p>
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              CSV Format Requirements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 text-sm">
              <div>
                <h4 className="font-medium mb-2">📍 Suburb Directory:</h4>
                <p className="text-xs text-muted-foreground mb-1">All Australian suburbs - no state selection needed</p>
                <code className="block bg-muted p-2 rounded text-xs overflow-x-auto whitespace-pre">
                  suburb,postcode,state
                </code>
              </div>

              <div>
                <h4 className="font-medium mb-2">💵 Median Rent Cache:</h4>
                <p className="text-xs text-muted-foreground mb-1">Pre-cached rent data - no state selection needed</p>
                <code className="block bg-muted p-2 rounded text-xs overflow-x-auto whitespace-pre">
                  suburb,postcode,state,property_type,bedrooms,median_weekly_rent,vacancy_rate,stock_on_market,source_url
                </code>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">🏫 Schools Directory:</h4>
                <p className="text-xs text-muted-foreground mb-1">State-specific (select state above)</p>
                <code className="block bg-muted p-2 rounded text-xs overflow-x-auto whitespace-pre">
                  name,suburb,postcode,state,school_type,school_level,icsea_score,student_count,latitude,longitude,address,website_url
                </code>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">📊 ABS Census Cache:</h4>
                <p className="text-xs text-muted-foreground mb-1">State-specific (select state above)</p>
                <code className="block bg-muted p-2 rounded text-xs overflow-x-auto whitespace-pre">
                  postcode,state,dataset,data
                </code>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">🚨 Crime Statistics Cache:</h4>
                <p className="text-xs text-muted-foreground mb-1">State-specific (select state above)</p>
                <code className="block bg-muted p-2 rounded text-xs overflow-x-auto whitespace-pre">
                  suburb,postcode,state,data
                </code>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">🚇 Transport Data Cache:</h4>
                <p className="text-xs text-muted-foreground mb-1">State-specific (select state above)</p>
                <code className="block bg-muted p-2 rounded text-xs overflow-x-auto whitespace-pre">
                  latitude,longitude,state,suburb,data
                </code>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">⚠️ Risk Assessment Cache:</h4>
                <p className="text-xs text-muted-foreground mb-1">State-specific (select state above)</p>
                <code className="block bg-muted p-2 rounded text-xs overflow-x-auto whitespace-pre">
                  suburb,postcode,state,latitude,longitude,flood_risk,bushfire_risk
                </code>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">🌡️ Climate Data Cache:</h4>
                <p className="text-xs text-muted-foreground mb-1">State-specific (select state above)</p>
                <code className="block bg-muted p-2 rounded text-xs overflow-x-auto whitespace-pre">
                  suburb,postcode,state,climate_zone,temperature_data,rainfall_data,humidity_data,extreme_weather,projections
                </code>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">💰 Economic Data (National):</h4>
                <p className="text-xs text-muted-foreground mb-1">No state selection needed</p>
                <code className="block bg-muted p-2 rounded text-xs overflow-x-auto whitespace-pre">
                  data_type,data
                </code>
              </div>
              <Alert>
                <div className="flex gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5" />
                  <AlertDescription>
                    Refer to the documentation for detailed CSV format specifications for each data type.
                  </AlertDescription>
                </div>
              </Alert>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

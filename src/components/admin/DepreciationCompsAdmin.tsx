import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Upload, 
  Plus, 
  Trash2, 
  Download, 
  RefreshCw,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle,
  Loader2,
  Database
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatNumberWithCommas, removeCommas } from '@/hooks/useFormattedNumber';
import {
  DepreciationComp,
  PurchaseDateCategory,
  PropertyType,
  FinishStandard,
  NearestCity,
  CITY_LABELS,
  PROPERTY_TYPE_LABELS,
  FINISH_STANDARD_LABELS,
  PURCHASE_CATEGORY_LABELS,
} from '@/types/depreciation';

export function DepreciationCompsAdmin() {
  const { toast } = useToast();
  const [comps, setComps] = useState<DepreciationComp[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [csvPreview, setCsvPreview] = useState<string[][]>([]);
  const [csvFullData, setCsvFullData] = useState<string[][]>([]);
  const [csvError, setCsvError] = useState<string | null>(null);
  
  // Add form state
  const [newComp, setNewComp] = useState<Partial<DepreciationComp>>({
    purchase_date_category: 'post_budget_brand_new',
    property_type: 'house',
    finish_standard: 'medium',
    nearest_city: 'sydney_nsw',
    renovated: false,
    fully_furnished: false,
  });
  const [bulkYearsInput, setBulkYearsInput] = useState('');
  
  // Fetch comps
  const fetchComps = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('depreciation_comps')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (error) throw error;
      setComps(data as DepreciationComp[] || []);
    } catch (error) {
      console.error('Error fetching comps:', error);
      toast({
        title: "Failed to load data",
        description: "Could not fetch depreciation comparables.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);
  
  useEffect(() => {
    fetchComps();
  }, [fetchComps]);
  
  // CSV helpers (handles quoted commas, BOMs, and messy column names)
  const normalizeCsvHeader = (header: string) => {
    const h = (header ?? '')
      .toString()
      .replace(/^\uFEFF/, '')
      .trim()
      .toLowerCase();

    return h
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
  };

  const parseCsvText = (text: string): string[][] => {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let inQuotes = false;

    const pushCell = () => {
      row.push(cell.trim());
      cell = '';
    };

    const pushRow = () => {
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
    };

    const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    for (let i = 0; i < s.length; i++) {
      const ch = s[i];

      if (ch === '"') {
        // Escaped quote within a quoted cell
        if (inQuotes && s[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (!inQuotes && ch === ',') {
        pushCell();
        continue;
      }

      if (!inQuotes && ch === '\n') {
        pushCell();
        pushRow();
        continue;
      }

      cell += ch;
    }

    // flush last row
    pushCell();
    pushRow();

    return rows;
  };

  const parseBoolean = (value: string): boolean => {
    const v = (value ?? '').toString().replace(/^\uFEFF/, '').trim().toLowerCase();
    return v === 'true' || v === '1' || v === 'yes' || v === 'y';
  };

  const formatImportError = (err: any): string => {
    if (!err) return 'Could not import CSV data.';
    if (typeof err === 'string') return err;

    const message = typeof err?.message === 'string' && err.message.trim().length > 0
      ? err.message
      : 'Could not import CSV data.';

    const extra: string[] = [];
    if (typeof err?.details === 'string' && err.details.trim().length > 0) extra.push(`Details: ${err.details}`);
    if (typeof err?.hint === 'string' && err.hint.trim().length > 0) extra.push(`Hint: ${err.hint}`);
    if (typeof err?.code === 'string' && err.code.trim().length > 0) extra.push(`Code: ${err.code}`);

    return extra.length ? `${message} | ${extra.join(' | ')}` : message;
  };

  // Handle CSV file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setCsvError(null);
    setCsvPreview([]);
    setCsvFullData([]);

    try {
      const text = await file.text();
      const lines = parseCsvText(text);

      if (lines.length < 2) {
        setCsvError('CSV must have at least a header row and one data row');
        return;
      }

      setCsvFullData(lines); // Store ALL parsed lines
      setCsvPreview(lines.slice(0, 6)); // Show first 5 rows + header for preview
    } catch (error) {
      console.error('Error parsing CSV:', error);
      setCsvError('Failed to parse CSV file');
    }
  };
  
  // Normalize enum values to match database expectations (lowercase with underscores)
  const normalizeEnumValue = (value: string, fieldName: string): string => {
    const cleaned = (value ?? '').toString().replace(/^\uFEFF/, '').trim();
    if (!cleaned) return cleaned;

    // Normalize: lowercase and replace non-alphanumerics with underscores
    const normalized = cleaned
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');

    // Valid enum values for each field
    const validValues: Record<string, string[]> = {
      nearest_city: ['sydney_nsw', 'melbourne_vic', 'perth_wa', 'brisbane_qld', 'adelaide_sa', 'cairns_qld', 'canberra_act', 'darwin_nt', 'hobart_tas'],
      property_type: ['house', 'townhouse', 'unit', 'highrise', 'commercial', 'industrial'],
      finish_standard: ['low', 'medium', 'high'],
      purchase_date_category: ['pre_budget', 'post_budget_second_hand', 'post_budget_brand_new'],
    };

    if (validValues[fieldName]) {
      const match = validValues[fieldName].find((v) => v === normalized);
      if (match) return match;

      const compact = normalized.replace(/_/g, '');
      const partialMatch = validValues[fieldName].find((v) => {
        const vCompact = v.replace(/_/g, '');
        return vCompact === compact || compact.includes(vCompact) || vCompact.includes(compact);
      });
      if (partialMatch) return partialMatch;
    }

    return normalized;
  };

  // Import CSV data
  const handleImportCsv = async () => {
    if (csvFullData.length < 2) return;

    setUploading(true);
    try {
      const headers = csvFullData[0].map(normalizeCsvHeader);
      const rows = csvFullData.slice(1); // Use FULL data, not preview

      const records: Partial<DepreciationComp>[] = [];
      const enumFields = new Set(['nearest_city', 'property_type', 'finish_standard', 'purchase_date_category']);

      for (const row of rows) {
        if (row.length < headers.length) continue;

        const record: Record<string, any> = {};
        headers.forEach((header, i) => {
          if (!header) return;

          const raw = row[i] ?? '';
          const value = (typeof raw === 'string' ? raw : String(raw)).replace(/^\uFEFF/, '').trim();

          // Parse numeric fields (strip thousand separators)
          if (
            header.includes('price') ||
            header.includes('year') ||
            header.startsWith('dv_') ||
            header.startsWith('pc_')
          ) {
            record[header] = parseFloat(removeCommas(value)) || 0;
          } else if (header === 'renovated' || header === 'fully_furnished') {
            record[header] = parseBoolean(value);
          } else if (enumFields.has(header)) {
            record[header] = normalizeEnumValue(value, header);
          } else {
            record[header] = value;
          }
        });

        // Validate required fields
        if (
          record.purchase_price &&
          record.purchase_date_category &&
          record.build_year &&
          record.property_type &&
          record.finish_standard &&
          record.nearest_city
        ) {
          records.push(record as Partial<DepreciationComp>);
        }
      }

      if (records.length === 0) {
        throw new Error('No valid records found in CSV');
      }

      // Insert in batches of 500 to handle large datasets
      const batchSize = 500;
      let imported = 0;

      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        const { error } = await supabase.from('depreciation_comps').insert(batch as any);
        if (error) throw error;
        imported += batch.length;
      }

      toast({
        title: 'Import Successful',
        description: `Imported ${imported} depreciation comparables.`,
      });

      setCsvPreview([]);
      setCsvFullData([]);
      fetchComps();
    } catch (error: any) {
      console.error('Error importing CSV:', error);
      toast({
        title: 'Import Failed',
        description: formatImportError(error),
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };
  
  // Parse bulk years input (tab or comma separated: DV values, then PC values)
  const parseBulkYears = (input: string) => {
    const values = input.split(/[\t,\n]+/).map(v => parseFloat(v.trim()) || 0);
    if (values.length >= 20) {
      return {
        dv_year1: values[0], dv_year2: values[1], dv_year3: values[2], dv_year4: values[3], dv_year5: values[4],
        dv_year6: values[5], dv_year7: values[6], dv_year8: values[7], dv_year9: values[8], dv_year10: values[9],
        pc_year1: values[10], pc_year2: values[11], pc_year3: values[12], pc_year4: values[13], pc_year5: values[14],
        pc_year6: values[15], pc_year7: values[16], pc_year8: values[17], pc_year9: values[18], pc_year10: values[19],
      };
    }
    return null;
  };
  
  // Add single comp
  const handleAddComp = async () => {
    try {
      // Parse bulk years if provided
      let yearData = {};
      if (bulkYearsInput) {
        const parsed = parseBulkYears(bulkYearsInput);
        if (parsed) {
          yearData = parsed;
        } else {
          toast({
            title: "Invalid Year Data",
            description: "Please provide 20 values: 10 DV years followed by 10 PC years.",
            variant: "destructive",
          });
          return;
        }
      }
      
      const record = {
        ...newComp,
        ...yearData,
      };
      
      if (!record.purchase_price || !record.build_year) {
        toast({
          title: "Missing Required Fields",
          description: "Purchase price and build year are required.",
          variant: "destructive",
        });
        return;
      }
      
      const { error } = await supabase
        .from('depreciation_comps')
        .insert([record] as any);
      
      if (error) throw error;
      
      toast({
        title: "Comp Added",
        description: "Depreciation comparable has been added.",
      });
      
      setShowAddModal(false);
      setNewComp({
        purchase_date_category: 'post_budget_brand_new',
        property_type: 'house',
        finish_standard: 'medium',
        nearest_city: 'sydney_nsw',
        renovated: false,
        fully_furnished: false,
      });
      setBulkYearsInput('');
      fetchComps();
    } catch (error) {
      console.error('Error adding comp:', error);
      toast({
        title: "Failed to Add",
        description: "Could not add depreciation comparable.",
        variant: "destructive",
      });
    }
  };
  
  // Delete comp
  const handleDeleteComp = async (id: string) => {
    if (!confirm('Are you sure you want to delete this comparable?')) return;
    
    try {
      const { error } = await supabase
        .from('depreciation_comps')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      toast({
        title: "Deleted",
        description: "Depreciation comparable has been removed.",
      });
      
      fetchComps();
    } catch (error) {
      console.error('Error deleting comp:', error);
      toast({
        title: "Delete Failed",
        description: "Could not delete depreciation comparable.",
        variant: "destructive",
      });
    }
  };
  
  // Export template CSV
  const handleExportTemplate = () => {
    const headers = [
      'purchase_price', 'purchase_date_category', 'build_year', 'property_type', 
      'finish_standard', 'nearest_city', 'renovated', 'fully_furnished',
      'dv_year1', 'dv_year2', 'dv_year3', 'dv_year4', 'dv_year5',
      'dv_year6', 'dv_year7', 'dv_year8', 'dv_year9', 'dv_year10',
      'pc_year1', 'pc_year2', 'pc_year3', 'pc_year4', 'pc_year5',
      'pc_year6', 'pc_year7', 'pc_year8', 'pc_year9', 'pc_year10',
      'notes'
    ];
    
    const exampleRow = [
      '750000', 'post_budget_brand_new', '2022', 'house',
      'medium', 'sydney_nsw', 'false', 'false',
      '15000', '13000', '11000', '10000', '9000', '8000', '7000', '6500', '6000', '5500',
      '12000', '12000', '12000', '12000', '12000', '12000', '12000', '12000', '12000', '12000',
      'Example property'
    ];
    
    const csv = [headers.join(','), exampleRow.join(',')].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'depreciation_comps_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };
  
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Depreciation Comparables Database
            </CardTitle>
            <CardDescription>
              Manage the comparable properties dataset used for depreciation estimates
            </CardDescription>
          </div>
          <Badge variant="secondary">{comps.length} records</Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        <Tabs defaultValue="list">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="list">View Data</TabsTrigger>
            <TabsTrigger value="import">Import Data</TabsTrigger>
          </TabsList>
          
          <TabsContent value="list" className="space-y-4">
            {/* Actions */}
            <div className="flex gap-2">
              <Button onClick={() => setShowAddModal(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Comp
              </Button>
              <Button variant="outline" onClick={fetchComps} disabled={loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
            
            {/* Comps Table */}
            <ScrollArea className="h-[400px] rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Price</TableHead>
                    <TableHead>Year</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Finish</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">DV Total</TableHead>
                    <TableHead className="text-right">PC Total</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : comps.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        No comparables found. Add some data to enable the calculator.
                      </TableCell>
                    </TableRow>
                  ) : comps.map(comp => {
                    const dvTotal = comp.dv_year1 + comp.dv_year2 + comp.dv_year3 + comp.dv_year4 + comp.dv_year5 +
                                   comp.dv_year6 + comp.dv_year7 + comp.dv_year8 + comp.dv_year9 + comp.dv_year10;
                    const pcTotal = comp.pc_year1 + comp.pc_year2 + comp.pc_year3 + comp.pc_year4 + comp.pc_year5 +
                                   comp.pc_year6 + comp.pc_year7 + comp.pc_year8 + comp.pc_year9 + comp.pc_year10;
                    
                    return (
                      <TableRow key={comp.id}>
                        <TableCell>${formatNumberWithCommas(comp.purchase_price.toString())}</TableCell>
                        <TableCell>{comp.build_year}</TableCell>
                        <TableCell className="text-xs">{PROPERTY_TYPE_LABELS[comp.property_type]}</TableCell>
                        <TableCell>{comp.finish_standard}</TableCell>
                        <TableCell className="text-xs">{CITY_LABELS[comp.nearest_city]}</TableCell>
                        <TableCell className="text-xs">{PURCHASE_CATEGORY_LABELS[comp.purchase_date_category]}</TableCell>
                        <TableCell className="text-right">${formatNumberWithCommas(dvTotal.toString())}</TableCell>
                        <TableCell className="text-right">${formatNumberWithCommas(pcTotal.toString())}</TableCell>
                        <TableCell>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => handleDeleteComp(comp.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          </TabsContent>
          
          <TabsContent value="import" className="space-y-4">
            {/* CSV Import */}
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleExportTemplate}>
                  <Download className="mr-2 h-4 w-4" />
                  Download Template
                </Button>
              </div>
              
              <div className="border-2 border-dashed rounded-lg p-6 text-center">
                <FileSpreadsheet className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
                <Label htmlFor="csv-upload" className="cursor-pointer">
                  <span className="text-primary hover:underline">Click to upload</span>
                  <span className="text-muted-foreground"> or drag and drop a CSV file</span>
                </Label>
                <Input
                  id="csv-upload"
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>
              
              {csvError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{csvError}</AlertDescription>
                </Alert>
              )}
              
              {csvPreview.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Preview (first 5 rows):</h4>
                    <Badge variant="secondary">
                      {csvFullData.length - 1} total rows found
                    </Badge>
                  </div>
                  <ScrollArea className="h-[200px] rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {csvPreview[0].map((header, i) => (
                            <TableHead key={i} className="text-xs">{header}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {csvPreview.slice(1).map((row, i) => (
                          <TableRow key={i}>
                            {row.map((cell, j) => (
                              <TableCell key={j} className="text-xs">{cell}</TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                  
                  <Button onClick={handleImportCsv} disabled={uploading}>
                    {uploading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        Import All {csvFullData.length - 1} Records
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
        
        {/* Add Comp Modal */}
        <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add Depreciation Comparable</DialogTitle>
              <DialogDescription>
                Add a new comparable property to the database
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Purchase Price</Label>
                  <Input
                    type="number"
                    value={newComp.purchase_price || ''}
                    onChange={(e) => setNewComp(prev => ({ ...prev, purchase_price: parseFloat(e.target.value) || 0 }))}
                    placeholder="750000"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Build Year</Label>
                  <Input
                    type="number"
                    value={newComp.build_year || ''}
                    onChange={(e) => setNewComp(prev => ({ ...prev, build_year: parseInt(e.target.value) || 0 }))}
                    placeholder="2022"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Purchase Date Category</Label>
                  <Select 
                    value={newComp.purchase_date_category} 
                    onValueChange={(v) => setNewComp(prev => ({ ...prev, purchase_date_category: v as PurchaseDateCategory }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PURCHASE_CATEGORY_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Property Type</Label>
                  <Select 
                    value={newComp.property_type} 
                    onValueChange={(v) => setNewComp(prev => ({ ...prev, property_type: v as PropertyType }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PROPERTY_TYPE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Finish Standard</Label>
                  <Select 
                    value={newComp.finish_standard} 
                    onValueChange={(v) => setNewComp(prev => ({ ...prev, finish_standard: v as FinishStandard }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(FINISH_STANDARD_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Nearest City</Label>
                  <Select 
                    value={newComp.nearest_city} 
                    onValueChange={(v) => setNewComp(prev => ({ ...prev, nearest_city: v as NearestCity }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(CITY_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <Separator />
              
              <div className="space-y-2">
                <Label>Bulk Year Values (paste from spreadsheet)</Label>
                <Textarea
                  value={bulkYearsInput}
                  onChange={(e) => setBulkYearsInput(e.target.value)}
                  placeholder="Paste 20 values: DV Year 1-10, then PC Year 1-10 (tab, comma, or newline separated)"
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  Format: DV1, DV2, DV3... DV10, PC1, PC2, PC3... PC10
                </p>
              </div>
              
              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Input
                  value={newComp.notes || ''}
                  onChange={(e) => setNewComp(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Source or additional info"
                />
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddComp}>
                <Plus className="mr-2 h-4 w-4" />
                Add Comparable
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

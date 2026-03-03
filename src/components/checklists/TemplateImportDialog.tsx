import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Upload, FileText, Code, Globe, Loader2, CheckCircle2, AlertCircle, FileSpreadsheet, FileType } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { parseTemplateContent, readFileAsText, detectFormatFromFile, type ParsedTemplate } from '@/utils/checklistTemplateParser';
import { extractPdfTextClientSide } from '@/lib/pdfClientExtractor';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

interface TemplateImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (template: ParsedTemplate) => Promise<void>;
}

type ImportStep = 'input' | 'preview' | 'importing';

export function TemplateImportDialog({ open, onOpenChange, onImport }: TemplateImportDialogProps) {
  const [step, setStep] = useState<ImportStep>('input');
  const [pasteContent, setPasteContent] = useState('');
  const [parsedTemplate, setParsedTemplate] = useState<ParsedTemplate | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');

  const reset = () => {
    setStep('input');
    setPasteContent('');
    setParsedTemplate(null);
    setParseError(null);
    setIsProcessing(false);
    setProgress(0);
    setProgressLabel('');
  };

  const handleClose = (val: boolean) => {
    if (!val) reset();
    onOpenChange(val);
  };

  // ── Parse pasted content ──
  const handleParsePaste = () => {
    if (!pasteContent.trim()) return;
    try {
      setParseError(null);
      const result = parseTemplateContent(pasteContent);
      setParsedTemplate(result);
      setStep('preview');
    } catch (e: any) {
      setParseError(e.message);
    }
  };

  // ── Handle file processing ──
  const processFile = useCallback(async (file: File) => {
    setIsProcessing(true);
    setParseError(null);
    setProgress(0);

    try {
      const format = detectFormatFromFile(file);
      let textContent = '';

      if (format === 'pdf') {
        setProgressLabel('Extracting text from PDF...');
        const result = await extractPdfTextClientSide(file, (current, total) => {
          setProgress(Math.round((current / total) * 100));
        });
        textContent = result.text;
      } else if (format === 'docx') {
        setProgressLabel('Reading Word document...');
        // Extract text from DOCX using ZIP structure
        textContent = await extractDocxText(file);
        setProgress(100);
      } else if (format === 'xlsx') {
        setProgressLabel('Reading spreadsheet...');
        textContent = await extractXlsxText(file);
        setProgress(100);
      } else {
        setProgressLabel('Reading file...');
        textContent = await readFileAsText(file);
        setProgress(100);
      }

      if (!textContent || textContent.trim().length < 10) {
        throw new Error('Could not extract sufficient text from the file. The file may be empty or in an unsupported format.');
      }

      setProgressLabel('Parsing checklist structure...');
      const textFormat = format === 'pdf' || format === 'docx' ? 'markdown' : format === 'xlsx' ? 'text' : format;
      const parsed = parseTemplateContent(textContent, textFormat as any);
      setParsedTemplate(parsed);
      setStep('preview');
    } catch (e: any) {
      setParseError(e.message);
    } finally {
      setIsProcessing(false);
      setProgressLabel('');
    }
  }, []);

  // ── Dropzone ──
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => {
      if (files.length > 0) processFile(files[0]);
    },
    accept: {
      'application/json': ['.json'],
      'text/markdown': ['.md', '.markdown'],
      'text/html': ['.html', '.htm'],
      'text/plain': ['.txt'],
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    maxFiles: 1,
    disabled: isProcessing,
  });

  // ── Import ──
  const handleImport = async () => {
    if (!parsedTemplate) return;
    setStep('importing');
    try {
      await onImport(parsedTemplate);
      handleClose(false);
      toast.success(`Template "${parsedTemplate.name}" imported with ${parsedTemplate.sections.length} sections`);
    } catch (e: any) {
      toast.error(`Import failed: ${e.message}`);
      setStep('preview');
    }
  };

  const totalItems = parsedTemplate?.sections.reduce((sum, s) => sum + s.items.length, 0) || 0;
  const preCheckedItems = parsedTemplate?.sections.reduce((sum, s) => sum + s.items.filter(i => i.is_pre_checked).length, 0) || 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === 'input' && 'Import Checklist Template'}
            {step === 'preview' && 'Preview Template'}
            {step === 'importing' && 'Importing...'}
          </DialogTitle>
          <DialogDescription>
            {step === 'input' && 'Upload a file or paste content in any supported format'}
            {step === 'preview' && 'Review the parsed template before importing'}
          </DialogDescription>
        </DialogHeader>

        {/* ── Step 1: Input ── */}
        {step === 'input' && (
          <div className="space-y-4">
            {/* Supported formats */}
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: 'Markdown', icon: FileText },
                { label: 'JSON', icon: Code },
                { label: 'HTML', icon: Globe },
                { label: 'PDF', icon: FileType },
                { label: 'Word (.docx)', icon: FileText },
                { label: 'Excel', icon: FileSpreadsheet },
                { label: 'Plain Text', icon: FileText },
              ].map(f => (
                <Badge key={f.label} variant="outline" className="text-[10px] gap-1 font-normal">
                  <f.icon className="h-2.5 w-2.5" />
                  {f.label}
                </Badge>
              ))}
            </div>

            <Tabs defaultValue="upload" className="w-full">
              <TabsList className="w-full grid grid-cols-2">
                <TabsTrigger value="upload">Upload File</TabsTrigger>
                <TabsTrigger value="paste">Paste Content</TabsTrigger>
              </TabsList>

              <TabsContent value="upload" className="mt-3">
                <div
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
                    ${isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}
                    ${isProcessing ? 'pointer-events-none opacity-60' : ''}`}
                >
                  <input {...getInputProps()} />
                  {isProcessing ? (
                    <div className="space-y-3">
                      <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground">{progressLabel}</p>
                      <Progress value={progress} className="h-2 max-w-xs mx-auto" />
                    </div>
                  ) : (
                    <>
                      <Upload className="h-8 w-8 mx-auto text-muted-foreground/50 mb-3" />
                      <p className="text-sm font-medium">Drop a file here or click to browse</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        .md, .json, .html, .pdf, .docx, .xlsx, .txt
                      </p>
                    </>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="paste" className="mt-3 space-y-3">
                <Textarea
                  rows={12}
                  placeholder={`Paste your checklist in any format:\n\n## Daily Operations\n\n### Start of the Day\n- [ ] Check emails\n- [ ] Review pipeline\n- [x] Update tracker\n\nOr JSON: { "name": "...", "sections": [...] }\nOr HTML: <h2>Section</h2><ul><li>Item</li></ul>`}
                  value={pasteContent}
                  onChange={e => setPasteContent(e.target.value)}
                  className="font-mono text-xs"
                />
                <Button onClick={handleParsePaste} disabled={!pasteContent.trim()} className="w-full">
                  Parse Content
                </Button>
              </TabsContent>
            </Tabs>

            {parseError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <p>{parseError}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Preview ── */}
        {step === 'preview' && parsedTemplate && (
          <div className="space-y-4">
            {/* Editable name & icon */}
            <div className="space-y-3 p-3 rounded-lg bg-muted/50">
              <div className="flex gap-3">
                <div className="w-20">
                  <Label className="text-xs text-muted-foreground">Icon</Label>
                  <Input
                    value={parsedTemplate.icon}
                    onChange={e => setParsedTemplate({ ...parsedTemplate, icon: e.target.value })}
                    className="text-center text-xl"
                  />
                </div>
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">Template Name</Label>
                  <Input
                    value={parsedTemplate.name}
                    onChange={e => setParsedTemplate({ ...parsedTemplate, name: e.target.value })}
                    placeholder="e.g. Daily Operations Checklist"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Description (optional)</Label>
                <Input
                  value={parsedTemplate.description || ''}
                  onChange={e => setParsedTemplate({ ...parsedTemplate, description: e.target.value || undefined })}
                  placeholder="What is this checklist for?"
                />
              </div>
              <div className="flex gap-2">
                <Badge variant="secondary" className="text-[10px]">{parsedTemplate.sections.length} sections</Badge>
                <Badge variant="secondary" className="text-[10px]">{totalItems} items</Badge>
                {preCheckedItems > 0 && (
                  <Badge variant="outline" className="text-[10px]">{preCheckedItems} pre-checked</Badge>
                )}
              </div>
            </div>

            {/* Sections preview */}
            <div className="max-h-[40vh] overflow-y-auto space-y-2">
              {parsedTemplate.sections.map((section, si) => (
                <Card key={si}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span>{section.icon}</span>
                      <h4 className="font-medium text-sm">{section.title}</h4>
                      <Badge variant="outline" className="text-[10px] ml-auto">{section.items.length} items</Badge>
                    </div>
                    <div className="space-y-1">
                      {section.items.map((item, ii) => (
                        <div key={ii} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0
                            ${item.is_pre_checked ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/40'}`}>
                            {item.is_pre_checked && <CheckCircle2 className="h-2.5 w-2.5" />}
                          </div>
                          <span className={item.is_pre_checked ? 'text-foreground' : ''}>{item.label}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 3: Importing ── */}
        {step === 'importing' && (
          <div className="py-8 text-center space-y-3">
            <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Creating template and items...</p>
          </div>
        )}

        <DialogFooter>
          {step === 'input' && (
            <Button variant="ghost" onClick={() => handleClose(false)}>Cancel</Button>
          )}
          {step === 'preview' && (
            <>
              <Button variant="ghost" onClick={() => { setStep('input'); setParsedTemplate(null); }}>
                ← Back
              </Button>
              <Button onClick={handleImport}>
                Import {totalItems} Items
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── DOCX text extraction (basic ZIP-based) ──
async function extractDocxText(file: File): Promise<string> {
  const JSZip = (await import('jszip')).default;
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const docXml = await zip.file('word/document.xml')?.async('string');
  if (!docXml) throw new Error('Could not read Word document content');
  
  // Parse XML and extract text + structure
  const parser = new DOMParser();
  const doc = parser.parseFromString(docXml, 'application/xml');
  const paragraphs = doc.getElementsByTagName('w:p');
  const lines: string[] = [];

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const style = p.getElementsByTagName('w:pStyle')[0]?.getAttribute('w:val') || '';
    const texts = p.getElementsByTagName('w:t');
    let lineText = '';
    for (let j = 0; j < texts.length; j++) {
      lineText += texts[j].textContent || '';
    }
    if (!lineText.trim()) continue;

    // Convert Word heading styles to markdown
    if (style.match(/Heading1|heading1/i)) {
      lines.push(`# ${lineText}`);
    } else if (style.match(/Heading2|heading2/i)) {
      lines.push(`## ${lineText}`);
    } else if (style.match(/Heading3|heading3/i)) {
      lines.push(`### ${lineText}`);
    } else if (style.match(/ListParagraph|listparagraph/i) || p.getElementsByTagName('w:numPr').length > 0) {
      // Check for checkbox characters
      if (lineText.match(/^[\u2610\u2611☐☑✓✔]/)) {
        const checked = lineText.match(/^[\u2611☑✓✔]/);
        const label = lineText.replace(/^[\u2610\u2611☐☑✓✔]\s*/, '');
        lines.push(checked ? `- [x] ${label}` : `- [ ] ${label}`);
      } else {
        lines.push(`- [ ] ${lineText}`);
      }
    } else {
      lines.push(lineText);
    }
  }

  return lines.join('\n');
}

// ── Excel text extraction ──
async function extractXlsxText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const lines: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
    
    if (workbook.SheetNames.length > 1) {
      lines.push(`## ${sheetName}`);
    }

    let lastSection = '';
    for (const row of data) {
      if (!row || row.length === 0) continue;
      const firstCell = String(row[0] || '').trim();
      if (!firstCell) continue;

      // Heuristic: if row has only one cell and it's short text, treat as section
      const nonEmpty = row.filter(c => c && String(c).trim());
      if (nonEmpty.length === 1 && firstCell.length < 80 && !firstCell.match(/^[-*☐☑✓✔\[]/)) {
        lines.push(`### ${firstCell}`);
        lastSection = firstCell;
      } else {
        // Check for checkbox-like values in second column
        const status = row.length > 1 ? String(row[1] || '').trim().toLowerCase() : '';
        const isChecked = ['yes', 'done', 'complete', 'true', 'x', '✓', '✔', '☑'].includes(status);
        lines.push(isChecked ? `- [x] ${firstCell}` : `- [ ] ${firstCell}`);
      }
    }
  }

  return lines.join('\n');
}

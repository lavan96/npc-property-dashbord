import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import {
  Mail,
  Phone,
  Smartphone,
  Building2,
  Globe,
  AlertTriangle,
  ClipboardCheck,
  FileText,
  Tag,
  Hash,
  Activity,
  Sparkles,
} from 'lucide-react';

interface PropertyIntakeDetailsProps {
  fields: Record<string, any>;
}

const fmtPct = (v: any) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  if (!isFinite(n)) return null;
  const pct = n <= 1 ? n * 100 : n;
  return Math.round(pct);
};

const Row = ({ label, value, icon: Icon, mono }: { label: string; value: any; icon?: any; mono?: boolean }) => {
  if (value === null || value === undefined || value === '' || value === false) return null;
  const display = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value);
  return (
    <div className="flex items-start gap-2 text-sm">
      {Icon && <Icon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />}
      <span className="text-muted-foreground min-w-[140px] shrink-0">{label}:</span>
      <span className={mono ? 'font-mono text-xs break-all' : 'break-words'}>{display}</span>
    </div>
  );
};

const ConfBar = ({ label, value }: { label: string; value: any }) => {
  const pct = fmtPct(value);
  if (pct === null) return null;
  const tone =
    pct >= 80 ? 'bg-success' : pct >= 60 ? 'bg-primary' : pct >= 40 ? 'bg-warning' : 'bg-destructive';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{pct}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

export function PropertyIntakeDetails({ fields }: PropertyIntakeDetailsProps) {
  const f = fields || {};

  // Only render if this looks like a Property Intake Master record.
  const looksLikePIM =
    'Extraction Confidence' in f ||
    'Overall Data Quality Score' in f ||
    'Processing Stage' in f ||
    'Property Unique Key' in f ||
    'Record Type' in f;

  if (!looksLikePIM) return null;

  const fullAddress =
    f['Full Address'] ||
    [f['Street Number'], f['Street Name'], f['Street Type']].filter(Boolean).join(' ');

  return (
    <div className="space-y-6">
      <Separator />

      {/* Classification */}
      <section>
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Tag className="h-4 w-4" /> Classification
        </h3>
        <div className="flex flex-wrap gap-2">
          {f['Sector'] && <Badge variant="outline">Sector: {f['Sector']}</Badge>}
          {f['Intent'] && <Badge variant="outline">Intent: {f['Intent']}</Badge>}
          {f['Category'] && <Badge variant="secondary">{f['Category']}</Badge>}
          {f['Record Type'] && <Badge variant="outline">{f['Record Type']}</Badge>}
          {f['Contract Type'] && f['Contract Type'] !== 'Unknown' && (
            <Badge variant="outline">Contract: {f['Contract Type']}</Badge>
          )}
          {f['Sale Method'] && f['Sale Method'] !== 'Unknown' && (
            <Badge variant="outline">Sale: {f['Sale Method']}</Badge>
          )}
          {f['Package Type'] && f['Package Type'] !== 'Unknown' && (
            <Badge variant="outline">Package: {f['Package Type']}</Badge>
          )}
          {f['Rent Period'] && f['Rent Period'] !== 'Unknown' && (
            <Badge variant="outline">Rent Period: {f['Rent Period']}</Badge>
          )}
          {f['GST Applicable'] && f['GST Applicable'] !== 'Unknown' && (
            <Badge variant="outline">GST: {f['GST Applicable']}</Badge>
          )}
          {f['Open Home Available'] && <Badge className="bg-success/20 text-success border-success/30">Open Home</Badge>}
        </div>
      </section>

      {/* Address breakdown */}
      {(fullAddress || f['Normalized Address'] || f['Country']) && (
        <section>
          <h3 className="text-lg font-semibold mb-3">Address Breakdown</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Row label="Full Address" value={fullAddress} />
            <Row label="Normalized" value={f['Normalized Address']} />
            <Row label="Street Number" value={f['Street Number']} />
            <Row label="Street Name" value={f['Street Name']} />
            <Row label="Street Type" value={f['Street Type']} />
            <Row label="Country" value={f['Country']} />
          </div>
        </section>
      )}

      {/* Agent & Agency extended */}
      {(f['Agent Email'] || f['Agent Mobile'] || f['Agency Email'] || f['Agency Office Phone'] || f['Agent Role'] || f['Agent / Agency Notes']) && (
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Building2 className="h-4 w-4" /> Agent & Agency (Extended)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Row label="Agent Role" value={f['Agent Role']} />
            <Row label="Agent Email" value={f['Agent Email']} icon={Mail} />
            <Row label="Agent Mobile" value={f['Agent Mobile']} icon={Smartphone} />
            <Row label="Agency Email" value={f['Agency Email']} icon={Mail} />
            <Row label="Agency Office Phone" value={f['Agency Office Phone']} icon={Phone} />
            <Row label="Sender Name" value={f['Sender Name']} />
            <Row label="Sender Email" value={f['Sender Email']} icon={Mail} />
            <Row label="Sender Domain" value={f['Sender Domain']} icon={Globe} />
          </div>
          {f['Agent / Agency Notes'] && (
            <p className="mt-2 text-sm text-muted-foreground italic">{f['Agent / Agency Notes']}</p>
          )}
        </section>
      )}

      {/* Inspection raw */}
      {(f['Next Inspection Date'] || f['Inspection Raw Text']) && (
        <section>
          <h3 className="text-lg font-semibold mb-3">Inspection (Extended)</h3>
          <div className="space-y-1">
            <Row label="Next Inspection" value={f['Next Inspection Date'] ? new Date(f['Next Inspection Date']).toLocaleString('en-AU') : null} />
            <Row label="Raw Text" value={f['Inspection Raw Text']} />
          </div>
        </section>
      )}

      {/* Processing status */}
      <section>
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4" /> Processing
        </h3>
        <div className="flex flex-wrap gap-2 mb-3">
          {f['Processing Stage'] && <Badge variant="outline">Stage: {f['Processing Stage']}</Badge>}
          {f['Processing Status'] && <Badge variant="outline">Status: {f['Processing Status']}</Badge>}
          {f['Record Status'] && (
            <Badge variant={f['Record Status'] === 'Needs Review' ? 'destructive' : 'secondary'}>
              {f['Record Status']}
            </Badge>
          )}
          {f['Enrichment Status'] && <Badge variant="outline">Enrichment: {f['Enrichment Status']}</Badge>}
          {f['Listing Status'] && <Badge variant="outline">Listing: {f['Listing Status']}</Badge>}
          {f['Web Scrape Status'] && <Badge variant="outline">Scrape: {f['Web Scrape Status']}</Badge>}
          {f['Source Type'] && <Badge variant="secondary">Source: {f['Source Type']}</Badge>}
        </div>
        {f['Last Modified Time'] && (
          <p className="text-xs text-muted-foreground">
            Last modified: {new Date(f['Last Modified Time']).toLocaleString('en-AU')}
          </p>
        )}
      </section>

      {/* Confidence scores */}
      {(f['Overall Data Quality Score'] || f['Extraction Confidence'] || f['Address Confidence'] || f['Price Confidence'] || f['Specs Confidence'] || f['Agent Details Confidence']) && (
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> Confidence Scores
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ConfBar label="Overall Data Quality" value={f['Overall Data Quality Score']} />
            <ConfBar label="Extraction" value={f['Extraction Confidence']} />
            <ConfBar label="Address" value={f['Address Confidence']} />
            <ConfBar label="Price" value={f['Price Confidence']} />
            <ConfBar label="Specs" value={f['Specs Confidence']} />
            <ConfBar label="Agent Details" value={f['Agent Details Confidence']} />
          </div>
        </section>
      )}

      {/* Human review */}
      {(f['Needs Human Review'] || f['Human Review Status'] || f['Human Review Notes'] || f['Follow-up Notes']) && (
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" /> Human Review
          </h3>
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {f['Needs Human Review'] && (
                <Badge variant="destructive">Needs Human Review</Badge>
              )}
              {f['Human Review Status'] && <Badge variant="outline">{f['Human Review Status']}</Badge>}
            </div>
            {f['Human Review Notes'] && (
              <div>
                <span className="text-xs text-muted-foreground">Reviewer notes:</span>
                <p className="text-sm">{f['Human Review Notes']}</p>
              </div>
            )}
            {f['Follow-up Notes'] && (
              <div>
                <span className="text-xs text-muted-foreground">Follow-up:</span>
                <p className="text-sm">{f['Follow-up Notes']}</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Errors */}
      {(f['Error Type'] || f['Error Message'] || f['Last Error Module']) && (
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" /> Extraction Issues
          </h3>
          <div className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <Row label="Type" value={f['Error Type']} />
            <Row label="Module" value={f['Last Error Module']} />
            <Row label="Message" value={f['Error Message']} />
          </div>
        </section>
      )}

      {/* Source content */}
      {(f['Raw Source Snippet'] || f['Original Row Text'] || f['Property Description'] || f['Source Web Link']) && (
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4" /> Source Content
          </h3>
          {f['Property Description'] && (
            <div className="mb-3">
              <span className="text-xs text-muted-foreground">Property Description</span>
              <p className="text-sm mt-1">{f['Property Description']}</p>
            </div>
          )}
          {f['Raw Source Snippet'] && (
            <div className="mb-3">
              <span className="text-xs text-muted-foreground">Raw Source Snippet</span>
              <pre className="text-xs mt-1 p-2 rounded bg-muted whitespace-pre-wrap break-words max-h-48 overflow-auto">{f['Raw Source Snippet']}</pre>
            </div>
          )}
          {f['Original Row Text'] && (
            <Row label="Original Row" value={f['Original Row Text']} mono />
          )}
          {f['Source Web Link'] && (
            <a
              href={f['Source Web Link']}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline break-all"
            >
              {f['Source Web Link']}
            </a>
          )}
        </section>
      )}

      {/* Identifiers */}
      {(f['Property Unique Key'] || f['Property Record Name'] || f['Address Match Key'] || f['Project Match Key']) && (
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Hash className="h-4 w-4" /> Identifiers
          </h3>
          <div className="space-y-1">
            <Row label="Record Name" value={f['Property Record Name']} />
            <Row label="Unique Key" value={f['Property Unique Key']} mono />
            <Row label="Address Match" value={f['Address Match Key']} mono />
            <Row label="Project Match" value={f['Project Match Key']} mono />
          </div>
        </section>
      )}
    </div>
  );
}

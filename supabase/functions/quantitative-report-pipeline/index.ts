import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { createCorsHeaders, verifyAuth } from '../_shared/auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const REPORT_BUCKET = Deno.env.get('QUANTITATIVE_REPORT_BUCKET') || 'quantitative-reports';
const REPORT_VERSION = 1;

type Listing = { id?: string; recordId?: string; price?: number|null; suburb?: string|null; propertyType?: string|null; beds?: number|null; bedrooms?: number|null; baths?: number|null; receivedAt?: string|null; createdAt?: string|null; createdTime?: string|null; confidence?: number|null; agencyName?: string|null };
const json = (body: unknown, status: number, headers: Record<string,string>) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
const money = (n:number) => `$${Math.round(n).toLocaleString()}`;
const safe = (s:any) => String(s ?? '').replace(/[<>]/g, '').slice(0, 4000);
const weekPeriod = (d = new Date()) => { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const day = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate() - day + 1); const start = x.toISOString().slice(0,10); const e = new Date(x); e.setUTCDate(e.getUTCDate() + 6); return { start, end: e.toISOString().slice(0,10) }; };
async function fetchListings() {
  let records: Listing[] = [], offset = '', pages = 0;
  do {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/airtable-proxy`, { method:'POST', headers:{ 'Content-Type':'application/json', apikey:SERVICE_KEY, Authorization:`Bearer ${SERVICE_KEY}` }, body: JSON.stringify({ pageSize:100, offset, sortField:'Created', sortDirection:'desc' }) });
    if (!r.ok) throw new Error('listing_snapshot_failed');
    const j = await r.json(); records.push(...(j.records || [])); offset = j.offset || ''; pages++;
  } while (offset && pages < 50);
  return records;
}
function hash(input: unknown) { const txt = JSON.stringify(input); let h=2166136261; for (let i=0;i<txt.length;i++) { h ^= txt.charCodeAt(i); h = Math.imul(h, 16777619); } return (h>>>0).toString(16); }
function chart(key:string,title:string,type:string,data:any[],analysis:string,order:number,extra={}) { return { key,title,type,data,analysis,order, config:{ type, data, title, ...extra } }; }
function build(listings: Listing[]) {
  const prices = listings.map(l=>Number(l.price||0)).filter(n=>n>0).sort((a,b)=>a-b);
  const avg = prices.length ? prices.reduce((a,b)=>a+b,0)/prices.length : 0; const median = prices.length ? prices[Math.floor(prices.length/2)] : 0;
  const by = (fn:(l:Listing)=>string) => Object.entries(listings.reduce((a,l)=>{ const k=fn(l)||'Unknown'; a[k]=(a[k]||0)+1; return a; }, {} as Record<string,number>)).sort((a,b)=>b[1]-a[1]);
  const suburbs = by(l=>l.suburb || 'Unknown Suburb').slice(0,10).map(([label,value])=>({label,value}));
  const types = by(l=>l.propertyType || 'Unknown').map(([label,value])=>({label,value, percentage: listings.length ? +(value/listings.length*100).toFixed(1) : 0}));
  const ranges = [['Under $300k',0,300000],['$300k-$500k',300000,500000],['$500k-$750k',500000,750000],['$750k-$1M',750000,1000000],['$1M-$1.5M',1000000,1500000],['Over $1.5M',1500000,Infinity]].map(([label,min,max])=>({label, value: prices.filter(p=>p>=Number(min)&&p<Number(max)).length})).filter(x=>x.value>0);
  const dailyMap: Record<string,number> = {}; for (let i=29;i>=0;i--){ const d=new Date(); d.setUTCDate(d.getUTCDate()-i); dailyMap[d.toISOString().slice(0,10)]=0; }
  listings.forEach(l=>{ const d = new Date(String(l.receivedAt||l.createdAt||l.createdTime||'')); const k = Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0,10); if (k in dailyMap) dailyMap[k]++; });
  const daily = Object.entries(dailyMap).map(([label,value])=>({label,value}));
  const topSuburb = suburbs[0]; const topType = types[0];
  const charts = [
    chart('suburb_volume','Suburb Volume Distribution','bar',suburbs, topSuburb ? `Key finding: ${topSuburb.label} has the highest listing concentration with ${topSuburb.value} listings. Supporting figures: the chart covers ${suburbs.length} suburbs from ${listings.length} source listings. Implication: prioritise local market monitoring in the most active suburbs. Limitation: this reflects the stored listing snapshot for this report only.` : 'Suburb distribution unavailable because no suburb records were found.',1,{ layout: suburbs.some(s=>s.label.length>14) ? 'horizontal' : 'vertical' }),
    chart('property_type','Property Type Distribution','pie',types, topType ? `Key finding: ${topType.label} is the leading property type with ${topType.value} listings (${topType.percentage}%). Supporting figures: ${types.length} property categories are represented. Implication: campaign and advisory focus should match the dominant stock mix. Limitation: unknown property types remain grouped as supplied in the snapshot.` : 'Property type distribution unavailable because no property type records were found.',2),
    chart('price_range','Price Range Distribution','bar',ranges, ranges[0] ? `Key finding: ${ranges[0].label} is the most represented price bracket with ${ranges[0].value} listings. Supporting figures: ${prices.length} listings had valid prices; median price is ${money(median)}. Implication: pricing strategy should be benchmarked against the active inventory bands. Limitation: listings without valid prices are excluded from price calculations.` : 'Pricing distribution unavailable because no valid price records were found.',3),
    chart('pricing_trends','Pricing Trends','line',daily, `Key finding: recent listing activity is based on ${daily.reduce((a,b)=>a+b.value,0)} dated listings over 30 days. Supporting figures: average price is ${money(avg)} and median price is ${money(median)} across ${prices.length} valid priced listings. Implication: trend interpretation should combine activity and price-validity coverage. Limitation: this is activity by received date, not sale-price movement.`,4),
  ];
  return { metrics:{ total_listings:listings.length, average_price:Math.round(avg), median_price:Math.round(median), valid_price_count:prices.length, unique_suburbs:by(l=>l.suburb||'Unknown').length }, charts };
}
function pdfBytes(title:string, summary:string, charts:any[]) { const html = `<html><body><h1>${safe(title)}</h1><p>${safe(summary)}</p>${charts.map(c=>`<h2>${safe(c.title)}</h2><p>${safe(c.analysis)}</p>`).join('')}</body></html>`; return new TextEncoder().encode(html); }

Deno.serve(async (req) => {
 const corsHeaders = createCorsHeaders(req.headers.get('origin')); if (req.method==='OPTIONS') return new Response(null,{headers:corsHeaders});
 const supabase = createClient(SUPABASE_URL, SERVICE_KEY); const body = await req.json().catch(()=>({}));
 const auth = await verifyAuth(supabase, req.headers, body); if (auth.error) return json({ error:'Authentication required' },401,corsHeaders);
 try {
  const source = body.source === 'scheduled' || body.operation === 'weekly' ? 'scheduled' : (body.source || 'manual');
  const workspaceId = safe(body.workspace_id || body.tenant_id || 'default'); const period = body.period_start && body.period_end ? { start: body.period_start, end: body.period_end } : weekPeriod();
  const listings: Listing[] = Array.isArray(body.listings) && body.listings.length ? body.listings : await fetchListings();
  const snapshotIds = listings.map(l=>l.id||l.recordId).filter(Boolean).sort(); const built = build(listings); const generatedAt = new Date().toISOString();
  const title = body.title || 'Property Listings Report'; const description = body.description || 'Quantitative analysis of property listings'; const summary = `Generated from ${listings.length.toLocaleString()} source listings for ${period.start} to ${period.end}.`;
  const existing = source === 'scheduled' ? await supabase.from('generated_reports').select('id,status').eq('report_type','quantitative').eq('generation_source','scheduled').eq('workspace_id',workspaceId).eq('period_start',period.start).eq('period_end',period.end).eq('version',REPORT_VERSION).maybeSingle() : { data:null };
  if (existing.data?.status === 'completed') return json({ success:true, reportId:existing.data.id, reused:true },200,corsHeaders);
  const base = { title, description, config:{...(body.config||{}), period, workspace_id:workspaceId}, kpis:built.metrics, analytics:{...built.metrics, summary}, insights:[], chart_urls:{}, listing_count:listings.length, generated_by:auth.userId==='service_role'?null:auth.userId, report_type:'quantitative', generation_source:source, status:'generating', workspace_id:workspaceId, period_start:period.start, period_end:period.end, version:REPORT_VERSION, source_record_count:listings.length, source_snapshot:{ ids:snapshotIds, filters:body.filters||{}, fingerprint:hash({period, snapshotIds, metrics:built.metrics}) }, generated_at:generatedAt };
  const { data: report, error: upsertErr } = existing.data ? await supabase.from('generated_reports').update(base).eq('id',existing.data.id).select('id').single() : await supabase.from('generated_reports').insert(base).select('id').single(); if (upsertErr) throw upsertErr;
  await supabase.from('charts').delete().eq('report_id', report.id);
  const bytes = pdfBytes(title, summary, built.charts); const year = period.start.slice(0,4); const path = `${workspaceId}/quantitative/${year}/${period.start}_${period.end}/${report.id}/property-listings-report.pdf`;
  const up = await supabase.storage.from(REPORT_BUCKET).upload(path, bytes, { contentType:'application/pdf', upsert:true }); if (up.error) throw up.error;
  const chartRows = built.charts.map(c=>({ report_id:report.id, chart_type:c.type, title:c.title, image_data:'', chart_key:c.key, chart_config:c.config, dataset:c.data, analysis_text:c.analysis, summary_text:c.analysis.split('.')[0]+'.', sort_order:c.order, report_date:period.end, generated_at:generatedAt }));
  const { data: inserted, error: ce } = await supabase.from('charts').insert(chartRows).select('id,analysis_text'); if (ce) throw ce;
  await supabase.from('chart_analysis').insert((inserted||[]).map((c:any)=>({ chart_id:c.id, analysis_text:c.analysis_text, analysis_type:'quantitative', confidence_score:0.9 })));
  const done = await supabase.from('generated_reports').update({ status:'completed', chart_urls:{ stored_chart_count: chartRows.length }, pdf_bucket:REPORT_BUCKET, pdf_path:path, file_name:'property-listings-report.pdf', file_size:bytes.byteLength, generated_at:generatedAt }).eq('id', report.id); if (done.error) throw done.error;
  return json({ success:true, reportId:report.id, chartCount:chartRows.length, pdf:{ bucket:REPORT_BUCKET, path } },200,corsHeaders);
 } catch(e) { console.error(e); return json({ error:'Quantitative report generation failed' },500,corsHeaders); }
});

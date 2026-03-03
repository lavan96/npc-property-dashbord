/**
 * Multi-format parser for checklist templates.
 * Supports: JSON, Markdown, HTML, Plain Text, and extracted text from PDFs/Word/Excel.
 */

export interface ParsedTemplateSection {
  title: string;
  icon: string;
  items: { label: string; is_pre_checked: boolean }[];
}

export interface ParsedTemplate {
  name: string;
  description?: string;
  icon: string;
  sections: ParsedTemplateSection[];
}

// ── Icon mapping for common section keywords ──
const SECTION_ICON_MAP: Record<string, string> = {
  daily: '🔹', start: '▶️', before: '▶️', after: '▶️', call: '📞',
  'no show': '🚫', agreement: '✍️', financial: '💼', consultation: '💼',
  strategy: '💼', assessment: '📊', smsf: '🏦', property: '🏠',
  research: '🏠', shortlist: '🏠', operations: '🔹', review: '📊',
  invoic: '✍️', booking: '💼', handling: '🚫', default: '▶️',
};

function inferSectionIcon(title: string): string {
  const lower = title.toLowerCase();
  for (const [keyword, icon] of Object.entries(SECTION_ICON_MAP)) {
    if (lower.includes(keyword)) return icon;
  }
  return '▶️';
}

// ── JSON Parser ──
function parseJSON(text: string): ParsedTemplate {
  const parsed = JSON.parse(text);
  if (!parsed.name) throw new Error('JSON template must have a "name" field');
  return {
    name: parsed.name,
    description: parsed.description || undefined,
    icon: parsed.icon || '📋',
    sections: (parsed.sections || []).map((sec: any) => ({
      title: sec.title || 'Untitled Section',
      icon: sec.icon || inferSectionIcon(sec.title || ''),
      items: (sec.items || []).map((item: any) =>
        typeof item === 'string'
          ? { label: item, is_pre_checked: false }
          : { label: item.label || item.text || String(item), is_pre_checked: !!item.is_pre_checked }
      ),
    })),
  };
}

// ── Markdown / Plain-Text Parser ──
// Detects sections from headings (## or ###) and items from lines starting with - [ ] or - [x]
function parseMarkdown(text: string): ParsedTemplate {
  const lines = text.split('\n');
  let templateName = '';
  let templateDesc = '';
  const sections: ParsedTemplateSection[] = [];
  let currentSection: ParsedTemplateSection | null = null;

  // Regex patterns
  const h1 = /^#\s+(.+)/;
  const h2 = /^##\s+(.+)/;
  const h3 = /^###\s+(.+)/;
  const checkboxChecked = /^[-*]\s*\[x\]\s*(.+)/i;
  const checkboxUnchecked = /^[-*]\s*\[\s?\]\s*(.+)/i;
  const bulletItem = /^[-*]\s+(?!\[)(.+)/;
  // Bold section-like lines (e.g., **Section Title**)
  const boldLine = /^\*\*(.+?)\*\*\s*$/;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Strip emoji prefixes from headings for cleaner titles
    const stripEmoji = (s: string) => s.replace(/^[\p{Emoji}\p{Emoji_Presentation}\s]+/u, '').trim();

    // H1 → template name
    const h1Match = line.match(h1);
    if (h1Match) {
      if (!templateName) templateName = stripEmoji(h1Match[1]).replace(/\*\*/g, '');
      continue;
    }

    // H2 → could be a top-level group or section
    const h2Match = line.match(h2);
    if (h2Match) {
      const title = stripEmoji(h2Match[1]).replace(/\*\*/g, '');
      // If it looks like a description/overview, skip
      if (title.toLowerCase().includes('operational checklist') || title.toLowerCase().includes('notion version')) {
        if (!templateDesc) templateDesc = title;
        continue;
      }
      // Start a new section
      currentSection = { title, icon: inferSectionIcon(title), items: [] };
      sections.push(currentSection);
      continue;
    }

    // H3 → sub-section (becomes a section)
    const h3Match = line.match(h3);
    if (h3Match) {
      const title = stripEmoji(h3Match[1]).replace(/\*\*/g, '');
      currentSection = { title, icon: inferSectionIcon(title), items: [] };
      sections.push(currentSection);
      continue;
    }

    // Bold standalone line as a section header
    const boldMatch = line.match(boldLine);
    if (boldMatch && !checkboxChecked.test(line) && !checkboxUnchecked.test(line)) {
      const title = stripEmoji(boldMatch[1]);
      if (title.length > 3 && title.length < 100) {
        currentSection = { title, icon: inferSectionIcon(title), items: [] };
        sections.push(currentSection);
        continue;
      }
    }

    // Checked checkbox
    const checkedMatch = line.match(checkboxChecked);
    if (checkedMatch && currentSection) {
      currentSection.items.push({ label: checkedMatch[1].replace(/\*\*/g, '').trim(), is_pre_checked: true });
      continue;
    }

    // Unchecked checkbox
    const uncheckedMatch = line.match(checkboxUnchecked);
    if (uncheckedMatch && currentSection) {
      currentSection.items.push({ label: uncheckedMatch[1].replace(/\*\*/g, '').trim(), is_pre_checked: false });
      continue;
    }

    // Plain bullet → treat as an item if within a section
    const bulletMatch = line.match(bulletItem);
    if (bulletMatch && currentSection) {
      const label = bulletMatch[1].replace(/\*\*/g, '').trim();
      if (label.length > 2) {
        currentSection.items.push({ label, is_pre_checked: false });
      }
      continue;
    }
  }

  // Filter out sections with no items (they were likely headings/groupings)
  const meaningful = sections.filter(s => s.items.length > 0);

  // Try to derive a better name from the content structure
  if (!templateName) {
    // Check if empty sections (no items) exist before the first meaningful one — use those as the template name
    const emptySections = sections.filter(s => s.items.length === 0);
    if (emptySections.length > 0) {
      templateName = emptySections[0].title;
    }
  }

  if (meaningful.length === 0) {
    throw new Error('Could not find any checklist items. Make sure your content has checkbox items (- [ ] item) or bullet points under headings.');
  }

  return {
    name: templateName || 'Imported Checklist',
    description: templateDesc || undefined,
    icon: '📋',
    sections: meaningful,
  };
}

// ── HTML Parser ──
function parseHTML(html: string): ParsedTemplate {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  let templateName = '';
  const sections: ParsedTemplateSection[] = [];
  let currentSection: ParsedTemplateSection | null = null;

  // Get H1 for name
  const h1El = doc.querySelector('h1');
  if (h1El) templateName = h1El.textContent?.trim() || '';

  // Walk through headings and lists
  const elements = doc.querySelectorAll('h1, h2, h3, h4, ul, ol, li, input[type="checkbox"]');
  
  // Simpler approach: convert headings to sections, list items to checklist items
  const allElements = doc.body.children;
  for (let i = 0; i < allElements.length; i++) {
    const el = allElements[i];
    const tag = el.tagName.toLowerCase();
    
    if (['h1', 'h2', 'h3', 'h4'].includes(tag)) {
      const title = el.textContent?.trim() || '';
      if (tag === 'h1' && !templateName) {
        templateName = title;
        continue;
      }
      if (title) {
        currentSection = { title, icon: inferSectionIcon(title), items: [] };
        sections.push(currentSection);
      }
    } else if (['ul', 'ol'].includes(tag) && currentSection) {
      const listItems = el.querySelectorAll('li');
      listItems.forEach(li => {
        const checkbox = li.querySelector('input[type="checkbox"]');
        const isChecked = checkbox ? (checkbox as HTMLInputElement).checked : false;
        const label = li.textContent?.trim() || '';
        if (label) {
          currentSection!.items.push({ label, is_pre_checked: isChecked });
        }
      });
    }
  }

  const meaningful = sections.filter(s => s.items.length > 0);
  
  if (meaningful.length === 0) {
    // Fallback: try to parse as markdown-in-html
    const bodyText = doc.body.textContent || '';
    return parseMarkdown(bodyText);
  }

  return {
    name: templateName || 'Imported Checklist',
    icon: '📋',
    sections: meaningful,
  };
}

// ── Main detect-and-parse function ──
export function parseTemplateContent(content: string, format?: 'json' | 'markdown' | 'html' | 'text'): ParsedTemplate {
  const trimmed = content.trim();

  // Auto-detect format if not specified
  if (!format) {
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      format = 'json';
    } else if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.includes('<ul') || trimmed.includes('<h1')) {
      format = 'html';
    } else {
      format = 'markdown'; // Markdown/plain text as default
    }
  }

  switch (format) {
    case 'json':
      return parseJSON(trimmed);
    case 'html':
      return parseHTML(trimmed);
    case 'markdown':
    case 'text':
    default:
      return parseMarkdown(trimmed);
  }
}

// ── File reader helpers ──
export async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

export function detectFormatFromFile(file: File): 'json' | 'markdown' | 'html' | 'text' | 'pdf' | 'docx' | 'xlsx' {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const mime = file.type;
  
  if (ext === 'json' || mime === 'application/json') return 'json';
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  if (ext === 'html' || ext === 'htm' || mime === 'text/html') return 'html';
  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
  if (ext === 'docx' || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (ext === 'xlsx' || ext === 'xls' || mime.includes('spreadsheet') || mime.includes('excel')) return 'xlsx';
  return 'text';
}

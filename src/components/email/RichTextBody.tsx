import React from 'react';

interface RichTextBodyProps {
  content: string;
  className?: string;
}

// Patterns for detecting various types of content
const linkPatterns = {
  url: /(https?:\/\/[^\s<>"{}|\\^`[\]]+|www\.[^\s<>"{}|\\^`[\]]+)/gi,
  email: /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi,
  phone: /(\+?[\d\s-]{10,}|\(\d{2,4}\)\s*[\d\s-]{6,}|\d{4}\s*\d{3}\s*\d{3})/g,
};

// Text formatting patterns (bold, italic, underline)
const formatPatterns = [
  // Bold: **text**, __text__, or *text* (single asterisk for bold in some email clients)
  { pattern: /\*\*(.+?)\*\*/g, tag: 'strong' },
  { pattern: /__(.+?)__/g, tag: 'strong' },
  // Italic: _text_ or /text/
  { pattern: /(?<![a-zA-Z0-9])_([^_]+)_(?![a-zA-Z0-9])/g, tag: 'em' },
  // HTML-style tags that might come from rich text emails
  { pattern: /<b>(.+?)<\/b>/gi, tag: 'strong' },
  { pattern: /<strong>(.+?)<\/strong>/gi, tag: 'strong' },
  { pattern: /<i>(.+?)<\/i>/gi, tag: 'em' },
  { pattern: /<em>(.+?)<\/em>/gi, tag: 'em' },
  { pattern: /<u>(.+?)<\/u>/gi, tag: 'u' },
];

// Apply text formatting (bold, italic, underline)
function applyTextFormatting(text: string): React.ReactNode[] {
  if (!text) return [];
  
  // Find all format matches with their positions
  interface FormatMatch {
    start: number;
    end: number;
    content: string;
    tag: string;
    fullMatch: string;
  }
  
  const matches: FormatMatch[] = [];
  
  for (const { pattern, tag } of formatPatterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(text)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        content: match[1],
        tag,
        fullMatch: match[0],
      });
    }
  }
  
  // Sort by start position
  matches.sort((a, b) => a.start - b.start);
  
  // Remove overlapping matches (keep first)
  const filteredMatches: FormatMatch[] = [];
  for (const match of matches) {
    const overlaps = filteredMatches.some(
      m => (match.start >= m.start && match.start < m.end) ||
           (match.end > m.start && match.end <= m.end)
    );
    if (!overlaps) {
      filteredMatches.push(match);
    }
  }
  
  if (filteredMatches.length === 0) {
    return [text];
  }
  
  // Build result with formatted segments
  const result: React.ReactNode[] = [];
  let lastIndex = 0;
  
  for (let i = 0; i < filteredMatches.length; i++) {
    const match = filteredMatches[i];
    
    // Add text before this match
    if (match.start > lastIndex) {
      result.push(text.slice(lastIndex, match.start));
    }
    
    // Add formatted element
    const FormattedElement = match.tag as keyof JSX.IntrinsicElements;
    result.push(
      <FormattedElement key={`fmt-${i}`} className={match.tag === 'strong' ? 'font-semibold' : match.tag === 'u' ? 'underline' : 'italic'}>
        {match.content}
      </FormattedElement>
    );
    
    lastIndex = match.end;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    result.push(text.slice(lastIndex));
  }
  
  return result;
}

// Parse text for links (URLs, emails, phones)
function parseLinks(text: string): Array<{ type: 'text' | 'url' | 'email' | 'phone'; value: string; index: number }> {
  if (!text) return [];
  
  const segments: Array<{ type: 'text' | 'url' | 'email' | 'phone'; value: string; index: number }> = [];
  
  // Find all URLs
  let match;
  const urlRegex = new RegExp(linkPatterns.url.source, linkPatterns.url.flags);
  while ((match = urlRegex.exec(text)) !== null) {
    segments.push({ type: 'url', value: match[0], index: match.index });
  }
  
  // Find all emails
  const emailRegex = new RegExp(linkPatterns.email.source, linkPatterns.email.flags);
  while ((match = emailRegex.exec(text)) !== null) {
    const overlaps = segments.some(s => 
      (match!.index >= s.index && match!.index < s.index + s.value.length) ||
      (s.index >= match!.index && s.index < match!.index + match![0].length)
    );
    if (!overlaps) {
      segments.push({ type: 'email', value: match[0], index: match.index });
    }
  }
  
  // Find all phone numbers
  const phoneRegex = new RegExp(linkPatterns.phone.source, linkPatterns.phone.flags);
  while ((match = phoneRegex.exec(text)) !== null) {
    const cleanedPhone = match[0].replace(/[\s-]/g, '');
    if (cleanedPhone.replace(/\D/g, '').length >= 8) {
      const overlaps = segments.some(s => 
        (match!.index >= s.index && match!.index < s.index + s.value.length) ||
        (s.index >= match!.index && s.index < match!.index + match![0].length)
      );
      if (!overlaps) {
        segments.push({ type: 'phone', value: match[0], index: match.index });
      }
    }
  }
  
  return segments.sort((a, b) => a.index - b.index);
}

// Render text with links and formatting
function RichTextSpan({ text }: { text: string }) {
  const linkSegments = parseLinks(text);
  
  if (linkSegments.length === 0) {
    // No links, just apply text formatting
    return <>{applyTextFormatting(text)}</>;
  }
  
  // Build result with links
  const result: React.ReactNode[] = [];
  let lastIndex = 0;
  
  for (let i = 0; i < linkSegments.length; i++) {
    const segment = linkSegments[i];
    
    // Add formatted text before this link
    if (segment.index > lastIndex) {
      const textBefore = text.slice(lastIndex, segment.index);
      result.push(<React.Fragment key={`text-${i}`}>{applyTextFormatting(textBefore)}</React.Fragment>);
    }
    
    // Add link element
    switch (segment.type) {
      case 'url':
        const href = segment.value.startsWith('http') ? segment.value : `https://${segment.value}`;
        result.push(
          <a key={`link-${i}`} href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">
            {segment.value}
          </a>
        );
        break;
      case 'email':
        result.push(
          <a key={`link-${i}`} href={`mailto:${segment.value}`} className="text-primary hover:underline">
            {segment.value}
          </a>
        );
        break;
      case 'phone':
        result.push(
          <a key={`link-${i}`} href={`tel:${segment.value.replace(/\D/g, '')}`} className="text-primary hover:underline">
            {segment.value}
          </a>
        );
        break;
    }
    
    lastIndex = segment.index + segment.value.length;
  }
  
  // Add remaining formatted text
  if (lastIndex < text.length) {
    result.push(<React.Fragment key="text-end">{applyTextFormatting(text.slice(lastIndex))}</React.Fragment>);
  }
  
  return <>{result}</>;
}

// Helper to detect email thread separators
const threadSeparatorPatterns = [
  /^-{3,}\s*Original Message\s*-{3,}/i,
  /^-{3,}\s*Forwarded message\s*-{3,}/i,
  /^On .+ wrote:$/,
  /^From:\s*.+$/m,
  /^Sent:\s*.+$/,
  /^To:\s*.+$/,
  /^Subject:\s*.+$/,
];

// Parse email body to separate current message from thread history
function parseEmailThread(body: string): { currentMessage: string; threadHistory: string | null } {
  if (!body) return { currentMessage: '', threadHistory: null };
  
  const lines = body.split('\n');
  let splitIndex = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (
      /^-{3,}\s*Original Message\s*-{3,}/i.test(line) ||
      /^-{3,}\s*Forwarded message\s*-{3,}/i.test(line) ||
      /^On .+ wrote:$/.test(line) ||
      (/^From:\s*.+/.test(line) && i > 2)
    ) {
      splitIndex = i;
      break;
    }
  }
  
  if (splitIndex === -1) {
    return { currentMessage: body, threadHistory: null };
  }
  
  return {
    currentMessage: lines.slice(0, splitIndex).join('\n').trim(),
    threadHistory: lines.slice(splitIndex).join('\n').trim()
  };
}

// Smart paragraph detection - groups related lines together
function smartParagraph(text: string): string[][] {
  if (!text) return [];
  
  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n');
  
  const paragraphs: string[][] = [];
  let currentParagraph: string[] = [];
  let prevLineEmpty = false;
  let prevLineWasBullet = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const isEmpty = trimmed === '';
    const isBullet = /^([-*•>▪◦]|\d+[.):]|\(\d+\)|[a-zA-Z][.):])\s+/.test(trimmed);
    const isGreeting = /^(hi|hello|hey|dear|good\s+(morning|afternoon|evening))/i.test(trimmed);
    const isSignOff = /^(regards|thanks|thank\s+you|best|cheers|sincerely|kind\s+regards)/i.test(trimmed);
    const isShortLine = trimmed.length < 60 && !trimmed.endsWith(',');
    
    if (isEmpty) {
      // Empty line - end current paragraph if it has content
      if (currentParagraph.length > 0) {
        paragraphs.push(currentParagraph);
        currentParagraph = [];
      }
      prevLineEmpty = true;
      prevLineWasBullet = false;
      continue;
    }
    
    // Start new paragraph conditions
    const shouldStartNew = 
      (prevLineEmpty && currentParagraph.length > 0) ||
      (isGreeting && currentParagraph.length > 0) ||
      (isSignOff && currentParagraph.length > 0) ||
      (isBullet && !prevLineWasBullet && currentParagraph.length > 0) ||
      (!isBullet && prevLineWasBullet && currentParagraph.length > 0);
    
    if (shouldStartNew) {
      if (currentParagraph.length > 0) {
        paragraphs.push(currentParagraph);
      }
      currentParagraph = [line];
    } else {
      currentParagraph.push(line);
    }
    
    prevLineEmpty = false;
    prevLineWasBullet = isBullet;
  }
  
  // Don't forget the last paragraph
  if (currentParagraph.length > 0) {
    paragraphs.push(currentParagraph);
  }
  
  return paragraphs;
}

// Detect if a line is a bullet/list item
function parseBulletLine(line: string): { isBullet: boolean; indent: number; marker: string; content: string } {
  const trimmed = line.trimStart();
  const indent = line.length - trimmed.length;
  
  // Bullet patterns
  const bulletMatch = trimmed.match(/^([-*•>▪◦])\s+(.*)$/);
  if (bulletMatch) {
    return { isBullet: true, indent, marker: bulletMatch[1], content: bulletMatch[2] };
  }
  
  // Numbered list patterns
  const numberedMatch = trimmed.match(/^(\d+[.):]|\(\d+\)|[a-zA-Z][.):])\s+(.*)$/);
  if (numberedMatch) {
    return { isBullet: true, indent, marker: numberedMatch[1], content: numberedMatch[2] };
  }
  
  return { isBullet: false, indent: 0, marker: '', content: line };
}

// Group lines by type (list vs paragraph)
function groupLinesByType(lines: string[]): Array<{ type: 'paragraph' | 'list'; lines: string[] }> {
  const groups: Array<{ type: 'paragraph' | 'list'; lines: string[] }> = [];
  let currentGroup: { type: 'paragraph' | 'list'; lines: string[] } | null = null;
  
  for (const line of lines) {
    if (line.trim() === '') continue;
    
    const { isBullet } = parseBulletLine(line);
    const lineType = isBullet ? 'list' : 'paragraph';
    
    if (!currentGroup || currentGroup.type !== lineType) {
      if (currentGroup) groups.push(currentGroup);
      currentGroup = { type: lineType, lines: [line] };
    } else {
      currentGroup.lines.push(line);
    }
  }
  
  if (currentGroup) groups.push(currentGroup);
  return groups;
}

// Render a list item
function ListItem({ line, isSmall = false }: { line: string; isSmall?: boolean }) {
  const { marker, content, indent } = parseBulletLine(line);
  const textSize = isSmall ? 'text-xs' : 'text-sm';
  
  return (
    <li 
      className={`${textSize} text-foreground leading-relaxed flex gap-2`}
      style={{ marginLeft: `${Math.min(indent * 4, 32)}px` }}
    >
      <span className="text-muted-foreground flex-shrink-0 min-w-[1.25rem]">{marker}</span>
      <span className="flex-1"><RichTextSpan text={content} /></span>
    </li>
  );
}

// Main formatted content renderer
function FormattedContent({ content, isSmall = false }: { content: string; isSmall?: boolean }) {
  const paragraphs = smartParagraph(content);
  const textSize = isSmall ? 'text-xs' : 'text-sm';
  
  return (
    <div className="space-y-4">
      {paragraphs.map((paragraphLines, pIndex) => {
        const groups = groupLinesByType(paragraphLines);
        
        return (
          <div key={pIndex} className="space-y-2">
            {groups.map((group, gIndex) => {
              if (group.type === 'list') {
                return (
                  <ul key={gIndex} className="space-y-1.5 my-2">
                    {group.lines.map((line, lIndex) => (
                      <ListItem key={lIndex} line={line} isSmall={isSmall} />
                    ))}
                  </ul>
                );
              }
              
              // Regular paragraph - join lines intelligently
              const isMultiLine = group.lines.length > 1;
              const shouldJoinLines = group.lines.every(l => l.trim().length < 80);
              
              return (
                <p key={gIndex} className={`${textSize} text-foreground leading-relaxed`}>
                  {shouldJoinLines && isMultiLine ? (
                    // Join short lines into flowing text
                    <RichTextSpan text={group.lines.map(l => l.trim()).join(' ')} />
                  ) : (
                    // Keep line breaks for longer content
                    group.lines.map((line, lIndex) => (
                      <React.Fragment key={lIndex}>
                        <RichTextSpan text={line} />
                        {lIndex < group.lines.length - 1 && <br />}
                      </React.Fragment>
                    ))
                  )}
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export default function RichTextBody({ content, className = '' }: RichTextBodyProps) {
  const { currentMessage, threadHistory } = parseEmailThread(content);
  
  return (
    <div className={className}>
      <FormattedContent content={currentMessage} />
      
      {threadHistory && (
        <details className="mt-6 border-t pt-4">
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground flex items-center gap-2">
            <span className="font-medium">Show previous messages in thread</span>
          </summary>
          <div className="mt-4 pl-4 border-l-2 border-muted text-muted-foreground">
            <FormattedContent content={threadHistory} isSmall />
          </div>
        </details>
      )}
    </div>
  );
}

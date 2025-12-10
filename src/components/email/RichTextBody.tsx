import React from 'react';

interface RichTextBodyProps {
  content: string;
  className?: string;
}

// Patterns for detecting various types of content
const patterns = {
  // URLs - http, https, www
  url: /(https?:\/\/[^\s<>"{}|\\^`[\]]+|www\.[^\s<>"{}|\\^`[\]]+)/gi,
  // Email addresses
  email: /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi,
  // Phone numbers - various formats
  phone: /(\+?[\d\s-]{10,}|\(\d{2,4}\)\s*[\d\s-]{6,}|\d{4}\s*\d{3}\s*\d{3})/g,
};

// Parse text and return array of text/link segments
function parseRichText(text: string): Array<{ type: 'text' | 'url' | 'email' | 'phone'; value: string }> {
  if (!text) return [];
  
  const segments: Array<{ type: 'text' | 'url' | 'email' | 'phone'; value: string; index: number }> = [];
  
  // Find all URLs
  let match;
  while ((match = patterns.url.exec(text)) !== null) {
    segments.push({ type: 'url', value: match[0], index: match.index });
  }
  
  // Find all emails (reset regex)
  patterns.email.lastIndex = 0;
  while ((match = patterns.email.exec(text)) !== null) {
    // Don't add if it overlaps with a URL
    const overlaps = segments.some(s => 
      (match!.index >= s.index && match!.index < s.index + s.value.length) ||
      (s.index >= match!.index && s.index < match!.index + match![0].length)
    );
    if (!overlaps) {
      segments.push({ type: 'email', value: match[0], index: match.index });
    }
  }
  
  // Find all phone numbers (reset regex)
  patterns.phone.lastIndex = 0;
  while ((match = patterns.phone.exec(text)) !== null) {
    const cleanedPhone = match[0].replace(/[\s-]/g, '');
    // Only consider if it looks like a real phone number (at least 8 digits)
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
  
  // Sort segments by index
  segments.sort((a, b) => a.index - b.index);
  
  // Build result with text segments between matches
  const result: Array<{ type: 'text' | 'url' | 'email' | 'phone'; value: string }> = [];
  let lastIndex = 0;
  
  for (const segment of segments) {
    // Add text before this segment
    if (segment.index > lastIndex) {
      result.push({ type: 'text', value: text.slice(lastIndex, segment.index) });
    }
    result.push({ type: segment.type, value: segment.value });
    lastIndex = segment.index + segment.value.length;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    result.push({ type: 'text', value: text.slice(lastIndex) });
  }
  
  return result;
}

// Render a line with rich text elements
function RichTextLine({ text }: { text: string }) {
  const segments = parseRichText(text);
  
  if (segments.length === 0) {
    return <>{text}</>;
  }
  
  return (
    <>
      {segments.map((segment, i) => {
        switch (segment.type) {
          case 'url':
            const href = segment.value.startsWith('http') ? segment.value : `https://${segment.value}`;
            return (
              <a
                key={i}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline break-all"
              >
                {segment.value}
              </a>
            );
          case 'email':
            return (
              <a
                key={i}
                href={`mailto:${segment.value}`}
                className="text-primary hover:underline"
              >
                {segment.value}
              </a>
            );
          case 'phone':
            const phoneDigits = segment.value.replace(/\D/g, '');
            return (
              <a
                key={i}
                href={`tel:${phoneDigits}`}
                className="text-primary hover:underline"
              >
                {segment.value}
              </a>
            );
          default:
            return <span key={i}>{segment.value}</span>;
        }
      })}
    </>
  );
}

// Helper to detect email thread separators
const threadSeparators = [
  /^-{3,}\s*Original Message\s*-{3,}/i,
  /^-{3,}\s*Forwarded message\s*-{3,}/i,
  /^On .+ wrote:$/,
  /^From:\s*.+$/m,
  /^>{1,3}\s*/,
  /^Sent:\s*.+$/,
  /^To:\s*.+$/,
  /^Subject:\s*.+$/,
];

// Check if a line is a thread separator or quoted content
function isThreadContent(line: string): boolean {
  const trimmed = line.trim();
  return threadSeparators.some(pattern => pattern.test(trimmed)) || trimmed.startsWith('>');
}

// Parse email body to separate current message from thread history
function parseEmailThread(body: string): { currentMessage: string; threadHistory: string | null } {
  if (!body) return { currentMessage: '', threadHistory: null };
  
  const lines = body.split('\n');
  let splitIndex = -1;
  
  // Find where the thread history begins
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Check for common thread start patterns
    if (
      /^-{3,}\s*Original Message\s*-{3,}/i.test(line) ||
      /^-{3,}\s*Forwarded message\s*-{3,}/i.test(line) ||
      /^On .+ wrote:$/.test(line) ||
      (/^From:\s*.+/.test(line) && i > 2) // From: at the start is okay, but later suggests reply
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

// Format email body with proper paragraphs
function formatEmailBody(body: string): string {
  if (!body) return '';
  
  return body
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Detect if a line is a bullet point or list item
function isBulletLine(line: string): { isBullet: boolean; indent: number; marker: string; content: string } {
  const trimmed = line.trimStart();
  const indent = line.length - trimmed.length;
  
  // Bullet patterns: -, *, •, >, ▪, ◦
  const bulletMatch = trimmed.match(/^([-*•>▪◦])\s+(.*)$/);
  if (bulletMatch) {
    return { isBullet: true, indent, marker: bulletMatch[1], content: bulletMatch[2] };
  }
  
  // Numbered list patterns: 1., 1), (1), a., a)
  const numberedMatch = trimmed.match(/^(\d+[.):]|\(\d+\)|[a-zA-Z][.):])\s+(.*)$/);
  if (numberedMatch) {
    return { isBullet: true, indent, marker: numberedMatch[1], content: numberedMatch[2] };
  }
  
  return { isBullet: false, indent: 0, marker: '', content: line };
}

// Group consecutive bullet lines together
function groupLines(lines: string[]): Array<{ type: 'paragraph' | 'list'; lines: string[] }> {
  const groups: Array<{ type: 'paragraph' | 'list'; lines: string[] }> = [];
  let currentGroup: { type: 'paragraph' | 'list'; lines: string[] } | null = null;
  
  for (const line of lines) {
    const { isBullet } = isBulletLine(line);
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

// Render a list item with proper styling
function ListItem({ line, isSmall = false }: { line: string; isSmall?: boolean }) {
  const { marker, content, indent } = isBulletLine(line);
  const textSize = isSmall ? 'text-xs' : 'text-sm';
  const markerColor = isSmall ? 'text-muted-foreground' : 'text-muted-foreground';
  
  return (
    <li 
      className={`${textSize} text-foreground leading-relaxed flex gap-2`}
      style={{ marginLeft: `${Math.min(indent * 4, 32)}px` }}
    >
      <span className={`${markerColor} flex-shrink-0 min-w-[1.25rem]`}>{marker}</span>
      <span className="flex-1"><RichTextLine text={content} /></span>
    </li>
  );
}

// Render formatted content (paragraphs and lists)
function FormattedContent({ content, isSmall = false }: { content: string; isSmall?: boolean }) {
  const formattedBody = formatEmailBody(content);
  const paragraphs = formattedBody.split(/\n\n+/);
  const textSize = isSmall ? 'text-xs' : 'text-sm';
  
  return (
    <div className="space-y-4">
      {paragraphs.map((paragraph, pIndex) => {
        const lines = paragraph.split('\n').filter(l => l.trim() !== '');
        const groups = groupLines(lines);
        
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
              
              // Regular paragraph
              return (
                <p key={gIndex} className={`${textSize} text-foreground leading-relaxed`}>
                  {group.lines.map((line, lIndex) => (
                    <React.Fragment key={lIndex}>
                      <RichTextLine text={line} />
                      {lIndex < group.lines.length - 1 && <br />}
                    </React.Fragment>
                  ))}
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
      {/* Current message */}
      <FormattedContent content={currentMessage} />
      
      {/* Thread history (collapsed by default) */}
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

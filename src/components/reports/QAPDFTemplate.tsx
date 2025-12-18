import React, { forwardRef } from 'react';

interface QAPDFTemplateProps {
  title: string;
  content: string;
  reportNames: string[];
  generatedAt: string;
}

export const QAPDFTemplate = forwardRef<HTMLDivElement, QAPDFTemplateProps>(
  ({ title, content, reportNames, generatedAt }, ref) => {
    // Split content into pages (approx 2400 chars per page for better formatting)
    const contentPages = splitContentIntoPages(content, 2400);

    return (
      <div ref={ref} className="qa-pdf-export" style={{ width: '794px' }}>
        {/* Cover Page */}
        <div
          style={{
            width: '794px',
            height: '1123px',
            backgroundColor: '#0a0a0a',
            position: 'relative',
            overflow: 'hidden',
            pageBreakAfter: 'always',
          }}
        >
          {/* Top-left diagonal accent */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '200px',
              height: '200px',
            }}
          >
            <svg viewBox="0 0 200 200" style={{ width: '100%', height: '100%' }}>
              <polygon points="0,0 200,0 0,200" fill="#2d2d2d" />
              <line x1="0" y1="180" x2="180" y2="0" stroke="#c9a227" strokeWidth="2" />
              <polygon points="40,0 90,0 0,90 0,40" fill="#1a1a1a" />
              <line x1="40" y1="0" x2="0" y2="40" stroke="#c9a227" strokeWidth="1.5" />
            </svg>
          </div>

          {/* Top-right diagonal accent */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: '200px',
              height: '200px',
            }}
          >
            <svg viewBox="0 0 200 200" style={{ width: '100%', height: '100%' }}>
              <polygon points="200,0 200,200 0,0" fill="#2d2d2d" />
              <line x1="20" y1="0" x2="200" y2="180" stroke="#c9a227" strokeWidth="2" />
            </svg>
          </div>

          {/* Bottom-right diagonal accent */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              width: '200px',
              height: '200px',
            }}
          >
            <svg viewBox="0 0 200 200" style={{ width: '100%', height: '100%' }}>
              <polygon points="200,200 0,200 200,0" fill="#2d2d2d" />
              <line x1="200" y1="20" x2="20" y2="200" stroke="#c9a227" strokeWidth="2" />
              <polygon points="200,110 200,160 160,200 110,200" fill="#1a1a1a" />
              <line x1="160" y1="200" x2="200" y2="160" stroke="#c9a227" strokeWidth="1.5" />
            </svg>
          </div>

          {/* Bottom-left diagonal accent */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              width: '200px',
              height: '200px',
            }}
          >
            <svg viewBox="0 0 200 200" style={{ width: '100%', height: '100%' }}>
              <polygon points="0,200 0,0 200,200" fill="#2d2d2d" />
              <line x1="0" y1="20" x2="180" y2="200" stroke="#c9a227" strokeWidth="2" />
            </svg>
          </div>

          {/* Logo/Icon */}
          <div
            style={{
              position: 'absolute',
              top: '200px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '180px',
              height: '180px',
            }}
          >
            <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%' }}>
              {/* Stylized N logo */}
              <defs>
                <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#c9a227" />
                  <stop offset="50%" stopColor="#e8d59d" />
                  <stop offset="100%" stopColor="#8b7355" />
                </linearGradient>
              </defs>
              <path
                d="M25 85 L25 15 L35 15 L35 55 L65 15 L75 15 L75 85 L65 85 L65 45 L35 85 Z"
                fill="url(#goldGradient)"
                stroke="#c9a227"
                strokeWidth="0.5"
              />
            </svg>
          </div>

          {/* Company Name */}
          <div
            style={{
              position: 'absolute',
              top: '420px',
              left: '50%',
              transform: 'translateX(-50%)',
              textAlign: 'center',
              width: '100%',
            }}
          >
            <h1
              style={{
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontSize: '42px',
                color: '#c9a227',
                fontWeight: 'normal',
                letterSpacing: '4px',
                margin: 0,
                lineHeight: 1.2,
              }}
            >
              NAIDU PROPERTY
            </h1>
            <h1
              style={{
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontSize: '42px',
                color: '#c9a227',
                fontWeight: 'normal',
                letterSpacing: '4px',
                margin: '10px 0 0 0',
                lineHeight: 1.2,
              }}
            >
              CONSULTING SERVICES
            </h1>
          </div>

          {/* Tagline */}
          <div
            style={{
              position: 'absolute',
              top: '540px',
              left: '50%',
              transform: 'translateX(-50%)',
              textAlign: 'center',
              width: '100%',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '20px',
              }}
            >
              <div style={{ width: '120px', height: '2px', backgroundColor: '#c9a227' }} />
              <div
                style={{
                  width: '12px',
                  height: '12px',
                  backgroundColor: '#c9a227',
                  transform: 'rotate(45deg)',
                }}
              />
              <div style={{ width: '120px', height: '2px', backgroundColor: '#c9a227' }} />
            </div>
            <p
              style={{
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontSize: '16px',
                color: '#c9a227',
                letterSpacing: '3px',
                marginTop: '20px',
              }}
            >
              YOUR DEDICATED PROPERTY PARTNER
            </p>
          </div>

          {/* Document Title */}
          <div
            style={{
              position: 'absolute',
              top: '680px',
              left: '50%',
              transform: 'translateX(-50%)',
              textAlign: 'center',
              width: '80%',
            }}
          >
            <h2
              style={{
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontSize: '26px',
                color: '#ffffff',
                fontWeight: 'normal',
                marginBottom: '20px',
                letterSpacing: '1px',
              }}
            >
              {title}
            </h2>
            {reportNames.length > 0 && (
              <p
                style={{
                  fontFamily: 'Georgia, "Times New Roman", serif',
                  fontSize: '14px',
                  color: '#888888',
                  marginTop: '10px',
                }}
              >
                Based on: {reportNames.join(', ')}
              </p>
            )}
            <p
              style={{
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontSize: '12px',
                color: '#666666',
                marginTop: '30px',
              }}
            >
              Generated: {generatedAt}
            </p>
          </div>
        </div>

        {/* Content Pages */}
        {contentPages.map((pageContent, pageIndex) => (
          <ContentPage
            key={pageIndex}
            content={pageContent}
            pageNumber={pageIndex + 2}
            totalPages={contentPages.length + 1}
            isLastPage={pageIndex === contentPages.length - 1}
          />
        ))}
      </div>
    );
  }
);

QAPDFTemplate.displayName = 'QAPDFTemplate';

interface ContentPageProps {
  content: string;
  pageNumber: number;
  totalPages: number;
  isLastPage: boolean;
}

const ContentPage: React.FC<ContentPageProps> = ({ content, pageNumber, totalPages, isLastPage }) => {
  // Parse markdown-like content for better formatting
  const formattedContent = formatContent(content);

  return (
    <div
      style={{
        width: '794px',
        height: '1123px',
        backgroundColor: '#ffffff',
        position: 'relative',
        overflow: 'hidden',
        pageBreakAfter: 'always',
      }}
    >
      {/* Top-left corner accent */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '120px',
          height: '120px',
        }}
      >
        <svg viewBox="0 0 120 120" style={{ width: '100%', height: '100%' }}>
          <polygon points="0,0 120,0 0,120" fill="#2d2d2d" />
          <line x1="0" y1="100" x2="100" y2="0" stroke="#c9a227" strokeWidth="1.5" />
          <polygon points="25,0 50,0 0,50 0,25" fill="#1a1a1a" />
          <line x1="25" y1="0" x2="0" y2="25" stroke="#c9a227" strokeWidth="1" />
        </svg>
      </div>

      {/* Bottom-right corner accent */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          right: 0,
          width: '120px',
          height: '120px',
        }}
      >
        <svg viewBox="0 0 120 120" style={{ width: '100%', height: '100%' }}>
          <polygon points="120,120 0,120 120,0" fill="#2d2d2d" />
          <line x1="120" y1="20" x2="20" y2="120" stroke="#c9a227" strokeWidth="1.5" />
          <polygon points="120,70 120,95 95,120 70,120" fill="#1a1a1a" />
          <line x1="95" y1="120" x2="120" y2="95" stroke="#c9a227" strokeWidth="1" />
        </svg>
      </div>

      {/* Content Area */}
      <div
        style={{
          padding: '80px 60px 100px 60px',
          height: '943px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize: '11.5px',
            lineHeight: '1.7',
            color: '#1a1a1a',
          }}
          dangerouslySetInnerHTML={{ __html: formattedContent }}
        />
      </div>

      {/* Footer */}
      <div
        style={{
          position: 'absolute',
          bottom: '30px',
          left: '60px',
          right: '60px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: '1px solid #e5e7eb',
          paddingTop: '15px',
        }}
      >
        <span style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '10px', color: '#888888' }}>
          NPC Services | npcservices.com.au
        </span>
        <span style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '10px', color: '#888888' }}>
          Page {pageNumber} of {totalPages}
        </span>
      </div>

      {/* Contact Info on Last Page */}
      {isLastPage && (
        <div
          style={{
            position: 'absolute',
            bottom: '140px',
            left: '60px',
            right: '60px',
            borderTop: '2px solid #c9a227',
            paddingTop: '20px',
          }}
        >
          <p
            style={{
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontSize: '11px',
              color: '#666666',
              textAlign: 'center',
              margin: 0,
            }}
          >
            <strong style={{ color: '#1a1a1a' }}>Contact NPC Services</strong>
            <br />
            Phone: 0433 005 110 | Email: admin@npcservices.com.au | Website: npcservices.com.au
          </p>
          <p
            style={{
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontSize: '9px',
              color: '#999999',
              textAlign: 'center',
              marginTop: '15px',
              fontStyle: 'italic',
            }}
          >
            Disclaimer: This summary is provided for informational purposes only and does not constitute financial advice.
            Please consult with a qualified professional before making any investment decisions.
          </p>
        </div>
      )}
    </div>
  );
};

// Helper function to format content with proper typography
function formatContent(content: string): string {
  let formatted = content;

  // Escape HTML first
  formatted = formatted
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Headers - ## Header becomes styled h3
  formatted = formatted.replace(
    /^##\s+(.+)$/gm,
    '<h3 style="font-family: Georgia, serif; font-size: 16px; font-weight: 600; color: #1a1a1a; margin: 20px 0 12px 0; padding-bottom: 6px; border-bottom: 1px solid #c9a227;">$1</h3>'
  );

  // Headers - # Header becomes styled h2
  formatted = formatted.replace(
    /^#\s+(.+)$/gm,
    '<h2 style="font-family: Georgia, serif; font-size: 18px; font-weight: 600; color: #1a1a1a; margin: 24px 0 14px 0; padding-bottom: 8px; border-bottom: 2px solid #c9a227;">$1</h2>'
  );

  // Bold text - **text** or __text__
  formatted = formatted.replace(
    /\*\*(.+?)\*\*/g,
    '<strong style="font-weight: 600; color: #1a1a1a;">$1</strong>'
  );
  formatted = formatted.replace(
    /__(.+?)__/g,
    '<strong style="font-weight: 600; color: #1a1a1a;">$1</strong>'
  );

  // Italic text - *text* or _text_
  formatted = formatted.replace(
    /\*([^*]+)\*/g,
    '<em style="font-style: italic;">$1</em>'
  );
  formatted = formatted.replace(
    /_([^_]+)_/g,
    '<em style="font-style: italic;">$1</em>'
  );

  // Bullet points - convert • or - or * at start of line
  formatted = formatted.replace(
    /^[•\-\*]\s+(.+)$/gm,
    '<div style="display: flex; margin: 6px 0; padding-left: 8px;"><span style="color: #c9a227; margin-right: 10px; font-weight: bold;">•</span><span style="flex: 1;">$1</span></div>'
  );

  // Numbered lists
  formatted = formatted.replace(
    /^(\d+)\.\s+(.+)$/gm,
    '<div style="display: flex; margin: 6px 0; padding-left: 8px;"><span style="color: #c9a227; margin-right: 10px; font-weight: 600; min-width: 20px;">$1.</span><span style="flex: 1;">$2</span></div>'
  );

  // Tables - simple markdown table support
  formatted = formatTables(formatted);

  // Line breaks - double newline becomes paragraph break
  formatted = formatted.replace(/\n\n+/g, '</p><p style="margin: 12px 0;">');

  // Single newlines within paragraphs
  formatted = formatted.replace(/\n/g, '<br/>');

  // Wrap in paragraph tags
  formatted = '<p style="margin: 12px 0;">' + formatted + '</p>';

  // Clean up empty paragraphs
  formatted = formatted.replace(/<p style="margin: 12px 0;"><\/p>/g, '');

  return formatted;
}

// Helper function to format markdown tables
function formatTables(content: string): string {
  const tableRegex = /\|(.+)\|\n\|[-:\s|]+\|\n((?:\|.+\|\n?)+)/g;
  
  return content.replace(tableRegex, (match, headerRow, bodyRows) => {
    const headers = headerRow.split('|').filter((h: string) => h.trim());
    const rows = bodyRows.trim().split('\n').map((row: string) => 
      row.split('|').filter((c: string) => c.trim())
    );

    let tableHtml = '<table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 10.5px;">';
    
    // Header row
    tableHtml += '<thead><tr>';
    headers.forEach((header: string) => {
      tableHtml += `<th style="background: #f8f9fa; border: 1px solid #e5e7eb; padding: 10px 12px; text-align: left; font-weight: 600; color: #1a1a1a;">${header.trim()}</th>`;
    });
    tableHtml += '</tr></thead>';

    // Body rows
    tableHtml += '<tbody>';
    rows.forEach((row: string[], idx: number) => {
      const bgColor = idx % 2 === 0 ? '#ffffff' : '#fafafa';
      tableHtml += '<tr>';
      row.forEach((cell: string) => {
        tableHtml += `<td style="border: 1px solid #e5e7eb; padding: 8px 12px; background: ${bgColor};">${cell.trim()}</td>`;
      });
      tableHtml += '</tr>';
    });
    tableHtml += '</tbody></table>';

    return tableHtml;
  });
}

// Helper function to split content into pages
function splitContentIntoPages(content: string, charsPerPage: number): string[] {
  const pages: string[] = [];
  const lines = content.split('\n');
  let currentPage = '';
  let currentLength = 0;

  for (const line of lines) {
    const lineLength = line.length + 1; // +1 for newline

    // Check if this is a header line - try to keep headers with following content
    const isHeader = line.startsWith('#') || line.startsWith('##');
    
    if (currentLength + lineLength > charsPerPage && currentPage.trim()) {
      // Don't break right after a header
      if (!isHeader) {
        pages.push(currentPage.trim());
        currentPage = line + '\n';
        currentLength = lineLength;
        continue;
      }
    }
    
    currentPage += line + '\n';
    currentLength += lineLength;
  }

  if (currentPage.trim()) {
    pages.push(currentPage.trim());
  }

  return pages.length > 0 ? pages : [''];
}

export default QAPDFTemplate;

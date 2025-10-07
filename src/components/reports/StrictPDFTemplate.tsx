import { forwardRef, useEffect, useState } from 'react';

interface StrictPDFTemplateProps {
  suburb: string;
  state: string;
  profileContent: string;
  marketData: {
    medianPrice: string;
    weeklyRent: string;
    rentalYield: string;
  };
  performanceContent: string;
  demographicsContent: string;
  infrastructureContent: string;
  investmentInsights: string;
  investmentScore?: number;
}

export const StrictPDFTemplate = forwardRef<HTMLDivElement, StrictPDFTemplateProps>(
  ({ suburb, state, profileContent, marketData, performanceContent, demographicsContent, infrastructureContent, investmentInsights, investmentScore }, ref) => {
    
    const [templateHTML, setTemplateHTML] = useState<string>('');

    useEffect(() => {
      // Load the HTML template
      fetch('/templates/suburb-snapshot-template.html')
        .then(response => response.text())
        .then(html => {
          // Replace dynamic content placeholders
          let modifiedHTML = html;
          
          // Replace suburb name
          modifiedHTML = modifiedHTML.replace(/NORTH ROTHBURY/gi, suburb.toUpperCase());
          modifiedHTML = modifiedHTML.replace(/NORTH-ROTHBURY/gi, suburb.toUpperCase().replace(/ /g, '-'));
          modifiedHTML = modifiedHTML.replace(/North Rothbury/gi, suburb);
          
          // Replace state
          modifiedHTML = modifiedHTML.replace(/NSW/g, state.toUpperCase());
          
          setTemplateHTML(modifiedHTML);
        })
        .catch(error => {
          console.error('Error loading template:', error);
        });
    }, [suburb, state]);

    const cleanText = (text: string) => {
      return text
        .replace(/^[*#]+\s*/gm, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/__(.*?)__/g, '$1')
        .trim();
    };

    const formatContent = (content: string, maxLines = 25) => {
      const lines = content.split('\n').filter(line => line.trim()).slice(0, maxLines);
      return lines.map((line, i) => (
        <p key={i} style={{ 
          marginBottom: '6pt', 
          fontSize: '9pt', 
          lineHeight: '1.4',
          color: '#333',
          fontFamily: 'Arial, sans-serif'
        }}>
          {cleanText(line)}
        </p>
      ));
    };

    if (!templateHTML) {
      return <div ref={ref} style={{ padding: '20pt', fontSize: '14pt' }}>Loading template...</div>;
    }

    return (
      <div ref={ref} style={{ width: '210mm', background: 'white' }}>
        {/* Render the cover page from template */}
        <div 
          className="pdf-page" 
          dangerouslySetInnerHTML={{ __html: templateHTML.split('<div id="pf')[1]?.split('</div>')[0] || '' }}
          style={{ pageBreakAfter: 'always' }}
        />

        {/* PAGE 2: Location Profile */}
        <div className="pdf-page" style={{
          width: '210mm',
          height: '297mm',
          background: '#FFFFFF',
          padding: '25pt',
          pageBreakAfter: 'always',
          fontFamily: 'Arial, sans-serif'
        }}>
          {/* Header with NPC branding colors */}
          <div style={{ 
            borderBottom: '2pt solid #C5A572', 
            paddingBottom: '12pt',
            marginBottom: '15pt',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end'
          }}>
            <div>
              <h1 style={{ 
                fontSize: '20pt', 
                color: '#1E3A5F',
                margin: 0,
                fontWeight: 'bold',
                fontFamily: 'Arial, sans-serif'
              }}>
                LOCATION PROFILE
              </h1>
            </div>
            <div style={{ 
              fontSize: '8pt', 
              color: '#666', 
              textAlign: 'right',
              lineHeight: '1.3'
            }}>
              <div style={{ fontWeight: 'bold', color: '#1E3A5F' }}>{suburb}, {state}</div>
              <div>NPC Services</div>
            </div>
          </div>

          {/* Content */}
          <div style={{ fontSize: '9pt', color: '#333', lineHeight: '1.5' }}>
            {formatContent(profileContent)}
          </div>

          {/* Market Data Highlights with NPC colors */}
          {marketData.medianPrice !== 'N/A' && (
            <div style={{ marginTop: '20pt' }}>
              <h2 style={{ 
                fontSize: '12pt', 
                color: '#1E3A5F', 
                marginBottom: '10pt', 
                borderLeft: '3pt solid #C5A572', 
                paddingLeft: '8pt',
                fontWeight: 'bold'
              }}>
                KEY MARKET METRICS
              </h2>
              <div style={{ display: 'flex', gap: '10pt', flexWrap: 'wrap' }}>
                <div style={{ 
                  flex: '1', 
                  minWidth: '120pt',
                  background: '#F5F5F5',
                  padding: '12pt',
                  border: '1pt solid #E0E0E0'
                }}>
                  <div style={{ fontSize: '7pt', color: '#666', marginBottom: '4pt', letterSpacing: '0.5pt' }}>MEDIAN PRICE</div>
                  <div style={{ fontSize: '16pt', fontWeight: 'bold', color: '#1E3A5F' }}>{marketData.medianPrice}</div>
                </div>
                <div style={{ 
                  flex: '1', 
                  minWidth: '120pt',
                  background: '#F5F5F5',
                  padding: '12pt',
                  border: '1pt solid #E0E0E0'
                }}>
                  <div style={{ fontSize: '7pt', color: '#666', marginBottom: '4pt', letterSpacing: '0.5pt' }}>WEEKLY RENT</div>
                  <div style={{ fontSize: '16pt', fontWeight: 'bold', color: '#1E3A5F' }}>{marketData.weeklyRent}</div>
                </div>
                <div style={{ 
                  flex: '1', 
                  minWidth: '120pt',
                  background: '#F5F5F5',
                  padding: '12pt',
                  border: '1pt solid #E0E0E0'
                }}>
                  <div style={{ fontSize: '7pt', color: '#666', marginBottom: '4pt', letterSpacing: '0.5pt' }}>RENTAL YIELD</div>
                  <div style={{ fontSize: '16pt', fontWeight: 'bold', color: '#C5A572' }}>{marketData.rentalYield}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* PAGE 3: Market Performance */}
        <div className="pdf-page" style={{
          width: '210mm',
          height: '297mm',
          background: '#FFFFFF',
          padding: '25pt',
          pageBreakAfter: 'always',
          fontFamily: 'Arial, sans-serif'
        }}>
          <div style={{ 
            borderBottom: '2pt solid #C5A572', 
            paddingBottom: '12pt',
            marginBottom: '15pt',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end'
          }}>
            <h1 style={{ 
              fontSize: '20pt', 
              color: '#1E3A5F',
              margin: 0,
              fontWeight: 'bold'
            }}>
              MARKET PERFORMANCE
            </h1>
            <div style={{ fontSize: '8pt', color: '#666', textAlign: 'right', lineHeight: '1.3' }}>
              <div style={{ fontWeight: 'bold', color: '#1E3A5F' }}>{suburb}, {state}</div>
              <div>NPC Services</div>
            </div>
          </div>

          <div style={{ fontSize: '9pt', color: '#333', lineHeight: '1.5' }}>
            {formatContent(performanceContent)}
          </div>
        </div>

        {/* PAGE 4: Demographics */}
        <div className="pdf-page" style={{
          width: '210mm',
          height: '297mm',
          background: '#FFFFFF',
          padding: '25pt',
          pageBreakAfter: 'always',
          fontFamily: 'Arial, sans-serif'
        }}>
          <div style={{ 
            borderBottom: '2pt solid #C5A572', 
            paddingBottom: '12pt',
            marginBottom: '15pt',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end'
          }}>
            <h1 style={{ 
              fontSize: '20pt', 
              color: '#1E3A5F',
              margin: 0,
              fontWeight: 'bold'
            }}>
              DEMOGRAPHICS & DEMAND
            </h1>
            <div style={{ fontSize: '8pt', color: '#666', textAlign: 'right', lineHeight: '1.3' }}>
              <div style={{ fontWeight: 'bold', color: '#1E3A5F' }}>{suburb}, {state}</div>
              <div>NPC Services</div>
            </div>
          </div>

          <div style={{ fontSize: '9pt', color: '#333', lineHeight: '1.5' }}>
            {formatContent(demographicsContent)}
          </div>
        </div>

        {/* PAGE 5: Infrastructure */}
        <div className="pdf-page" style={{
          width: '210mm',
          height: '297mm',
          background: '#FFFFFF',
          padding: '25pt',
          pageBreakAfter: 'always',
          fontFamily: 'Arial, sans-serif'
        }}>
          <div style={{ 
            borderBottom: '2pt solid #C5A572', 
            paddingBottom: '12pt',
            marginBottom: '15pt',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end'
          }}>
            <h1 style={{ 
              fontSize: '20pt', 
              color: '#1E3A5F',
              margin: 0,
              fontWeight: 'bold'
            }}>
              INFRASTRUCTURE & AMENITIES
            </h1>
            <div style={{ fontSize: '8pt', color: '#666', textAlign: 'right', lineHeight: '1.3' }}>
              <div style={{ fontWeight: 'bold', color: '#1E3A5F' }}>{suburb}, {state}</div>
              <div>NPC Services</div>
            </div>
          </div>

          <div style={{ fontSize: '9pt', color: '#333', lineHeight: '1.5' }}>
            {formatContent(infrastructureContent)}
          </div>
        </div>

        {/* PAGE 6: Investment Insights */}
        <div className="pdf-page" style={{
          width: '210mm',
          height: '297mm',
          background: '#FFFFFF',
          padding: '25pt',
          pageBreakAfter: 'always',
          fontFamily: 'Arial, sans-serif'
        }}>
          <div style={{ 
            borderBottom: '2pt solid #C5A572', 
            paddingBottom: '12pt',
            marginBottom: '15pt',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end'
          }}>
            <h1 style={{ 
              fontSize: '20pt', 
              color: '#1E3A5F',
              margin: 0,
              fontWeight: 'bold'
            }}>
              INVESTMENT INSIGHTS
            </h1>
            <div style={{ fontSize: '8pt', color: '#666', textAlign: 'right', lineHeight: '1.3' }}>
              <div style={{ fontWeight: 'bold', color: '#1E3A5F' }}>{suburb}, {state}</div>
              <div>NPC Services</div>
            </div>
          </div>

          {investmentScore && (
            <div style={{
              background: '#1E3A5F',
              padding: '15pt',
              marginBottom: '20pt',
              color: 'white',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '10pt', marginBottom: '8pt', color: '#C5A572', letterSpacing: '1pt' }}>
                OVERALL INVESTMENT SCORE
              </div>
              <div style={{ fontSize: '36pt', fontWeight: 'bold', color: '#FFFFFF' }}>
                {investmentScore}/100
              </div>
            </div>
          )}

          <div style={{ fontSize: '9pt', color: '#333', lineHeight: '1.5' }}>
            {formatContent(investmentInsights)}
          </div>
        </div>

        {/* Render the contact page from template */}
        <div 
          className="pdf-page"
          dangerouslySetInnerHTML={{ __html: templateHTML.split('<div id="pf')[templateHTML.split('<div id="pf').length - 1]?.split('</body>')[0] || '' }}
        />
      </div>
    );
  }
);

StrictPDFTemplate.displayName = 'StrictPDFTemplate';

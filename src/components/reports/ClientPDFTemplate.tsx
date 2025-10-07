import { forwardRef } from 'react';

interface ClientPDFTemplateProps {
  suburb: string;
  state: string;
  profileContent: string;
  marketData: {
    medianPrice?: string;
    weeklyRent?: string;
    rentalYield?: string;
  };
  performanceContent: string;
  demographicsContent: string;
  infrastructureContent: string;
  investmentInsights: string;
  investmentScore?: number;
}

export const ClientPDFTemplate = forwardRef<HTMLDivElement, ClientPDFTemplateProps>(
  ({ suburb, state, profileContent, marketData, performanceContent, demographicsContent, infrastructureContent, investmentInsights, investmentScore }, ref) => {
    
    const cleanText = (text: string) => {
      return text
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/`(.+?)`/g, '$1')
        .replace(/^[-*]\s+/gm, '• ')
        .replace(/^\d+\.\s+/gm, '')
        .trim();
    };

    return (
      <div ref={ref} style={{ width: '210mm', background: 'white' }}>
        {/* Page 1: Cover */}
        <div style={{
          width: '210mm',
          height: '297mm',
          background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)',
          position: 'relative',
          overflow: 'hidden',
          pageBreakAfter: 'always',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {/* Decorative curves */}
          <div style={{
            position: 'absolute',
            left: '-50px',
            top: '0',
            width: '200px',
            height: '100%',
            background: 'linear-gradient(90deg, rgba(201, 165, 90, 0.15) 0%, transparent 100%)',
            borderRadius: '0 50% 50% 0',
          }} />
          <div style={{
            position: 'absolute',
            right: '-50px',
            top: '0',
            width: '200px',
            height: '100%',
            background: 'linear-gradient(270deg, rgba(201, 165, 90, 0.15) 0%, transparent 100%)',
            borderRadius: '50% 0 0 50%',
          }} />
          
          {/* Logo */}
          <div style={{
            width: '120px',
            height: '120px',
            border: '3px solid #c9a55a',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '40px',
            background: 'rgba(201, 165, 90, 0.1)',
          }}>
            <span style={{ fontSize: '64px', color: '#c9a55a', fontFamily: 'serif', fontWeight: 'bold' }}>N</span>
          </div>

          {/* Title */}
          <h1 style={{
            fontSize: '48px',
            color: '#c9a55a',
            fontFamily: 'serif',
            fontWeight: 'bold',
            textAlign: 'center',
            margin: '0 0 20px 0',
            letterSpacing: '4px',
          }}>
            NAIDU PROPERTY<br />CONSULTING SERVICES
          </h1>

          {/* Subtitle */}
          <p style={{
            fontSize: '18px',
            color: '#ffffff',
            textAlign: 'center',
            margin: '0',
            letterSpacing: '2px',
          }}>
            YOUR DEDICATED PROPERTY PARTNER
          </p>
        </div>

        {/* Page 2: Location & Profile */}
        <div style={{
          width: '210mm',
          height: '297mm',
          background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)',
          position: 'relative',
          overflow: 'hidden',
          pageBreakAfter: 'always',
          padding: '40px 60px',
          boxSizing: 'border-box',
        }}>
          {/* Chevron pattern */}
          <div style={{
            position: 'absolute',
            left: '0',
            top: '0',
            width: '100px',
            height: '100%',
            backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 10px, rgba(201, 165, 90, 0.05) 10px, rgba(201, 165, 90, 0.05) 20px)',
            transform: 'skewY(-45deg)',
            transformOrigin: 'top left',
          }} />

          {/* Logo */}
          <div style={{
            position: 'absolute',
            right: '40px',
            top: '40px',
            width: '60px',
            height: '60px',
            border: '2px solid #c9a55a',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <span style={{ fontSize: '32px', color: '#c9a55a', fontFamily: 'serif', fontWeight: 'bold' }}>N</span>
          </div>

          {/* Header */}
          <h2 style={{
            fontSize: '42px',
            color: '#c9a55a',
            fontFamily: 'serif',
            fontWeight: 'bold',
            margin: '0 0 40px 0',
            letterSpacing: '3px',
          }}>
            SUBURB SNAPSHOT
          </h2>

          {/* Location Section */}
          <div style={{ marginBottom: '40px' }}>
            <h3 style={{
              fontSize: '24px',
              color: '#c9a55a',
              fontFamily: 'serif',
              margin: '0 0 20px 0',
              letterSpacing: '2px',
            }}>
              LOCATION
            </h3>
            <p style={{ fontSize: '14px', color: '#c9a55a', margin: '0 0 10px 0', lineHeight: '1.6' }}>
              SUBURB / AREA : {suburb.toUpperCase()}
            </p>
            <p style={{ fontSize: '14px', color: '#c9a55a', margin: '0', lineHeight: '1.6' }}>
              STATE : {state.toUpperCase()}
            </p>
          </div>

          {/* Profile Section */}
          <div>
            <h3 style={{
              fontSize: '24px',
              color: '#c9a55a',
              fontFamily: 'serif',
              margin: '0 0 20px 0',
              letterSpacing: '2px',
            }}>
              PROFILE
            </h3>
            <p style={{
              fontSize: '12px',
              color: '#c9a55a',
              lineHeight: '1.8',
              margin: '0',
              textAlign: 'justify',
            }}>
              {cleanText(profileContent).substring(0, 800)}
            </p>
          </div>

          {/* Decorative curve */}
          <div style={{
            position: 'absolute',
            right: '-50px',
            bottom: '0',
            width: '200px',
            height: '400px',
            background: 'linear-gradient(270deg, rgba(201, 165, 90, 0.15) 0%, transparent 100%)',
            borderRadius: '50% 0 0 0',
          }} />
        </div>

        {/* Page 3: Property Market */}
        <div style={{
          width: '210mm',
          height: '297mm',
          background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)',
          position: 'relative',
          overflow: 'hidden',
          pageBreakAfter: 'always',
          padding: '40px 60px',
          boxSizing: 'border-box',
        }}>
          {/* Logo */}
          <div style={{
            position: 'absolute',
            right: '40px',
            top: '40px',
            width: '60px',
            height: '60px',
            border: '2px solid #c9a55a',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <span style={{ fontSize: '32px', color: '#c9a55a', fontFamily: 'serif', fontWeight: 'bold' }}>N</span>
          </div>

          <h2 style={{
            fontSize: '42px',
            color: '#c9a55a',
            fontFamily: 'serif',
            fontWeight: 'bold',
            margin: '0 0 40px 0',
            letterSpacing: '3px',
          }}>
            SUBURB SNAPSHOT
          </h2>

          <div>
            <h3 style={{
              fontSize: '24px',
              color: '#c9a55a',
              fontFamily: 'serif',
              margin: '0 0 30px 0',
              letterSpacing: '2px',
            }}>
              PROPERTY MARKET
            </h3>

            {/* Market data table */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '12px 20px',
                borderBottom: '1px solid rgba(201, 165, 90, 0.3)',
              }}>
                <span style={{ fontSize: '14px', color: '#c9a55a', fontWeight: 'bold' }}>MEDIAN HOUSE PRICE</span>
                <span style={{ fontSize: '14px', color: '#c9a55a' }}>{marketData.medianPrice || 'N/A'}</span>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '12px 20px',
                borderBottom: '1px solid rgba(201, 165, 90, 0.3)',
              }}>
                <span style={{ fontSize: '14px', color: '#c9a55a', fontWeight: 'bold' }}>MEDIAN WEEKLY RENT</span>
                <span style={{ fontSize: '14px', color: '#c9a55a' }}>{marketData.weeklyRent || 'N/A'}</span>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '12px 20px',
              }}>
                <span style={{ fontSize: '14px', color: '#c9a55a', fontWeight: 'bold' }}>GROSS RENTAL YIELD</span>
                <span style={{ fontSize: '14px', color: '#c9a55a' }}>{marketData.rentalYield || 'N/A'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Page 4: Market Performance */}
        <div style={{
          width: '210mm',
          height: '297mm',
          background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)',
          position: 'relative',
          overflow: 'hidden',
          pageBreakAfter: 'always',
          padding: '40px 60px',
          boxSizing: 'border-box',
        }}>
          <div style={{
            position: 'absolute',
            right: '40px',
            top: '40px',
            width: '60px',
            height: '60px',
            border: '2px solid #c9a55a',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <span style={{ fontSize: '32px', color: '#c9a55a', fontFamily: 'serif', fontWeight: 'bold' }}>N</span>
          </div>

          <h2 style={{
            fontSize: '42px',
            color: '#c9a55a',
            fontFamily: 'serif',
            fontWeight: 'bold',
            margin: '0 0 40px 0',
            letterSpacing: '3px',
          }}>
            SUBURB SNAPSHOT
          </h2>

          <div>
            <h3 style={{
              fontSize: '24px',
              color: '#c9a55a',
              fontFamily: 'serif',
              margin: '0 0 20px 0',
              letterSpacing: '2px',
            }}>
              MARKET PERFORMANCE
            </h3>
            <div style={{
              fontSize: '12px',
              color: '#c9a55a',
              lineHeight: '2',
              whiteSpace: 'pre-wrap',
            }}>
              {cleanText(performanceContent)}
            </div>
          </div>
        </div>

        {/* Page 5: Demographics */}
        <div style={{
          width: '210mm',
          height: '297mm',
          background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)',
          position: 'relative',
          overflow: 'hidden',
          pageBreakAfter: 'always',
          padding: '40px 60px',
          boxSizing: 'border-box',
        }}>
          <div style={{
            position: 'absolute',
            right: '40px',
            top: '40px',
            width: '60px',
            height: '60px',
            border: '2px solid #c9a55a',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <span style={{ fontSize: '32px', color: '#c9a55a', fontFamily: 'serif', fontWeight: 'bold' }}>N</span>
          </div>

          <h2 style={{
            fontSize: '42px',
            color: '#c9a55a',
            fontFamily: 'serif',
            fontWeight: 'bold',
            margin: '0 0 40px 0',
            letterSpacing: '3px',
          }}>
            SUBURB SNAPSHOT
          </h2>

          <div>
            <h3 style={{
              fontSize: '24px',
              color: '#c9a55a',
              fontFamily: 'serif',
              margin: '0 0 20px 0',
              letterSpacing: '2px',
            }}>
              DEMOGRAPHICS
            </h3>
            <div style={{
              fontSize: '12px',
              color: '#c9a55a',
              lineHeight: '2',
              whiteSpace: 'pre-wrap',
            }}>
              {cleanText(demographicsContent)}
            </div>
          </div>
        </div>

        {/* Page 6: Infrastructure */}
        <div style={{
          width: '210mm',
          height: '297mm',
          background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)',
          position: 'relative',
          overflow: 'hidden',
          pageBreakAfter: 'always',
          padding: '40px 60px',
          boxSizing: 'border-box',
        }}>
          <div style={{
            position: 'absolute',
            right: '40px',
            top: '40px',
            width: '60px',
            height: '60px',
            border: '2px solid #c9a55a',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <span style={{ fontSize: '32px', color: '#c9a55a', fontFamily: 'serif', fontWeight: 'bold' }}>N</span>
          </div>

          <h2 style={{
            fontSize: '42px',
            color: '#c9a55a',
            fontFamily: 'serif',
            fontWeight: 'bold',
            margin: '0 0 40px 0',
            letterSpacing: '3px',
          }}>
            SUBURB SNAPSHOT
          </h2>

          <div>
            <h3 style={{
              fontSize: '24px',
              color: '#c9a55a',
              fontFamily: 'serif',
              margin: '0 0 20px 0',
              letterSpacing: '2px',
            }}>
              INFRASTRUCTURE & AMENITIES
            </h3>
            <div style={{
              fontSize: '12px',
              color: '#c9a55a',
              lineHeight: '2',
              whiteSpace: 'pre-wrap',
            }}>
              {cleanText(infrastructureContent)}
            </div>
          </div>
        </div>

        {/* Page 7: Investment Insights */}
        <div style={{
          width: '210mm',
          height: '297mm',
          background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)',
          position: 'relative',
          overflow: 'hidden',
          pageBreakAfter: 'always',
          padding: '40px 60px',
          boxSizing: 'border-box',
        }}>
          <div style={{
            position: 'absolute',
            right: '40px',
            top: '40px',
            width: '60px',
            height: '60px',
            border: '2px solid #c9a55a',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <span style={{ fontSize: '32px', color: '#c9a55a', fontFamily: 'serif', fontWeight: 'bold' }}>N</span>
          </div>

          <h2 style={{
            fontSize: '42px',
            color: '#c9a55a',
            fontFamily: 'serif',
            fontWeight: 'bold',
            margin: '0 0 40px 0',
            letterSpacing: '3px',
          }}>
            SUBURB SNAPSHOT
          </h2>

          <div>
            <h3 style={{
              fontSize: '24px',
              color: '#c9a55a',
              fontFamily: 'serif',
              margin: '0 0 20px 0',
              letterSpacing: '2px',
            }}>
              KEY INVESTOR INSIGHTS
            </h3>
            <div style={{
              fontSize: '12px',
              color: '#c9a55a',
              lineHeight: '2',
              whiteSpace: 'pre-wrap',
              marginBottom: '30px',
            }}>
              {cleanText(investmentInsights)}
            </div>

            {investmentScore && (
              <div style={{
                marginTop: '40px',
                padding: '20px',
                border: '2px solid #c9a55a',
                borderRadius: '8px',
                textAlign: 'center',
              }}>
                <span style={{
                  fontSize: '24px',
                  color: '#c9a55a',
                  fontFamily: 'serif',
                  fontWeight: 'bold',
                  letterSpacing: '2px',
                }}>
                  INVESTMENT SCORE: {investmentScore}/10
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Page 8: Contact */}
        <div style={{
          width: '210mm',
          height: '297mm',
          background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)',
          position: 'relative',
          overflow: 'hidden',
          padding: '60px',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}>
          <h2 style={{
            fontSize: '36px',
            color: '#c9a55a',
            fontFamily: 'serif',
            fontWeight: 'bold',
            marginBottom: '40px',
            letterSpacing: '3px',
          }}>
            CONTACT US
          </h2>

          <div style={{ marginBottom: '40px' }}>
            <p style={{ fontSize: '14px', color: '#c9a55a', margin: '0 0 10px 0' }}>
              <strong>WEBSITE:</strong> npcservices.com.au
            </p>
            <p style={{ fontSize: '14px', color: '#c9a55a', margin: '0 0 10px 0' }}>
              <strong>EMAIL:</strong> admin@npcservices.com.au
            </p>
            <p style={{ fontSize: '14px', color: '#c9a55a', margin: '0' }}>
              <strong>PHONE:</strong> 0433 005 110
            </p>
          </div>

          <p style={{
            fontSize: '9px',
            color: '#999',
            lineHeight: '1.6',
            textAlign: 'justify',
          }}>
            AS A PROFESSIONAL PROPERTY CONSULTANT & BUYERS AGENT, WE PROVIDE INFORMATION AND ADVICE BASED ON OUR EXPERTISE AND EXPERIENCE IN THE REAL ESTATE MARKET. PLEASE BE AWARE THAT THE ADVICE AND INSIGHTS OFFERED ARE FOR GENERAL INFORMATIONAL PURPOSES ONLY AND SHOULD NOT BE CONSIDERED FINANCIAL ADVICE. WHILE WE STRIVE TO ENSURE THE ACCURACY AND RELEVANCE OF THE INFORMATION PROVIDED, REAL ESTATE MARKETS ARE DYNAMIC AND SUBJECT TO CHANGE AND WE CANNOT GUARANTEE THE FUTURE PERFORMANCE OR OUTCOMES OF ANY PROPERTY INVESTMENT.
          </p>
        </div>
      </div>
    );
  }
);

ClientPDFTemplate.displayName = 'ClientPDFTemplate';

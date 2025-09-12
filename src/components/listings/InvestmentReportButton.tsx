import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { TrendingUp } from 'lucide-react';
import { InvestmentReportModal } from './InvestmentReportModal';
import { PropertyListing } from '@/lib/airtable';

interface InvestmentReportButtonProps {
  property: PropertyListing;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
}

export function InvestmentReportButton({ 
  property, 
  variant = 'outline', 
  size = 'sm' 
}: InvestmentReportButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const propertyAddress = `${property.address || ''} ${property.suburb || ''} ${property.state || ''} ${property.zipCode || ''}`.trim();

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={() => setIsModalOpen(true)}
        className="gap-2"
      >
        <TrendingUp className="h-4 w-4" />
        Investment Report
      </Button>

      <InvestmentReportModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        propertyAddress={propertyAddress}
        propertyDetails={property}
      />
    </>
  );
}
import { createContext, useContext, useState, ReactNode } from 'react';
import { useToast } from '@/hooks/use-toast';

interface SelectedReport {
  id: string;
  property_address: string;
  created_at: string;
}

interface ComparisonContextType {
  selectedReports: SelectedReport[];
  addReport: (report: SelectedReport) => void;
  removeReport: (reportId: string) => void;
  clearSelection: () => void;
  isSelected: (reportId: string) => boolean;
  canAddMore: boolean;
}

const ComparisonContext = createContext<ComparisonContextType | undefined>(undefined);

const MAX_SELECTIONS = 5;

export function ComparisonProvider({ children }: { children: ReactNode }) {
  const [selectedReports, setSelectedReports] = useState<SelectedReport[]>([]);
  const { toast } = useToast();

  const addReport = (report: SelectedReport) => {
    if (selectedReports.length >= MAX_SELECTIONS) {
      toast({
        title: "Maximum Selection Reached",
        description: `You can only compare up to ${MAX_SELECTIONS} properties at once.`,
        variant: "destructive",
      });
      return;
    }

    if (selectedReports.some(r => r.id === report.id)) {
      toast({
        title: "Already Selected",
        description: "This property is already in your comparison basket.",
      });
      return;
    }

    setSelectedReports(prev => [...prev, report]);
    toast({
      title: "Added to Comparison",
      description: `${report.property_address} added to comparison basket.`,
    });
  };

  const removeReport = (reportId: string) => {
    setSelectedReports(prev => prev.filter(r => r.id !== reportId));
    toast({
      title: "Removed from Comparison",
      description: "Property removed from comparison basket.",
    });
  };

  const clearSelection = () => {
    setSelectedReports([]);
    toast({
      title: "Selection Cleared",
      description: "All properties removed from comparison basket.",
    });
  };

  const isSelected = (reportId: string) => {
    return selectedReports.some(r => r.id === reportId);
  };

  const canAddMore = selectedReports.length < MAX_SELECTIONS;

  return (
    <ComparisonContext.Provider
      value={{
        selectedReports,
        addReport,
        removeReport,
        clearSelection,
        isSelected,
        canAddMore
      }}
    >
      {children}
    </ComparisonContext.Provider>
  );
}

export function useComparison() {
  const context = useContext(ComparisonContext);
  if (context === undefined) {
    throw new Error('useComparison must be used within a ComparisonProvider');
  }
  return context;
}

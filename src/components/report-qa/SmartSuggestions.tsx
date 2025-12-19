import { Badge } from '@/components/ui/badge';
import { Sparkles, TrendingUp, AlertTriangle, DollarSign, MapPin, BarChart3 } from 'lucide-react';

interface SmartSuggestionsProps {
  hasReports: boolean;
  isComparison: boolean;
  messageCount: number;
  onSelect: (suggestion: string) => void;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  analysis: TrendingUp,
  risk: AlertTriangle,
  financial: DollarSign,
  location: MapPin,
  comparison: BarChart3,
};

export function SmartSuggestions({ 
  hasReports, 
  isComparison, 
  messageCount,
  onSelect 
}: SmartSuggestionsProps) {
  // Generate context-aware suggestions
  const getSuggestions = () => {
    if (!hasReports) {
      return [
        { text: 'What can you help me with?', icon: 'analysis' },
        { text: 'How do I use this tool?', icon: 'analysis' },
      ];
    }

    if (isComparison) {
      // Comparison mode suggestions
      if (messageCount === 0) {
        return [
          { text: 'Compare all properties side by side', icon: 'comparison' },
          { text: 'Which property has the best ROI?', icon: 'financial' },
          { text: 'Rank properties by investment potential', icon: 'analysis' },
          { text: 'What are the key differences?', icon: 'comparison' },
        ];
      }
      return [
        { text: 'Show me a detailed comparison table', icon: 'comparison' },
        { text: 'Which property has lower risk?', icon: 'risk' },
        { text: 'Compare the locations', icon: 'location' },
        { text: 'Summarize the best choice for me', icon: 'analysis' },
      ];
    }

    // Single report suggestions
    if (messageCount === 0) {
      return [
        { text: 'Give me a complete TLDR', icon: 'analysis' },
        { text: 'What are the key highlights?', icon: 'analysis' },
        { text: 'Show me the financial breakdown', icon: 'financial' },
        { text: 'What are the main risks?', icon: 'risk' },
      ];
    }

    // Follow-up suggestions based on conversation
    return [
      { text: 'Tell me more about the location', icon: 'location' },
      { text: 'What about the rental yield?', icon: 'financial' },
      { text: 'Are there any red flags?', icon: 'risk' },
      { text: 'Summarize everything so far', icon: 'analysis' },
    ];
  };

  const suggestions = getSuggestions();

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Sparkles className="h-3 w-3" />
        <span>Smart suggestions</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s, idx) => {
          const Icon = iconMap[s.icon] || TrendingUp;
          return (
            <Badge
              key={idx}
              variant="outline"
              className="cursor-pointer hover:bg-primary/10 hover:border-primary/50 transition-colors flex items-center gap-1.5 py-1.5 px-3"
              onClick={() => onSelect(s.text)}
            >
              <Icon className="h-3 w-3 text-primary" />
              {s.text}
            </Badge>
          );
        })}
      </div>
    </div>
  );
}

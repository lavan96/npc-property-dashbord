import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Building2, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BuildTypeSelectorProps {
  value: 'new_build' | 'existing_property';
  onChange: (value: 'new_build' | 'existing_property') => void;
  disabled?: boolean;
  showCard?: boolean;
  size?: 'sm' | 'default';
  className?: string;
}

export function BuildTypeSelector({
  value,
  onChange,
  disabled = false,
  showCard = true,
  size = 'default',
  className
}: BuildTypeSelectorProps) {
  const isNewBuild = value === 'new_build';

  const content = (
    <RadioGroup
      value={value}
      onValueChange={(v) => onChange(v as 'new_build' | 'existing_property')}
      className="grid grid-cols-2 gap-4"
      disabled={disabled}
    >
      <Label
        htmlFor="existing_property"
        className={cn(
          "flex flex-col items-center justify-center border-2 rounded-xl cursor-pointer transition-all",
          size === 'sm' ? 'p-4' : 'p-6',
          !isNewBuild 
            ? 'border-primary bg-primary/5 shadow-md' 
            : 'border-border hover:border-primary/50 hover:bg-muted/50',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <RadioGroupItem value="existing_property" id="existing_property" className="sr-only" />
        <Home className={cn(
          !isNewBuild ? 'text-primary' : 'text-muted-foreground',
          size === 'sm' ? 'h-8 w-8 mb-2' : 'h-10 w-10 mb-3'
        )} />
        <span className={cn(
          "font-semibold",
          size === 'sm' ? 'text-base' : 'text-lg',
          !isNewBuild ? 'text-primary' : 'text-foreground'
        )}>
          Existing Property
        </span>
        <span className={cn(
          "text-muted-foreground mt-1",
          size === 'sm' ? 'text-xs' : 'text-sm'
        )}>
          Established home or apartment
        </span>
      </Label>
      <Label
        htmlFor="new_build"
        className={cn(
          "flex flex-col items-center justify-center border-2 rounded-xl cursor-pointer transition-all",
          size === 'sm' ? 'p-4' : 'p-6',
          isNewBuild 
            ? 'border-primary bg-primary/5 shadow-md' 
            : 'border-border hover:border-primary/50 hover:bg-muted/50',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <RadioGroupItem value="new_build" id="new_build" className="sr-only" />
        <Building2 className={cn(
          isNewBuild ? 'text-primary' : 'text-muted-foreground',
          size === 'sm' ? 'h-8 w-8 mb-2' : 'h-10 w-10 mb-3'
        )} />
        <span className={cn(
          "font-semibold",
          size === 'sm' ? 'text-base' : 'text-lg',
          isNewBuild ? 'text-primary' : 'text-foreground'
        )}>
          New Build
        </span>
        <span className={cn(
          "text-muted-foreground mt-1",
          size === 'sm' ? 'text-xs' : 'text-sm'
        )}>
          House & land package
        </span>
      </Label>
    </RadioGroup>
  );

  if (!showCard) {
    return <div className={className}>{content}</div>;
  }

  return (
    <Card className={cn("border-2", className)}>
      <CardContent className="pt-6">
        {content}
      </CardContent>
    </Card>
  );
}

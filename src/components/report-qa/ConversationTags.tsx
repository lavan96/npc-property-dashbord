import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tag, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConversationTagsProps {
  tags: string[];
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  compact?: boolean;
}

const predefinedTags = [
  { name: 'Important', color: 'bg-red-500/20 text-red-600 border-red-500/30' },
  { name: 'Follow-up', color: 'bg-yellow-500/20 text-yellow-600 border-yellow-500/30' },
  { name: 'Reviewed', color: 'bg-green-500/20 text-green-600 border-green-500/30' },
  { name: 'Client Ready', color: 'bg-blue-500/20 text-blue-600 border-blue-500/30' },
  { name: 'Archive', color: 'bg-gray-500/20 text-gray-600 border-gray-500/30' },
];

const getTagColor = (tag: string) => {
  const predefined = predefinedTags.find(t => t.name.toLowerCase() === tag.toLowerCase());
  return predefined?.color || 'bg-primary/20 text-primary border-primary/30';
};

export function ConversationTags({ tags, onAddTag, onRemoveTag, compact }: ConversationTagsProps) {
  const [newTag, setNewTag] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const handleAddCustomTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      onAddTag(newTag.trim());
      setNewTag('');
    }
  };

  if (compact) {
    return (
      <div className="flex flex-wrap gap-1">
        {tags.map((tag) => (
          <Badge
            key={tag}
            variant="outline"
            className={cn("text-[10px] h-4 px-1.5", getTagColor(tag))}
          >
            {tag}
          </Badge>
        ))}
      </div>
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs">
          <Tag className="h-3 w-3" />
          Tags
          {tags.length > 0 && (
            <Badge variant="secondary" className="h-4 px-1 text-[10px]">
              {tags.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="end">
        <div className="space-y-3">
          <div className="text-sm font-medium">Conversation Tags</div>
          
          {/* Current tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="outline"
                  className={cn("gap-1 pr-1", getTagColor(tag))}
                >
                  {tag}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-3 w-3 p-0 hover:bg-transparent"
                    onClick={() => onRemoveTag(tag)}
                  >
                    <X className="h-2 w-2" />
                  </Button>
                </Badge>
              ))}
            </div>
          )}

          {/* Predefined tags */}
          <div className="space-y-1.5">
            <div className="text-xs text-muted-foreground">Quick add</div>
            <div className="flex flex-wrap gap-1.5">
              {predefinedTags
                .filter(t => !tags.includes(t.name))
                .map((tag) => (
                  <Badge
                    key={tag.name}
                    variant="outline"
                    className={cn("cursor-pointer hover:opacity-80", tag.color)}
                    onClick={() => onAddTag(tag.name)}
                  >
                    <Plus className="h-2.5 w-2.5 mr-0.5" />
                    {tag.name}
                  </Badge>
                ))}
            </div>
          </div>

          {/* Custom tag input */}
          <div className="flex gap-1.5">
            <Input
              placeholder="Custom tag..."
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              className="h-7 text-xs"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleAddCustomTag();
                }
              }}
            />
            <Button
              size="sm"
              className="h-7 px-2"
              onClick={handleAddCustomTag}
              disabled={!newTag.trim()}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

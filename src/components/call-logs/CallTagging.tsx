import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Tag, Plus, X, Settings, Trash2 } from 'lucide-react';

interface CallTag {
  id: string;
  name: string;
  color: string;
  description: string | null;
}

interface CallTaggingProps {
  callId: string;
  currentTags: string[];
  onTagsUpdated: (tags: string[]) => void;
  compact?: boolean;
}

const TAG_COLORS = [
  { name: 'red', class: 'bg-red-500/20 text-red-400 border-red-500/30' },
  { name: 'amber', class: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  { name: 'green', class: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  { name: 'blue', class: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  { name: 'purple', class: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  { name: 'orange', class: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  { name: 'pink', class: 'bg-pink-500/20 text-pink-400 border-pink-500/30' },
  { name: 'gray', class: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
];

const getColorClass = (color: string) => {
  return TAG_COLORS.find(c => c.name === color)?.class || TAG_COLORS[7].class;
};

export const CallTagging = ({ callId, currentTags, onTagsUpdated, compact = false }: CallTaggingProps) => {
  const { toast } = useToast();
  const [availableTags, setAvailableTags] = useState<CallTag[]>([]);
  const [loading, setLoading] = useState(false);
  const [showManager, setShowManager] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('blue');

  useEffect(() => {
    fetchTags();
  }, []);

  const fetchTags = async () => {
    const { data, error } = await supabase
      .from('call_tags')
      .select('*')
      .order('name');

    if (error) {
      console.error('Error fetching tags:', error);
      return;
    }
    setAvailableTags(data || []);
  };

  const toggleTag = async (tagName: string) => {
    setLoading(true);
    try {
      const newTags = currentTags.includes(tagName)
        ? currentTags.filter(t => t !== tagName)
        : [...currentTags, tagName];

      const { error } = await supabase
        .from('vapi_call_logs')
        .update({ tags: newTags })
        .eq('id', callId);

      if (error) throw error;

      onTagsUpdated(newTags);
      toast({
        title: currentTags.includes(tagName) ? 'Tag removed' : 'Tag added',
        description: `${tagName} ${currentTags.includes(tagName) ? 'removed from' : 'added to'} call`,
      });
    } catch (error) {
      console.error('Error updating tags:', error);
      toast({
        title: 'Error',
        description: 'Failed to update tags',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const createTag = async () => {
    if (!newTagName.trim()) return;
    
    setLoading(true);
    try {
      const { error } = await supabase
        .from('call_tags')
        .insert({ name: newTagName.trim(), color: newTagColor });

      if (error) throw error;

      toast({ title: 'Tag created', description: `"${newTagName}" tag created successfully` });
      setNewTagName('');
      setNewTagColor('blue');
      fetchTags();
    } catch (error: any) {
      if (error.code === '23505') {
        toast({ title: 'Tag exists', description: 'A tag with this name already exists', variant: 'destructive' });
      } else {
        toast({ title: 'Error', description: 'Failed to create tag', variant: 'destructive' });
      }
    } finally {
      setLoading(false);
    }
  };

  const deleteTag = async (tagId: string, tagName: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('call_tags')
        .delete()
        .eq('id', tagId);

      if (error) throw error;

      toast({ title: 'Tag deleted', description: `"${tagName}" tag deleted` });
      fetchTags();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete tag', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (compact) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 px-2 gap-1">
            <Tag className="w-3.5 h-3.5" />
            {currentTags.length > 0 && (
              <span className="text-xs">{currentTags.length}</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3" align="start">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Tags</span>
              <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => setShowManager(true)}>
                <Settings className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {availableTags.map(tag => (
                <Badge
                  key={tag.id}
                  className={`cursor-pointer transition-all ${getColorClass(tag.color)} ${
                    currentTags.includes(tag.name) ? 'ring-2 ring-offset-1 ring-offset-background' : 'opacity-60 hover:opacity-100'
                  }`}
                  onClick={() => toggleTag(tag.name)}
                >
                  {tag.name}
                </Badge>
              ))}
              {availableTags.length === 0 && (
                <span className="text-xs text-muted-foreground">No tags available</span>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tag className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Tags</span>
        </div>
        <Dialog open={showManager} onOpenChange={setShowManager}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2 gap-1">
              <Settings className="w-3.5 h-3.5" />
              <span className="text-xs">Manage</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Manage Tags</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Create new tag */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Create New Tag</label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Tag name..."
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    className="flex-1"
                  />
                  <Select value={newTagColor} onValueChange={setNewTagColor}>
                    <SelectTrigger className="w-24">
                      <div className={`w-4 h-4 rounded-full ${TAG_COLORS.find(c => c.name === newTagColor)?.class.split(' ')[0]}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {TAG_COLORS.map(color => (
                        <SelectItem key={color.name} value={color.name}>
                          <div className="flex items-center gap-2">
                            <div className={`w-4 h-4 rounded-full ${color.class.split(' ')[0]}`} />
                            <span className="capitalize">{color.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" onClick={createTag} disabled={loading || !newTagName.trim()}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Existing tags */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Existing Tags</label>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {availableTags.map(tag => (
                    <div key={tag.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                      <Badge className={getColorClass(tag.color)}>{tag.name}</Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteTag(tag.id, tag.name)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Current tags display */}
      <div className="flex flex-wrap gap-1.5">
        {currentTags.map(tagName => {
          const tag = availableTags.find(t => t.name === tagName);
          return (
            <Badge
              key={tagName}
              className={`${getColorClass(tag?.color || 'gray')} cursor-pointer gap-1`}
              onClick={() => toggleTag(tagName)}
            >
              {tagName}
              <X className="w-3 h-3" />
            </Badge>
          );
        })}
      </div>

      {/* Add tags */}
      <div className="flex flex-wrap gap-1.5">
        {availableTags
          .filter(tag => !currentTags.includes(tag.name))
          .map(tag => (
            <Badge
              key={tag.id}
              className={`${getColorClass(tag.color)} opacity-50 hover:opacity-100 cursor-pointer`}
              onClick={() => toggleTag(tag.name)}
            >
              <Plus className="w-3 h-3 mr-1" />
              {tag.name}
            </Badge>
          ))}
      </div>
    </div>
  );
};

// Tag filter component for the call list
export const CallTagFilter = ({ 
  selectedTags, 
  onTagsChange 
}: { 
  selectedTags: string[]; 
  onTagsChange: (tags: string[]) => void;
}) => {
  const [availableTags, setAvailableTags] = useState<CallTag[]>([]);

  useEffect(() => {
    const fetchTags = async () => {
      const { data } = await supabase.from('call_tags').select('*').order('name');
      setAvailableTags(data || []);
    };
    fetchTags();
  }, []);

  const toggleTag = (tagName: string) => {
    onTagsChange(
      selectedTags.includes(tagName)
        ? selectedTags.filter(t => t !== tagName)
        : [...selectedTags, tagName]
    );
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Tag className="w-4 h-4" />
          Tags
          {selectedTags.length > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 px-1.5">
              {selectedTags.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <div className="space-y-2">
          <span className="text-sm font-medium">Filter by Tags</span>
          <div className="flex flex-wrap gap-1.5">
            {availableTags.map(tag => (
              <Badge
                key={tag.id}
                className={`cursor-pointer transition-all ${getColorClass(tag.color)} ${
                  selectedTags.includes(tag.name) ? 'ring-2 ring-offset-1 ring-offset-background' : 'opacity-60 hover:opacity-100'
                }`}
                onClick={() => toggleTag(tag.name)}
              >
                {tag.name}
              </Badge>
            ))}
          </div>
          {selectedTags.length > 0 && (
            <Button variant="ghost" size="sm" className="w-full h-7 text-xs" onClick={() => onTagsChange([])}>
              Clear all
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

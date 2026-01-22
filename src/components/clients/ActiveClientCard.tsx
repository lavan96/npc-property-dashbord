import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Mail, 
  Phone, 
  FileText, 
  Star, 
  Plus, 
  MoreVertical, 
  Pencil, 
  Trash2,
  Loader2,
  MessageSquare,
  Calendar,
  CheckSquare,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { formatFullName } from '@/utils/nameFormatting';
import { format } from 'date-fns';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ClientNote {
  id: string;
  client_id: string;
  content: string;
  note_type: string;
  created_at: string;
}

interface TrackedClient {
  id: string;
  primary_first_name: string;
  primary_surname: string;
  primary_email: string | null;
  primary_mobile: string | null;
  pipeline_status: string | null;
  current_stage_id: string | null;
  is_favorite?: boolean;
}

interface StageInfo {
  name: string;
  color: string;
}

interface ActiveClientCardProps {
  client: TrackedClient;
  notes: ClientNote[];
  stageInfo: StageInfo;
}

const noteTypes = [
  { value: 'general', label: 'General', icon: MessageSquare },
  { value: 'call', label: 'Call', icon: Phone },
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'meeting', label: 'Meeting', icon: Calendar },
  { value: 'task', label: 'Task', icon: CheckSquare },
] as const;

type NoteType = typeof noteTypes[number]['value'];

// Character limit for note truncation
const NOTE_TRUNCATE_LENGTH = 150;

export function ActiveClientCard({ client, notes, stageInfo }: ActiveClientCardProps) {
  const queryClient = useQueryClient();
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [newNoteType, setNewNoteType] = useState<NoteType>('general');
  const [editNoteContent, setEditNoteContent] = useState('');
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());

  // Toggle note expansion
  const toggleNoteExpansion = (noteId: string) => {
    setExpandedNotes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(noteId)) {
        newSet.delete(noteId);
      } else {
        newSet.add(noteId);
      }
      return newSet;
    });
  };

  // Check if note needs truncation
  const isNoteTruncated = (content: string) => content.length > NOTE_TRUNCATE_LENGTH;

  // Get truncated or full content
  const getNoteDisplay = (note: ClientNote) => {
    const isExpanded = expandedNotes.has(note.id);
    if (isExpanded || !isNoteTruncated(note.content)) {
      return note.content;
    }
    return note.content.substring(0, NOTE_TRUNCATE_LENGTH) + '...';
  };

  // Toggle favorite mutation
  const toggleFavoriteMutation = useMutation({
    mutationFn: async () => {
      // Use secure Edge Function with HttpOnly cookie auth
      const { data, error: fnError } = await invokeSecureFunction('manage-client-data', {
        operation: 'update',
        table: 'clients',
        clientId: client.id,
        data: { is_favorite: !client.is_favorite },
      });
      if (!fnError && data?.success) return;
      console.warn('Secure update failed, falling back to direct query');

      // Fallback to direct query
      const { error } = await supabase
        .from('clients')
        .update({ is_favorite: !client.is_favorite })
        .eq('id', client.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-tracker'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success(client.is_favorite ? 'Removed from active clients' : 'Added to active clients');
    },
    onError: (error: any) => {
      toast.error('Failed to update: ' + error.message);
    }
  });

  // Add note mutation with GHL sync
  const addNoteMutation = useMutation({
    mutationFn: async () => {
      // Use secure Edge Function with HttpOnly cookie auth
      const { data, error: fnError } = await invokeSecureFunction('manage-client-data', {
        operation: 'create',
        table: 'client_notes',
        clientId: client.id,
        data: {
          client_id: client.id,
          note_type: newNoteType,
          content: newNoteContent.trim()
        },
      });
      if (!fnError && data?.success) {
        // Sync to GHL (non-blocking)
        invokeSecureFunction('sync-notes-to-ghl', {
          action: 'create',
          clientId: client.id,
          noteId: data.result?.id,
          noteContent: newNoteContent.trim(),
          noteType: newNoteType
        }).catch(err => console.error('GHL note sync failed:', err));
        return data.result;
      }
      console.warn('Secure create failed, falling back to Edge Function');
      
      // Fallback still uses secure function
      const fallbackResult = await invokeSecureFunction('manage-client-data', {
        operation: 'create',
        table: 'client_notes',
        clientId: client.id,
        data: {
          client_id: client.id,
          note_type: newNoteType,
          content: newNoteContent.trim()
        },
      });
      
      if (fallbackResult.error || !fallbackResult.data?.success) {
        throw new Error(fallbackResult.error?.message || 'Failed to create note');
      }

      // Then sync to GHL (non-blocking)
      invokeSecureFunction('sync-notes-to-ghl', {
        action: 'create',
        clientId: client.id,
        noteId: fallbackResult.data.result?.id,
        noteContent: newNoteContent.trim(),
        noteType: newNoteType
      }).catch(err => console.error('GHL note sync failed:', err));

      return fallbackResult.data.result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-client-notes'] });
      setNewNoteContent('');
      setNewNoteType('general');
      setIsAddingNote(false);
      toast.success('Note added');
    },
    onError: (error: any) => {
      toast.error('Failed to add note: ' + error.message);
    }
  });

  // Update note mutation with GHL sync
  const updateNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      // Use secure Edge Function with HttpOnly cookie auth
      const { data, error: fnError } = await invokeSecureFunction('manage-client-data', {
        operation: 'update',
        table: 'client_notes',
        clientId: client.id,
        recordId: noteId,
        data: { content: editNoteContent.trim() },
      });
      if (!fnError && data?.success) {
        // Sync update to GHL
        invokeSecureFunction('sync-notes-to-ghl', {
          action: 'update',
          clientId: client.id,
          noteId,
          noteContent: `[UPDATED] ${editNoteContent.trim()}`,
          noteType: 'general'
        }).catch(err => console.error('GHL note sync failed:', err));
        return;
      }
      throw new Error(fnError?.message || 'Failed to update note');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-client-notes'] });
      setEditingNoteId(null);
      setEditNoteContent('');
      toast.success('Note updated');
    },
    onError: (error: any) => {
      toast.error('Failed to update note: ' + error.message);
    }
  });

  // Delete note mutation with GHL sync
  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      // Sync delete to GHL first (best effort)
      await invokeSecureFunction('sync-notes-to-ghl', {
        action: 'delete',
        clientId: client.id,
        noteId
      }).catch(err => console.error('GHL note delete sync failed:', err));

      // Use secure Edge Function with HttpOnly cookie auth
      const { data, error: fnError } = await invokeSecureFunction('manage-client-data', {
        operation: 'delete',
        table: 'client_notes',
        clientId: client.id,
        recordId: noteId,
      });
      if (!fnError && data?.success) return;
      throw new Error(fnError?.message || 'Failed to delete note');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-client-notes'] });
      toast.success('Note deleted');
    },
    onError: (error: any) => {
      toast.error('Failed to delete note: ' + error.message);
    }
  });

  const handleStartEdit = (note: ClientNote) => {
    setEditingNoteId(note.id);
    setEditNoteContent(note.content);
  };

  const handleCancelEdit = () => {
    setEditingNoteId(null);
    setEditNoteContent('');
  };

  const getNoteTypeIcon = (type: string) => {
    const noteType = noteTypes.find(t => t.value === type);
    const Icon = noteType?.icon || MessageSquare;
    return <Icon className="h-3 w-3" />;
  };

  const getNoteTypeColor = (type: string) => {
    switch (type) {
      case 'call': return 'text-green-600';
      case 'email': return 'text-blue-600';
      case 'meeting': return 'text-purple-600';
      case 'task': return 'text-orange-600';
      default: return 'text-muted-foreground';
    }
  };

  return (
    <Card className={cn("flex flex-col", client.is_favorite && "ring-2 ring-yellow-400/50")}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => toggleFavoriteMutation.mutate()}
              disabled={toggleFavoriteMutation.isPending}
            >
              <Star 
                className={cn(
                  "h-4 w-4 transition-colors",
                  client.is_favorite 
                    ? 'fill-yellow-400 text-yellow-400' 
                    : 'text-muted-foreground hover:text-yellow-400'
                )} 
              />
            </Button>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base truncate">
                {formatFullName(client.primary_first_name, client.primary_surname)}
              </CardTitle>
              <div className="flex flex-col gap-1 text-xs text-muted-foreground mt-1">
                {client.primary_email && (
                  <span className="flex items-center gap-1 truncate">
                    <Mail className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{client.primary_email}</span>
                  </span>
                )}
                {client.primary_mobile && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3 flex-shrink-0" />
                    {client.primary_mobile}
                  </span>
                )}
              </div>
            </div>
          </div>
          <Badge 
            className="text-xs flex-shrink-0"
            style={{ 
              backgroundColor: stageInfo.color + '20',
              color: stageInfo.color,
              borderColor: stageInfo.color 
            }}
            variant="outline"
          >
            {stageInfo.name}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 pt-0 space-y-3">
        {/* Add Note Section */}
        {isAddingNote ? (
          <div className="space-y-2 p-2 border rounded-md bg-muted/30">
            <div className="flex items-center gap-2">
              <Select value={newNoteType} onValueChange={(v: NoteType) => setNewNoteType(v)}>
                <SelectTrigger className="w-28 h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {noteTypes.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex items-center gap-1.5">
                        <type.icon className="h-3 w-3" />
                        {type.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Textarea
              placeholder="Enter your note..."
              value={newNoteContent}
              onChange={(e) => setNewNoteContent(e.target.value)}
              className="min-h-[60px] text-xs"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={() => addNoteMutation.mutate()}
                disabled={!newNoteContent.trim() || addNoteMutation.isPending}
              >
                {addNoteMutation.isPending ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : null}
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => {
                  setIsAddingNote(false);
                  setNewNoteContent('');
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full h-7 text-xs"
            onClick={() => setIsAddingNote(true)}
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Note
          </Button>
        )}

        {/* Notes List */}
        {notes.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <FileText className="h-3 w-3" />
              Notes ({notes.length})
            </p>
            <ScrollArea className="h-40">
              <div className="space-y-2 pr-3">
                {notes.map(note => (
                  <div 
                    key={note.id} 
                    className="bg-muted/50 rounded-md p-2.5 text-xs group relative"
                  >
                    {editingNoteId === note.id ? (
                      <div className="space-y-2">
                        <Textarea
                          value={editNoteContent}
                          onChange={(e) => setEditNoteContent(e.target.value)}
                          className="min-h-[60px] text-xs"
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="h-6 text-xs"
                            onClick={() => updateNoteMutation.mutate(note.id)}
                            disabled={!editNoteContent.trim() || updateNoteMutation.isPending}
                          >
                            {updateNoteMutation.isPending ? (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : null}
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-xs"
                            onClick={handleCancelEdit}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className={getNoteTypeColor(note.note_type)}>
                            {getNoteTypeIcon(note.note_type)}
                          </span>
                          <span className="capitalize text-[10px] text-muted-foreground">
                            {note.note_type}
                          </span>
                          <span className="text-[10px] text-muted-foreground ml-auto">
                            {format(new Date(note.created_at), 'dd MMM yyyy, h:mm a')}
                          </span>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 w-5 p-0 hover:bg-muted"
                              >
                                <MoreVertical className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleStartEdit(note)}>
                                <Pencil className="h-3 w-3 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => deleteNoteMutation.mutate(note.id)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="h-3 w-3 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <p className="whitespace-pre-wrap">{getNoteDisplay(note)}</p>
                        {isNoteTruncated(note.content) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 px-1 text-[10px] text-primary hover:text-primary/80 mt-1"
                            onClick={() => toggleNoteExpansion(note.id)}
                          >
                            {expandedNotes.has(note.id) ? (
                              <>
                                <ChevronUp className="h-3 w-3 mr-0.5" />
                                Show less
                              </>
                            ) : (
                              <>
                                <ChevronDown className="h-3 w-3 mr-0.5" />
                                Read more
                              </>
                            )}
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No notes for this client
          </p>
        )}
      </CardContent>
    </Card>
  );
}

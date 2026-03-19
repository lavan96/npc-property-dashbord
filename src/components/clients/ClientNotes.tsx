import { useState, useRef, useCallback, useEffect } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MessageSquare, Phone, Mail, Calendar, CheckSquare, Plus, Loader2, Pencil } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { VoiceNoteRecorder } from './VoiceNoteRecorder';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { logActivityDirect } from '@/hooks/useActivityLogger';

interface ClientNotesProps {
  clientId: string;
}

const noteTypes = [
  { value: 'general', label: 'General', icon: MessageSquare },
  { value: 'call', label: 'Call', icon: Phone },
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'meeting', label: 'Meeting', icon: Calendar },
  { value: 'task', label: 'Task', icon: CheckSquare },
] as const;

type NoteType = typeof noteTypes[number]['value'];

const PAGE_SIZE = 10;

/**
 * Secure fetch for notes data using HttpOnly cookies with pagination
 */
async function fetchNotesSecure(clientId: string, page: number) {
  const { data, error } = await invokeSecureFunction('get-client-data', {
    clientId,
    include: { notes: true },
    notesOptions: {
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    },
  });

  if (error) throw new Error(error.message);
  if (!data?.success) throw new Error(data?.error || 'Failed to fetch notes');
  
  const notes = data.notes || [];
  return {
    notes,
    nextPage: notes.length === PAGE_SIZE ? page + 1 : undefined,
  };
}

export function ClientNotes({ clientId }: ClientNotesProps) {
  const [newNote, setNewNote] = useState('');
  const [noteType, setNoteType] = useState<NoteType>('general');
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editNoteType, setEditNoteType] = useState<NoteType>('general');
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['client-notes', clientId],
    queryFn: ({ pageParam = 0 }) => fetchNotesSecure(clientId, pageParam),
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
  });

  const notes = data?.pages.flatMap((page) => page.notes) || [];

  const addNoteMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        note_type: noteType,
        content: newNote.trim(),
      };

      const { data, error } = await invokeSecureFunction('manage-client-data', {
        operation: 'create',
        table: 'client_notes',
        clientId,
        data: payload,
      });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || 'Failed to add note');
      return data.result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['client-notes', clientId] });
      logActivityDirect({
        actionType: 'client_note_added',
        entityType: 'client_note',
        entityId: clientId,
        metadata: { note_type: noteType }
      });
      // Sync to GHL (non-blocking)
      invokeSecureFunction('sync-notes-to-ghl', {
        action: 'create',
        clientId,
        noteId: result?.id,
        noteContent: newNote.trim(),
        noteType,
      }).catch(err => console.warn('GHL note sync failed:', err));
      setNewNote('');
      setIsAdding(false);
      toast.success('Note added');
    },
    onError: (error: any) => {
      toast.error('Failed to add note: ' + error.message);
    }
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      const { data, error } = await invokeSecureFunction('manage-client-data', {
        operation: 'delete',
        table: 'client_notes',
        clientId,
        recordId: noteId,
      });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || 'Failed to delete note');
    },
    onSuccess: (_result, noteId) => {
      // Sync delete to GHL (non-blocking)
      invokeSecureFunction('sync-notes-to-ghl', {
        action: 'delete',
        clientId,
        noteId,
      }).catch(err => console.warn('GHL note delete sync failed:', err));
      queryClient.invalidateQueries({ queryKey: ['client-notes', clientId] });
      toast.success('Note deleted');
    }
  });

  const editNoteMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await invokeSecureFunction('manage-client-data', {
        operation: 'update',
        table: 'client_notes',
        clientId,
        recordId: editingId!,
        data: {
          content: editContent.trim(),
          note_type: editNoteType,
        },
      });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || 'Failed to update note');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-notes', clientId] });
      setEditingId(null);
      toast.success('Note updated');
    },
    onError: (error: any) => {
      toast.error('Failed to update note: ' + error.message);
    },
  });

  const startEditingNote = (note: any) => {
    setEditingId(note.id);
    setEditContent(note.content);
    setEditNoteType(note.note_type);
  };

  const getNoteIcon = (type: string) => {
    const noteType = noteTypes.find(t => t.value === type);
    const Icon = noteType?.icon || MessageSquare;
    return <Icon className="h-3.5 w-3.5" />;
  };

  const getNoteColor = (type: string) => {
    switch (type) {
      case 'call': return 'bg-green-500/10 text-green-600 border-green-500/20';
      case 'email': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'meeting': return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
      case 'task': return 'bg-orange-500/10 text-orange-600 border-orange-500/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="space-y-4">
      {/* Add Note Form */}
      {isAdding ? (
        <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={noteType} onValueChange={(v: NoteType) => setNoteType(v)}>
              <SelectTrigger className="w-32 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {noteTypes.map(type => (
                  <SelectItem key={type.value} value={type.value}>
                    <div className="flex items-center gap-2">
                      <type.icon className="h-3.5 w-3.5" />
                      {type.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <VoiceNoteRecorder 
              noteType={noteType} 
              onTranscriptReady={(text) => setNewNote(prev => prev ? `${prev}\n\n${text}` : text)}
              disabled={addNoteMutation.isPending}
            />
          </div>
          <Textarea
            placeholder="Enter your note..."
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            className="min-h-[80px]"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => addNoteMutation.mutate()}
              disabled={!newNote.trim() || addNoteMutation.isPending}
            >
              {addNoteMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Save Note
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setIsAdding(false);
                setNewNote('');
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
          onClick={() => setIsAdding(true)}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Note
        </Button>
      )}

      {/* Notes List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : notes.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No notes yet</p>
        </div>
      ) : (
        <ScrollArea className="h-[300px]">
          <div 
            ref={scrollRef}
            className="space-y-3 pr-4"
            onScroll={(e) => {
              const target = e.currentTarget;
              const scrolledToBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 50;
              if (scrolledToBottom && hasNextPage && !isFetchingNextPage) {
                fetchNextPage();
              }
            }}
          >
            {notes.map((note: any) => (
              <div key={note.id} className="p-3 border rounded-lg space-y-2 group">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className={getNoteColor(note.note_type)}>
                    {getNoteIcon(note.note_type)}
                    <span className="ml-1.5 capitalize">{note.note_type}</span>
                  </Badge>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(note.created_at), 'MMM d, yyyy h:mm a')}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                      onClick={() => deleteNoteMutation.mutate(note.id)}
                    >
                      ×
                    </Button>
                  </div>
                </div>
                <p className="text-sm whitespace-pre-wrap">{note.content}</p>
              </div>
            ))}
            {isFetchingNextPage && (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

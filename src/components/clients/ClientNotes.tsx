import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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
import { MessageSquare, Phone, Mail, Calendar, CheckSquare, Plus, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { VoiceNoteRecorder } from './VoiceNoteRecorder';

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

/**
 * Helper to get session token
 */
function getSessionToken(): string | null {
  return localStorage.getItem('session_token');
}

/**
 * Secure fetch for notes data with fallback
 */
async function fetchNotesSecure(clientId: string) {
  const sessionToken = getSessionToken();
  
  // Try secure Edge Function first
  if (sessionToken) {
    try {
      const { data, error } = await supabase.functions.invoke('get-client-data', {
        body: {
          session_token: sessionToken,
          clientId,
          include: { notes: true },
        },
      });

      if (!error && data?.success) {
        return data.data?.notes || [];
      }
    } catch (err) {
      console.warn('Secure notes fetch failed, falling back:', err);
    }
  }

  // Fallback: Direct Supabase query
  const { data, error } = await supabase
    .from('client_notes')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export function ClientNotes({ clientId }: ClientNotesProps) {
  const [newNote, setNewNote] = useState('');
  const [noteType, setNoteType] = useState<NoteType>('general');
  const [isAdding, setIsAdding] = useState(false);
  const queryClient = useQueryClient();

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['client-notes', clientId],
    queryFn: () => fetchNotesSecure(clientId),
  });

  const addNoteMutation = useMutation({
    mutationFn: async () => {
      const sessionToken = getSessionToken();
      const payload = {
        note_type: noteType,
        content: newNote.trim(),
      };

      // Try secure Edge Function first
      if (sessionToken) {
        try {
          const { data, error } = await supabase.functions.invoke('manage-client-data', {
            body: {
              session_token: sessionToken,
              operation: 'create',
              table: 'client_notes',
              clientId,
              data: payload,
            },
          });

          if (!error && data?.success) {
            return data.result;
          }
        } catch (err) {
          console.warn('Secure note add failed, falling back:', err);
        }
      }

      // Fallback: Direct Supabase mutation
      const { error } = await supabase
        .from('client_notes')
        .insert({
          client_id: clientId,
          ...payload,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-notes', clientId] });
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
      const sessionToken = getSessionToken();

      // Try secure Edge Function first
      if (sessionToken) {
        try {
          const { data, error } = await supabase.functions.invoke('manage-client-data', {
            body: {
              session_token: sessionToken,
              operation: 'delete',
              table: 'client_notes',
              clientId,
              recordId: noteId,
            },
          });

          if (!error && data?.success) {
            return;
          }
        } catch (err) {
          console.warn('Secure note delete failed, falling back:', err);
        }
      }

      // Fallback: Direct Supabase mutation
      const { error } = await supabase
        .from('client_notes')
        .delete()
        .eq('id', noteId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-notes', clientId] });
      toast.success('Note deleted');
    }
  });

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
          <div className="space-y-3 pr-4">
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
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

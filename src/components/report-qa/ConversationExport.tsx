import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Download, FileText, FileDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ConversationExportProps {
  messages: Message[];
  title: string;
  reportNames: string[];
}

export function ConversationExport({ messages, title, reportNames }: ConversationExportProps) {
  const { toast } = useToast();

  const exportAsText = () => {
    const header = `# ${title}\n\nReports: ${reportNames.join(', ')}\nExported: ${new Date().toLocaleString()}\n\n---\n\n`;
    
    const content = messages.map(m => {
      const timestamp = m.timestamp.toLocaleString();
      const role = m.role === 'user' ? '👤 You' : '🤖 Assistant';
      return `[${timestamp}] ${role}:\n${m.content}`;
    }).join('\n\n---\n\n');

    const blob = new Blob([header + content], { type: 'text/plain' });
    downloadBlob(blob, `${sanitizeFilename(title)}.txt`);
    
    toast({
      title: 'Exported',
      description: 'Conversation saved as text file',
    });
  };

  const exportAsMarkdown = () => {
    const header = `# ${title}\n\n**Reports:** ${reportNames.join(', ')}\n\n**Exported:** ${new Date().toLocaleString()}\n\n---\n\n`;
    
    const content = messages.map(m => {
      const timestamp = m.timestamp.toLocaleString();
      const role = m.role === 'user' ? '**You**' : '**Assistant**';
      return `### ${role}\n*${timestamp}*\n\n${m.content}`;
    }).join('\n\n---\n\n');

    const blob = new Blob([header + content], { type: 'text/markdown' });
    downloadBlob(blob, `${sanitizeFilename(title)}.md`);
    
    toast({
      title: 'Exported',
      description: 'Conversation saved as markdown file',
    });
  };

  const exportAsJSON = () => {
    const data = {
      title,
      reportNames,
      exportedAt: new Date().toISOString(),
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp.toISOString(),
      })),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `${sanitizeFilename(title)}.json`);
    
    toast({
      title: 'Exported',
      description: 'Conversation saved as JSON file',
    });
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const sanitizeFilename = (name: string) => {
    return name.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
  };

  if (messages.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs">
          <Download className="h-3 w-3" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={exportAsText}>
          <FileText className="h-4 w-4 mr-2" />
          Export as Text (.txt)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportAsMarkdown}>
          <FileDown className="h-4 w-4 mr-2" />
          Export as Markdown (.md)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportAsJSON}>
          <FileDown className="h-4 w-4 mr-2" />
          Export as JSON (.json)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspaces } from '../contexts/WorkspaceContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from './ui/dialog';
import { BookMarked, Plus, LogOut, Loader2 } from 'lucide-react';

export default function Sidebar() {
  const { user, signOut } = useAuth();
  const { workspaces, activeWorkspaceId, setActiveWorkspaceId, createWorkspace, loading } = useWorkspaces();
  const [open, setOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (newTitle.trim()) {
      setIsCreating(true);
      await createWorkspace(newTitle.trim());
      setNewTitle('');
      setIsCreating(false);
      setOpen(false);
    }
  };

  return (
    <div className="w-[260px] border-r border-natural-border bg-natural-sidebar flex flex-col h-screen p-6">
      <div className="font-serif font-bold text-xl text-natural-accent mb-8 flex items-center gap-2">
        <BookMarked className="w-5 h-5 text-natural-accent" />
        ScholarSpace
      </div>

      <div className="text-xs uppercase tracking-wider text-natural-muted font-bold mb-4">
        Workspaces
      </div>

      <div className="mb-4">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger className="w-full flex items-center justify-center gap-2 border-dashed border border-natural-accent text-natural-accent hover:bg-natural-accent hover:text-white transition-colors bg-transparent shadow-none p-2 rounded-lg font-medium text-sm">
            <Plus className="w-4 h-4" /> New Workspace
          </DialogTrigger>
          <DialogContent className="font-sans">
            <DialogHeader>
              <DialogTitle className="font-serif text-natural-text text-xl">Create New Workspace</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <Input 
                placeholder="Workspace Topic or Title..." 
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCreate();
                  }
                }}
                className="bg-[#FAFAFA] border-natural-border focus:border-natural-accent"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={!newTitle.trim() || isCreating} className="bg-natural-accent text-white">
                {isCreating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <ScrollArea className="flex-1 -mx-2 px-2">
        {loading ? (
           <div className="flex justify-center p-4"><Loader2 className="w-4 h-4 animate-spin text-zinc-400" /></div>
        ) : (
          <div className="space-y-1">
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => setActiveWorkspaceId(ws.id!)}
                className={`w-full text-left p-3 rounded-lg text-[0.85rem] mb-2 border transition-colors ${
                  activeWorkspaceId === ws.id
                    ? 'bg-white border-natural-accent shadow-sm'
                    : 'bg-white border-natural-border hover:border-natural-accent'
                }`}
              >
                <div className="font-medium text-natural-text truncate">{ws.title}</div>
                <div className="text-[0.75rem] text-natural-muted mt-1 truncate">{ws.description || 'Workspace'}</div>
              </button>
            ))}
            {workspaces.length === 0 && (
              <p className="text-xs text-zinc-500 text-center mt-4">No workspaces found.</p>
            )}
          </div>
        )}
      </ScrollArea>

      <div className="pt-4 border-t border-natural-border flex flex-col gap-2">
        <div className="text-[0.85rem] font-medium text-natural-text truncate">{user?.displayName}</div>
        <div className="text-[0.75rem] text-natural-muted truncate">{user?.email}</div>
        <Button onClick={signOut} variant="secondary" size="sm" className="w-full justify-start mt-2 border border-natural-accent text-natural-accent hover:opacity-80 bg-transparent">
          <LogOut className="w-4 h-4 mr-2" /> Sign Out
        </Button>
      </div>
    </div>
  );
}

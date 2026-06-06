import React, { useState } from 'react';
import { useWorkspaces } from '../contexts/WorkspaceContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { BookOpen, Mic, PenTool, Presentation, Video, Image as ImageIcon } from 'lucide-react';
import ChatTab from './tabs/ChatTab';
import VoiceTutorTab from './tabs/VoiceTutorTab';
import PapersTab from './tabs/PapersTab';
import StudioTab from './tabs/StudioTab';

export default function WorkspaceView() {
  const { workspaces, activeWorkspaceId } = useWorkspaces();
  
  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId);

  if (!activeWorkspace) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-400 bg-white">
        Select or create a workspace to begin.
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-natural-bg h-screen overflow-hidden">
      <div className="px-6 py-6 flex justify-between items-center bg-transparent">
        <h1 className="text-2xl font-serif text-natural-text">{activeWorkspace.title}</h1>
        <div className="flex items-center gap-3">
            <span className="text-[0.8rem] text-natural-muted font-mono bg-natural-sidebar px-2 py-1 rounded">ID: {activeWorkspace.id?.substring(0,6)}</span>
        </div>
      </div>
      
      <Tabs defaultValue="chat" className="flex-1 flex flex-col overflow-hidden px-6">
        <div className="flex items-center justify-between mb-4">
            <TabsList className="bg-natural-sidebar rounded-full h-10 p-1">
            <TabsTrigger value="chat" className="rounded-full px-4 text-xs font-bold data-[state=active]:bg-natural-accent data-[state=active]:text-white transition-colors">
                <BookOpen className="w-3.5 h-3.5 mr-2" /> Chat & Docs
            </TabsTrigger>
            <TabsTrigger value="voice" className="rounded-full px-4 text-xs font-bold data-[state=active]:bg-natural-accent data-[state=active]:text-white transition-colors">
                <Mic className="w-3.5 h-3.5 mr-2" /> Voice Tutor
            </TabsTrigger>
            <TabsTrigger value="papers" className="rounded-full px-4 text-xs font-bold data-[state=active]:bg-natural-accent data-[state=active]:text-white transition-colors">
                <PenTool className="w-3.5 h-3.5 mr-2" /> Papers & Slides
            </TabsTrigger>
            <TabsTrigger value="studio" className="rounded-full px-4 text-xs font-bold data-[state=active]:bg-natural-accent data-[state=active]:text-white transition-colors">
                <ImageIcon className="w-3.5 h-3.5 mr-2" /> Media Studio
            </TabsTrigger>
            </TabsList>
        </div>

        <div className="flex-1 overflow-hidden relative pb-6">
            <TabsContent value="chat" className="h-full m-0 data-[state=active]:flex">
                <ChatTab workspace={activeWorkspace} />
            </TabsContent>
            <TabsContent value="voice" className="h-full m-0 data-[state=active]:flex">
                <VoiceTutorTab workspace={activeWorkspace} />
            </TabsContent>
            <TabsContent value="papers" className="h-full m-0 data-[state=active]:flex">
                <PapersTab workspace={activeWorkspace} />
            </TabsContent>
            <TabsContent value="studio" className="h-full m-0 data-[state=active]:flex">
                <StudioTab workspace={activeWorkspace} />
            </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

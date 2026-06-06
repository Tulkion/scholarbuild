import React from 'react';
import { useAuth } from './contexts/AuthContext';
import { Button } from './components/ui/button';
import { Loader2, BookMarked } from 'lucide-react';
import Sidebar from './components/Sidebar';
import WorkspaceView from './components/WorkspaceView';

export default function App() {
  const { user, loading, signIn } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-lg text-center space-y-6 border border-zinc-100">
          <div className="mx-auto bg-blue-100 w-16 h-16 flex items-center justify-center rounded-2xl">
              <BookMarked className="w-8 h-8 text-blue-600" />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-zinc-900 tracking-tight">ScholarSpace</h1>
            <p className="text-zinc-500">Your AI-powered academic workspace. Read, discuss, generate papers, and practice presentations with a Live Tutor.</p>
          </div>
          <Button onClick={signIn} className="w-full h-12 text-lg" size="lg">
            Sign in with Google
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-natural-bg text-natural-text font-sans">
      <Sidebar />
      <WorkspaceView />
    </div>
  );
}

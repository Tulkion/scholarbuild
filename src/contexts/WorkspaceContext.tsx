import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { Workspace } from '../types';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, doc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from './AuthContext';

interface WorkspaceContextType {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  setActiveWorkspaceId: (id: string | null) => void;
  createWorkspace: (title: string, description?: string) => Promise<string>;
  deleteWorkspace: (id: string) => Promise<void>;
  loading: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setWorkspaces([]);
      setActiveWorkspaceId(null);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'workspaces'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const results: Workspace[] = [];
      snapshot.forEach((doc) => {
        results.push({ id: doc.id, ...doc.data() } as Workspace);
      });
      setWorkspaces(results);
      if (results.length > 0 && !activeWorkspaceId) {
        setActiveWorkspaceId(results[0].id!);
      }
      setLoading(false);
    }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'workspaces');
    });

    return unsubscribe;
  }, [user, activeWorkspaceId]);

  const createWorkspace = async (title: string, description: string = '') => {
    if (!user) throw new Error("Unauthenticated");
    try {
      const now = new Date().toISOString();
      const docRef = await addDoc(collection(db, 'workspaces'), {
        userId: user.uid,
        title,
        description,
        createdAt: now,
        updatedAt: now
      });
      setActiveWorkspaceId(docRef.id);
      return docRef.id;
    } catch (error) {
       handleFirestoreError(error, OperationType.CREATE, 'workspaces');
       throw error;
    }
  };

  const deleteWorkspace = async (id: string) => {
      try {
        await deleteDoc(doc(db, 'workspaces', id));
        if (activeWorkspaceId === id) {
            setActiveWorkspaceId(null);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `workspaces/${id}`);
      }
  };

  return (
    <WorkspaceContext.Provider value={{ workspaces, activeWorkspaceId, setActiveWorkspaceId, createWorkspace, deleteWorkspace, loading }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspaces() {
  const context = useContext(WorkspaceContext);
  if (context === undefined) {
    throw new Error('useWorkspaces must be used within a WorkspaceProvider');
  }
  return context;
}

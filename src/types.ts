export interface User {
  displayName: string;
  email: string;
  createdAt: string;
}

export interface Workspace {
  id?: string;
  userId: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface Document {
  id?: string;
  workspaceId: string;
  userId: string;
  title: string;
  content: string;
  type: 'text' | 'url' | 'pdf_text';
  createdAt: string;
}

export interface Asset {
  id?: string;
  workspaceId: string;
  userId: string;
  type: 'image' | 'video' | 'paper' | 'audio' | 'presentation';
  title: string;
  url?: string;
  content?: string;
  aspectRatio?: string;
  prompt?: string;
  createdAt: string;
}

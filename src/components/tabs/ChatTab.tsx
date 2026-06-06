import React, { useState, useEffect, useRef } from 'react';
import { Workspace, Document as DocType } from '../../types';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { ScrollArea } from '../ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { Loader2, Plus, FileText, Trash2, Send, Brain, FileUp, Webhook, MapPin, BookOpen } from 'lucide-react';
import { getGenAI } from '../../lib/gemini';
import ReactMarkdown from 'react-markdown';
import * as pdfjsLib from 'pdfjs-dist';

// Point pdfjs worker to a cdn
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  isThinking?: boolean;
}

export default function ChatTab({ workspace }: { workspace: Workspace }) {
  const [documents, setDocuments] = useState<DocType[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputStr, setInputStr] = useState('');
  const [generating, setGenerating] = useState(false);
  const [highThinking, setHighThinking] = useState(false);
  const [useSearch, setUseSearch] = useState(false);
  const [useMap, setUseMap] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    const q = query(collection(db, 'documents'), where('workspaceId', '==', workspace.id));
    const unsub = onSnapshot(q, (snap) => {
      const docs: DocType[] = [];
      snap.forEach(d => docs.push({ id: d.id, ...d.data() } as DocType));
      setDocuments(docs);
      setLoadingDocs(false);
    }, (err) => handleFirestoreError(err, OperationType.GET, 'documents'));
    
    return unsub;
  }, [workspace.id]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    
    // basic text extraction
    let text = "";
    if (file.type === "application/pdf") {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const maxPages = Math.min(pdf.numPages, 30); // limit to protect firestore size
        let extracted = "";
        for (let i = 1; i <= maxPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          extracted += content.items.map((item: any) => item.str).join(" ") + "\n";
        }
        text = extracted;
      } catch (err) {
        console.error("PDF Parsing error", err);
        alert("Failed to parse PDF.");
        return;
      }
    } else {
      text = await file.text();
    }

    if (text.length > 500000) {
      text = text.substring(0, 500000); // hard limit to keep within 1MB firestore limit loosely
    }

    try {
      await addDoc(collection(db, 'documents'), {
        workspaceId: workspace.id,
        userId: workspace.userId,
        title: file.name,
        type: file.type === "application/pdf" ? 'pdf_text' : 'text',
        content: text,
        createdAt: new Date().toISOString()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'documents');
    }
    e.target.value = "";
  };

  const removeDoc = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'documents', id));
    } catch (err) {
       handleFirestoreError(err, OperationType.DELETE, `documents/${id}`);
    }
  };

  const handleSend = async () => {
    if (!inputStr.trim() || generating) return;

    const userMsg = inputStr.trim();
    setInputStr('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setGenerating(true);

    try {
      const ai = getGenAI();
      const modelName = highThinking ? "gemini-3.1-pro-preview" : "gemini-3-flash-preview";

      const systemInstruction = `You are ScholarSpace, an intelligent academic assistant.
Reference the following source documents provided by the user in your answers.
If the documents do not contain the answer, and search context is not active, say so.
DOCUMENTS:
${documents.map(d => `--- TITLE: ${d.title} ---\n${d.content}\n`).join('\n')}
`;

      const tools: any[] = [];
      if (useSearch) tools.push({ googleSearch: {} });
      if (useMap) tools.push({ googleMaps: {} });

      const config: any = {
        systemInstruction,
        // Optional thinking behavior
        ...(highThinking ? { thinkingConfig: { thinkingLevel: 'HIGH' } } : {})
      };

      if (tools.length > 0) {
        config.tools = tools;
      }

      setMessages(prev => [...prev, { role: 'model', text: '', isThinking: highThinking }]);

      // Simple one-shot stream, ignoring previous history for brevity but ideally we build history.
      const chatHistory = messages.map(m => ({ 
         role: m.role, 
         parts: [{text: m.text}] 
      }));
      // Workaround for `ai.chats.create` with stream:
      const chat = ai.chats.create({ model: modelName, config });
      // Restore history via manual contents but the SDK wants us to use `chat.sendMessage` which doesn't allow setting history simply if we didn't save the chat object.
      // So we will just use `generateContentStream` with manual history array!

      const contentsToPass = [
        ...chatHistory,
        { role: 'user', parts: [{ text: userMsg }] }
      ];

      const stream = await ai.models.generateContentStream({
        model: modelName,
        contents: contentsToPass,
        config
      });

      let fullText = '';
      for await (const chunk of stream) {
        fullText += (chunk as any).text || '';
        setMessages(prev => {
          const newMsgs = [...prev];
          newMsgs[newMsgs.length - 1] = { role: 'model', text: fullText, isThinking: false };
          return newMsgs;
        });
      }

    } catch (e: any) {
      console.error(e);
      setMessages(prev => [...prev, { role: 'model', text: '**Error generating response**: ' + e.message }]);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex w-full h-full gap-4">
      <div className="w-[280px] bg-natural-sidebar rounded-[16px] shadow-sm border border-natural-border flex flex-col overflow-hidden shadow-card">
        <div className="p-4 border-b border-natural-border bg-transparent flex items-center justify-between">
          <h2 className="font-serif font-bold text-natural-text flex items-center gap-2 text-[1.1rem]">
             <FileUp className="w-4 h-4" /> Fontes de Pesquisa
          </h2>
          <div>
            <input type="file" id="file-upload" className="hidden" accept=".txt,.pdf,.md,.csv" onChange={handleFileUpload} />
            <label htmlFor="file-upload" className="cursor-pointer bg-natural-bg border border-natural-border shadow-sm px-2 py-1 text-xs rounded hover:border-natural-accent flex items-center gap-1 font-bold transition-colors text-natural-text">
              <Plus className="w-3 h-3" /> Add
            </label>
          </div>
        </div>
        <ScrollArea className="flex-1 p-3">
          {loadingDocs ? (
            <div className="flex justify-center p-4"><Loader2 className="w-4 h-4 animate-spin text-natural-muted" /></div>
          ) : documents.length === 0 ? (
            <div className="text-center p-6 text-[0.85rem] text-natural-muted">
               Nenhuma fonte adicionada. Use o botão acima para incluir PDFs ou textos.
            </div>
          ) : (
             <div className="space-y-2">
               {documents.map(doc => (
                 <div key={doc.id} className="group relative p-3 rounded-xl border border-natural-border bg-white shadow-card hover:border-natural-accent transition-all cursor-default overflow-hidden">
                    <div className="text-[0.85rem] font-medium text-natural-text truncate max-w-[85%]">{doc.title}</div>
                    <div className="text-[0.7rem] text-natural-muted mt-1 uppercase tracking-wider">{doc.type}</div>
                    <button onClick={() => removeDoc(doc.id!)} className="absolute top-0 right-0 h-full px-2 opacity-0 group-hover:opacity-100 bg-red-50 text-red-600 hover:bg-red-100 transition-all">
                       <Trash2 className="w-3 h-3" />
                    </button>
                 </div>
               ))}
             </div>
          )}
        </ScrollArea>
      </div>

      <div className="flex-1 bg-white rounded-[16px] border border-natural-border shadow-card flex flex-col overflow-hidden">
        <ScrollArea className="flex-1 p-5 z-0 bg-transparent" ref={scrollRef}>
           <div className="space-y-4 max-w-4xl mx-auto">
             {messages.length === 0 && (
               <div className="text-center mt-20 text-natural-muted">
                  <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-serif">Assistente de Pesquisa</p>
                  <p className="text-sm">Envie fontes e tire dúvidas sobre os materiais.</p>
               </div>
             )}
             {messages.map((msg, i) => (
               <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                 <div className={`max-w-[80%] px-4 py-3 text-[0.95rem] leading-relaxed rounded-[12px] ${
                   msg.role === 'user' 
                     ? 'bg-natural-accent text-white shadow-sm ml-auto rounded-br-[2px]' 
                     : 'bg-[#F4F4F0] text-natural-text align-start rounded-bl-[2px]'
                 }`}>
                   {msg.isThinking ? (
                     <div className="flex items-center gap-2 text-natural-muted text-sm italic">
                       <Loader2 className="w-4 h-4 animate-spin" /> Pensando...
                     </div>
                   ) : (
                     <div className={msg.role === 'user' ? '' : 'prose prose-sm prose-zinc max-w-none'}>
                       {msg.role === 'model' ? <ReactMarkdown>{msg.text}</ReactMarkdown> : <span className="whitespace-pre-wrap">{msg.text}</span>}
                     </div>
                   )}
                 </div>
               </div>
             ))}
           </div>
        </ScrollArea>
        <div className="p-4 border-t border-natural-border flex flex-col gap-3 bg-transparent">
          <div className="flex items-center gap-3">
             <TextareaAutosize 
                className="w-full bg-[#FAFAFA] border border-natural-border rounded-full px-5 py-3 focus:outline-none focus:border-natural-accent resize-none min-h-[46px] max-h-32 text-sm text-natural-text"
                placeholder="Peça para revisar, debater fontes ou formatar resultados..."
                value={inputStr}
                onChange={e => setInputStr(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
             />
             <Button 
               size="lg" 
               className="rounded-full px-6 bg-natural-accent text-white font-bold h-[46px]"
               onClick={handleSend}
               disabled={!inputStr.trim() || generating}
             >
               {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enviar"}
             </Button>
          </div>
          <div className="flex items-center gap-4 px-2 mt-1">
            <label className="flex items-center gap-1.5 text-xs font-bold text-natural-muted hover:text-natural-text cursor-pointer">
              <input type="checkbox" checked={highThinking} onChange={e => setHighThinking(e.target.checked)} className="rounded accent-natural-accent" /> 
              <Brain className="w-3 h-3" /> Raciocínio Avançado
            </label>
            <label className="flex items-center gap-1.5 text-xs font-bold text-natural-muted hover:text-natural-text cursor-pointer">
              <input type="checkbox" checked={useSearch} onChange={e => { setUseSearch(e.target.checked); setUseMap(false); }} className="rounded accent-natural-accent" /> 
              <Webhook className="w-3 h-3" /> Pesquisa Web
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

// Simple auto-resizing textarea to prevent bloated dependency for one component
function TextareaAutosize(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = ref.current.scrollHeight + 'px';
    }
  }, [props.value]);

  return <textarea ref={ref} {...props} />;
}

import React, { useState, useEffect } from 'react';
import { Workspace, Asset } from '../../types';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Loader2, Image as ImageIcon, Video, PlayCircle } from 'lucide-react';
import { getGenAI } from '../../lib/gemini';
import { collection, query, where, getDocs, addDoc, onSnapshot, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';

export default function StudioTab({ workspace }: { workspace: Workspace }) {
  const [prompt, setPrompt] = useState('');
  const [type, setType] = useState<'image' | 'video'>('image');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [imageSize, setImageSize] = useState('1K');
  const [generating, setGenerating] = useState(false);
  const [useProImage, setUseProImage] = useState(false);
  
  const [assets, setAssets] = useState<Asset[]>([]);

  useEffect(() => {
    const q = query(
        collection(db, 'assets'), 
        where('workspaceId', '==', workspace.id),
        where('type', 'in', ['image', 'video']),
        orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      const docs: Asset[] = [];
      snap.forEach(d => docs.push({ id: d.id, ...d.data() } as Asset));
      setAssets(docs);
    }, (err) => {
        handleFirestoreError(err, OperationType.GET, 'assets');
    });
    return unsub;
  }, [workspace.id]);

  const handleGenerateImage = async () => {
    try {
      const ai = getGenAI();
      const modelName = useProImage ? "gemini-3-pro-image-preview" : "gemini-3.1-flash-image-preview";
      
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          imageConfig: {
            aspectRatio: aspectRatio as any,
            imageSize: imageSize as any
          }
        }
      });

      let base64 = "";
      // The format of response is different for nano-banana. Look for inlineData.
      if (response.candidates && response.candidates[0].content.parts) {
         for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
               base64 = part.inlineData.data;
               break;
            }
         }
      }

      if (base64) {
         const url = `data:image/png;base64,${base64}`;
         await addDoc(collection(db, 'assets'), {
             workspaceId: workspace.id,
             userId: workspace.userId,
             type: 'image',
             title: prompt.substring(0, 50),
             prompt: prompt,
             url: url,
             aspectRatio,
             createdAt: new Date().toISOString()
         });
      } else {
         throw new Error("No image data returned.");
      }
    } catch (e: any) {
      console.error(e);
      alert("Error generating image: " + e.message);
    }
  };

  const handleGenerateVideo = async () => {
      try {
         const ai = getGenAI();
         // Using fast generate preview (lite) as requested
         const modelName = 'veo-3.1-lite-generate-preview';
         
         let operation = await ai.models.generateVideos({
           model: modelName,
           prompt: prompt,
           config: {
             numberOfVideos: 1,
             resolution: '720p',
             aspectRatio: aspectRatio as any
           }
         });

         // Show placeholder while polling
         const tempId = Date.now().toString();
         setAssets(prev => [{
            id: tempId,
            workspaceId: workspace.id,
            userId: workspace.userId,
            type: 'video',
            title: prompt.substring(0, 50),
            prompt,
            aspectRatio,
            createdAt: new Date().toISOString(),
            url: 'processing' // special flag
         }, ...prev]);

         while (!operation.done) {
            await new Promise(resolve => setTimeout(resolve, 10000));
            operation = await ai.operations.getVideosOperation({operation: operation});
         }

         const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
         if (downloadLink) {
             const response = await fetch(downloadLink, {
               method: 'GET',
               headers: {
                 'x-goog-api-key': process.env.GEMINI_API_KEY || '',
               },
             });
             const blob = await response.blob();
             const url = URL.createObjectURL(blob);
             
             await addDoc(collection(db, 'assets'), {
                 workspaceId: workspace.id,
                 userId: workspace.userId,
                 type: 'video',
                 title: prompt.substring(0, 50),
                 prompt: prompt,
                 url: url,
                 aspectRatio,
                 createdAt: new Date().toISOString()
             });

             // Remove the temp from local state, the snapshot will catch real one
             setAssets(prev => prev.filter(a => a.id !== tempId));
         }

      } catch (e: any) {
          console.error(e);
          alert("Error generating video: " + e.message);
          // Remove temp
           setAssets(prev => prev.filter(a => a.url !== 'processing'));
      }
  };

  const handleGenerate = async () => {
     if (!prompt.trim() || generating) return;
     setGenerating(true);
     if (type === 'image') {
        await handleGenerateImage();
     } else {
        await handleGenerateVideo();
     }
     setGenerating(false);
  };

  return (
    <div className="flex w-full h-full gap-4">
       <div className="w-[340px] bg-natural-sidebar rounded-[16px] shadow-sm border border-natural-border flex flex-col p-5 space-y-6 shadow-card">
         <div className="pb-4 border-b border-natural-border">
           <h2 className="text-[1.1rem] font-serif font-bold text-natural-text">Media Studio</h2>
           <p className="text-[0.8rem] text-natural-muted mt-1 leading-relaxed">Generate illustration images and dynamic videos for your presentations.</p>
         </div>

         <div className="space-y-4 text-[0.85rem] font-medium">
             <div className="space-y-2">
                 <label className="text-natural-muted uppercase tracking-wider text-[0.7rem] font-bold">Type</label>
                 <div className="grid grid-cols-2 gap-2">
                     <Button 
                       variant={type === 'image' ? 'default' : 'outline'} 
                       onClick={() => { setType('image'); }}
                       className={`w-full h-10 ${type === 'image' ? 'bg-natural-accent text-white' : 'bg-transparent border-natural-accent text-natural-accent'}`}
                     >
                         <ImageIcon className="w-4 h-4 mr-2" /> Image
                     </Button>
                     <Button 
                       variant={type === 'video' ? 'default' : 'outline'} 
                       onClick={() => { setType('video'); setAspectRatio('16:9'); }}
                       className={`w-full h-10 ${type === 'video' ? 'bg-natural-accent text-white' : 'bg-transparent border-natural-accent text-natural-accent'}`}
                     >
                         <Video className="w-4 h-4 mr-2" /> Video
                     </Button>
                 </div>
             </div>

             <div className="space-y-2">
                 <label className="text-natural-muted uppercase tracking-wider text-[0.7rem] font-bold">Aspect Ratio</label>
                 <Select value={aspectRatio} onValueChange={setAspectRatio}>
                     <SelectTrigger className="w-full bg-[#FAFAFA] border-natural-border rounded-[12px]">
                        <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                         {type === 'image' && <SelectItem value="1:1">1:1 Square</SelectItem>}
                         <SelectItem value="16:9">16:9 Landscape</SelectItem>
                         <SelectItem value="9:16">9:16 Portrait</SelectItem>
                         {type === 'image' && <SelectItem value="3:4">3:4 Portrait</SelectItem>}
                         {type === 'image' && <SelectItem value="4:3">4:3 Landscape</SelectItem>}
                     </SelectContent>
                 </Select>
             </div>

             {type === 'image' && (
               <div className="space-y-2">
                   <label className="text-natural-muted uppercase tracking-wider text-[0.7rem] font-bold">Resolution & Quality</label>
                   <Select value={imageSize} onValueChange={setImageSize}>
                       <SelectTrigger className="w-full bg-[#FAFAFA] border-natural-border rounded-[12px]">
                          <SelectValue />
                       </SelectTrigger>
                       <SelectContent>
                           <SelectItem value="512px">512px (Fast)</SelectItem>
                           <SelectItem value="1K">1K (Standard)</SelectItem>
                           <SelectItem value="2K">2K (High)</SelectItem>
                           <SelectItem value="4K">4K (Ultra)</SelectItem>
                       </SelectContent>
                   </Select>
                   <label className="flex items-center gap-2 text-[0.75rem] font-medium text-natural-muted hover:text-natural-text mt-2 cursor-pointer">
                      <input type="checkbox" checked={useProImage} onChange={e => setUseProImage(e.target.checked)} className="rounded accent-natural-accent h-3 w-3" /> 
                      Use Pro Image Model (Studio Quality)
                   </label>
               </div>
             )}

             <div className="space-y-2">
                 <label className="text-natural-muted uppercase tracking-wider text-[0.7rem] font-bold">Prompt Instructions</label>
                 <Textarea 
                   className="min-h-[100px] resize-none text-[0.85rem] p-3 rounded-[12px] bg-[#FAFAFA] border-natural-border focus:border-natural-accent" 
                   value={prompt}
                   onChange={e => setPrompt(e.target.value)}
                   placeholder="Describe what you want to generate in detail..."
                 />
             </div>

             <Button 
                className="w-full h-[46px] rounded-[12px] bg-natural-accent text-white font-bold transition-colors" 
                onClick={handleGenerate}
                disabled={generating || !prompt.trim()}
             >
                 {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : type === 'image' ? <ImageIcon className="w-4 h-4 mr-2" /> : <Video className="w-4 h-4 mr-2" />}
                 {generating ? "Generating..." : "Generate Media"}
             </Button>
         </div>
       </div>

       <div className="flex-1 bg-white rounded-[16px] shadow-card border border-natural-border overflow-y-auto p-6 relative">
          <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-6">
              {assets.map(asset => (
                  <div key={asset.id} className="bg-[#F9F7F2] rounded-xl shadow-sm border border-natural-border p-2 flex flex-col gap-2 transition-transform hover:-translate-y-1 hover:shadow-md">
                      <div className="relative aspect-video bg-natural-bg rounded-lg overflow-hidden flex items-center justify-center border border-natural-border/50">
                          {asset.url === 'processing' ? (
                              <div className="flex flex-col items-center gap-2 text-natural-accent">
                                  <Loader2 className="w-6 h-6 animate-spin" />
                                  <span className="text-xs font-serif italic">Generating Video...</span>
                              </div>
                          ) : asset.type === 'video' ? (
                              <video src={asset.url} controls className="w-full h-full object-cover" />
                          ) : (
                              <img src={asset.url} alt={asset.title} className="w-full h-full object-cover" />
                          )}
                          {asset.type === 'video' && asset.url !== 'processing' && <PlayCircle className="absolute inset-0 m-auto text-white opacity-50 pointer-events-none w-10 h-10 drop-shadow-md" />}
                      </div>
                      <div className="px-1 py-1">
                          <p className="text-[0.85rem] font-medium text-natural-text line-clamp-1" title={asset.title}>{asset.title}</p>
                          <p className="text-[0.7rem] text-natural-muted mt-1 uppercase tracking-wider">{asset.type} • {asset.aspectRatio}</p>
                      </div>
                  </div>
              ))}
              {assets.length === 0 && (
                  <div className="col-span-full h-40 flex items-center justify-center text-natural-muted text-sm font-serif italic">
                      No media generated yet.
                  </div>
              )}
          </div>
       </div>
    </div>
  );
}
